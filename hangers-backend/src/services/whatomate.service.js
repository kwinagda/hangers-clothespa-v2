const axios = require('axios');
const { getWhatsAppTemplates } = require('./masterData.service');
const { createPublicShareToken } = require('./publicShare.service');
const { maskPhone, providerErrorSummary } = require('../utils/redact');

const DEFAULT_TEMPLATE_ENDPOINT = 'https://whatomate-production-949e.up.railway.app/api/messages/template';

class WhatomateDeliveryError extends Error {
  constructor(message, { retryable = false, statusCode = null, code = null } = {}) {
    super(message);
    this.name = 'WhatomateDeliveryError';
    this.retryable = retryable;
    this.statusCode = statusCode;
    this.code = code;
  }
}

const isEnabled = () => {
  const key = process.env.WHATOMATE_API_KEY || '';
  const devSendAllowed = process.env.WHATOMATE_SEND_IN_DEV === 'true';
  return Boolean(key && key.length > 10 && (process.env.DEV_MODE !== 'true' || devSendAllowed));
};

const normalizePhone = (phone) => {
  const c = String(phone || '').replace(/[\s\-()+]/g, '');
  if (c.startsWith('91') && c.length === 12) return c;
  if (c.length === 10) return `91${c}`;
  return c;
};

const formatAmount = (amount) => {
  const n = Number(amount || 0);
  return Number.isFinite(n) ? String(Math.max(0, Number(n.toFixed(2)))) : '0';
};

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
};

const formatMonth = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const orderBalance = (order) => {
  const total = Number(order?.totalAmount || 0);
  const paid = Number(order?.paidAmount || 0);
  const writeOff = Number(order?.writeOffAmount || 0);
  return Math.max(0, Number((total - paid - writeOff).toFixed(2)));
};

const invoiceSlugFor = async (order) => createPublicShareToken({
  resourceType: 'ORDER',
  resourceId: order?.id,
  purpose: 'INVOICE_VIEW',
});

const ironBalance = (bill) => {
  const total = Number(bill?.totalAmount || 0);
  const paid = Number(bill?.paidAmount || 0);
  return Math.max(0, Number((total - paid).toFixed(2)));
};

const resolveParam = ({ name, order, payment, iron }) => {
  const customer = order?.customer || {};
  const ironCustomer = iron?.customer || {};
  const log = iron?.log || {};
  const bill = iron?.bill || {};
  const monthToDate = iron?.monthToDate || {};
  const values = {
    customerName: customer.name || 'Customer',
    orderNumber: order?.orderNumber || '',
    totalAmount: formatAmount(order?.totalAmount),
    expectedDelivery: formatDate(order?.deliveryDate),
    balanceDue: formatAmount(orderBalance(order)),
    updatedTotalAmount: formatAmount(order?.totalAmount),
    paymentAmount: formatAmount(payment?.amount),
    paymentMethod: payment?.method || '',
    ironCustomerName: ironCustomer.name || 'Customer',
    logDate: formatDate(log?.date),
    logPieces: String(log?.pieces || 0),
    logServiceName: log?.serviceName || 'Daily Iron',
    monthToDatePieces: String(monthToDate?.pieces || 0),
    monthToDateAmount: formatAmount(monthToDate?.amount),
    billMonth: formatMonth(bill?.billingPeriodStart || bill?.billingPeriodEnd),
    billPieces: String(bill?.totalPieces || 0),
    billAmount: formatAmount(bill?.totalAmount),
    ironBalanceDue: formatAmount(ironBalance(bill)),
  };
  if (name === 'customerName' && ironCustomer.name) return ironCustomer.name;
  if (name === 'balanceDue' && iron?.bill) return values.ironBalanceDue;
  return values[name] ?? '';
};

const buildTemplateParams = (paramNames, context) =>
  Object.fromEntries((paramNames || []).map((name, index) => [String(index + 1), resolveParam({ name, ...context })]));

const maybeThrow = (condition, error) => {
  if (condition) throw error;
  return false;
};

const isRetryableHttpStatus = (status) => status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

const postTemplate = async ({ phone, templateName, templateParams, buttonParams, accountName, throwOnFailure = false }) => {
  if (!phone) {
    return maybeThrow(throwOnFailure, new WhatomateDeliveryError('Missing customer phone for WhatsApp template', {
      retryable: false,
      code: 'MISSING_PHONE',
    }));
  }
  if (!templateName) {
    return maybeThrow(throwOnFailure, new WhatomateDeliveryError('Missing WhatsApp template name', {
      retryable: false,
      code: 'MISSING_TEMPLATE',
    }));
  }

  const payload = {
    phone_number: normalizePhone(phone),
    template_name: templateName,
    template_params: templateParams || {},
    button_params: buttonParams || {},
    account_name: process.env.WHATOMATE_ACCOUNT_NAME || accountName || 'Hangers',
  };

  if (!isEnabled()) {
    console.log('[Whatomate DEV] Template send simulated:', {
      phone: maskPhone(phone),
      templateName,
      paramCount: Object.keys(templateParams || {}).length,
      buttonCount: Object.keys(buttonParams || {}).length,
    });
    return true;
  }

  try {
    await axios.post(
      process.env.WHATOMATE_TEMPLATE_URL || DEFAULT_TEMPLATE_ENDPOINT,
      payload,
      {
        headers: {
          'X-API-Key': process.env.WHATOMATE_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return true;
  } catch (err) {
    const statusCode = err?.response?.status || null;
    const retryable = !statusCode || isRetryableHttpStatus(statusCode);
    const providerMessage = err?.response?.data?.message || err?.response?.data?.error || err.message || 'Template send failed';
    console.error('[Whatomate] Template send failed:', providerErrorSummary(err));
    if (throwOnFailure) {
      throw new WhatomateDeliveryError(providerMessage, {
        retryable,
        statusCode,
        code: retryable ? 'PROVIDER_RETRYABLE_FAILURE' : 'PROVIDER_PERMANENT_FAILURE',
      });
    }
    return false;
  }
};

const sendOrderStatusMessage = async (order, status, options = {}) => {
  const phone = order?.customer?.phone;
  if (!phone) {
    return maybeThrow(options.throwOnFailure, new WhatomateDeliveryError('Missing customer phone for order status message', {
      retryable: false,
      code: 'MISSING_PHONE',
    }));
  }

  const config = await getWhatsAppTemplates();
  const template = config?.orderStatus?.[status];
  if (!template?.templateName) {
    return maybeThrow(options.throwOnFailure, new WhatomateDeliveryError(`No WhatsApp template configured for order status ${status}`, {
      retryable: false,
      code: 'MISSING_TEMPLATE',
    }));
  }
  const invoiceSlug = await invoiceSlugFor(order);
  if (!invoiceSlug) {
    return maybeThrow(options.throwOnFailure, new WhatomateDeliveryError('Could not create public invoice token', {
      retryable: true,
      code: 'PUBLIC_TOKEN_CREATE_FAILED',
    }));
  }

  const sent = await postTemplate({
    phone,
    templateName: template.templateName,
    templateParams: buildTemplateParams(template.params, { order }),
    buttonParams: { [config.invoiceButtonIndex || '0']: invoiceSlug },
    accountName: config.accountName,
    throwOnFailure: options.throwOnFailure,
  });

  if (sent) console.log(`[Whatomate] ${status} template sent to ${maskPhone(phone)}`);
  return sent;
};

const sendPaymentReceivedMessage = async (order, amount, method, options = {}) => {
  const phone = order?.customer?.phone;
  if (!phone) {
    return maybeThrow(options.throwOnFailure, new WhatomateDeliveryError('Missing customer phone for payment message', {
      retryable: false,
      code: 'MISSING_PHONE',
    }));
  }

  const config = await getWhatsAppTemplates();
  const template = config?.paymentReceived;
  if (!template?.templateName) {
    return maybeThrow(options.throwOnFailure, new WhatomateDeliveryError('No WhatsApp payment template configured', {
      retryable: false,
      code: 'MISSING_TEMPLATE',
    }));
  }
  const invoiceSlug = await invoiceSlugFor(order);
  if (!invoiceSlug) {
    return maybeThrow(options.throwOnFailure, new WhatomateDeliveryError('Could not create public invoice token', {
      retryable: true,
      code: 'PUBLIC_TOKEN_CREATE_FAILED',
    }));
  }

  const sent = await postTemplate({
    phone,
    templateName: template.templateName,
    templateParams: buildTemplateParams(template.params, {
      order,
      payment: { amount, method },
    }),
    buttonParams: { [config.invoiceButtonIndex || '0']: invoiceSlug },
    accountName: config.accountName,
    throwOnFailure: options.throwOnFailure,
  });

  if (sent) console.log(`[Whatomate] Payment template sent to ${maskPhone(phone)}`);
  return sent;
};

const sendOrderUpdatedMessage = async (order, options = {}) => {
  const phone = order?.customer?.phone;
  if (!phone) {
    return maybeThrow(options.throwOnFailure, new WhatomateDeliveryError('Missing customer phone for order update message', {
      retryable: false,
      code: 'MISSING_PHONE',
    }));
  }

  const config = await getWhatsAppTemplates();
  const template = config?.orderUpdated;
  if (!template?.templateName) {
    return maybeThrow(options.throwOnFailure, new WhatomateDeliveryError('No WhatsApp order update template configured', {
      retryable: false,
      code: 'MISSING_TEMPLATE',
    }));
  }
  const invoiceSlug = await invoiceSlugFor(order);
  if (!invoiceSlug) {
    return maybeThrow(options.throwOnFailure, new WhatomateDeliveryError('Could not create public invoice token', {
      retryable: true,
      code: 'PUBLIC_TOKEN_CREATE_FAILED',
    }));
  }

  const sent = await postTemplate({
    phone,
    templateName: template.templateName,
    templateParams: buildTemplateParams(template.params, { order }),
    buttonParams: { [config.invoiceButtonIndex || '0']: invoiceSlug },
    accountName: config.accountName,
    throwOnFailure: options.throwOnFailure,
  });

  if (sent) console.log(`[Whatomate] Order updated template sent to ${maskPhone(phone)}`);
  return sent;
};

const dailyIronLogSlugFor = async (iron) => createPublicShareToken({
  resourceType: 'IRON_SUBSCRIPTION',
  resourceId: iron?.subscription?.id || iron?.subscriptionId,
  purpose: 'DAILY_IRON_LOGS',
});

const sendDailyIronTemplate = async ({ customer, subscription, template, templateConfig, context, payment, throwOnFailure = false }) => {
  const phone = customer?.phone;
  if (!phone) {
    return maybeThrow(throwOnFailure, new WhatomateDeliveryError('Missing customer phone for Daily Iron message', {
      retryable: false,
      code: 'MISSING_PHONE',
    }));
  }
  if (!template?.templateName) {
    return maybeThrow(throwOnFailure, new WhatomateDeliveryError('No WhatsApp Daily Iron template configured', {
      retryable: false,
      code: 'MISSING_TEMPLATE',
    }));
  }

  const buttonIndex = templateConfig?.dailyIron?.logButtonIndex || '0';
  const dailyIronSlug = await dailyIronLogSlugFor({ subscription });
  if (!dailyIronSlug) {
    return maybeThrow(throwOnFailure, new WhatomateDeliveryError('Could not create public Daily Iron token', {
      retryable: true,
      code: 'PUBLIC_TOKEN_CREATE_FAILED',
    }));
  }
  const sent = await postTemplate({
    phone,
    templateName: template.templateName,
    templateParams: buildTemplateParams(template.params, {
      iron: {
        ...context,
        customer,
        subscription,
      },
      payment,
    }),
    buttonParams: { [buttonIndex]: dailyIronSlug },
    accountName: templateConfig.accountName,
    throwOnFailure,
  });

  if (sent) console.log(`[Whatomate] Daily Iron template ${template.templateName} sent to ${maskPhone(phone)}`);
  return sent;
};

const sendDailyIronLogMessage = async ({ customer, subscription, log, monthToDate, throwOnFailure = false }) => {
  const config = await getWhatsAppTemplates();
  return sendDailyIronTemplate({
    customer,
    subscription,
    template: config?.dailyIron?.logUpdated,
    templateConfig: config,
    context: { log, monthToDate },
    throwOnFailure,
  });
};

const sendDailyIronBillMessage = async ({ customer, subscription, bill, throwOnFailure = false }) => {
  const config = await getWhatsAppTemplates();
  return sendDailyIronTemplate({
    customer,
    subscription,
    template: config?.dailyIron?.monthlyBill,
    templateConfig: config,
    context: { bill },
    throwOnFailure,
  });
};

const sendDailyIronPaymentMessage = async ({ customer, subscription, bill, amount, method, throwOnFailure = false }) => {
  const config = await getWhatsAppTemplates();
  return sendDailyIronTemplate({
    customer,
    subscription,
    template: config?.dailyIron?.paymentReceived,
    templateConfig: config,
    context: {
      bill,
    },
    payment: { amount, method },
    throwOnFailure,
  });
};

module.exports = {
  sendOrderStatusMessage,
  sendPaymentReceivedMessage,
  sendOrderUpdatedMessage,
  sendDailyIronLogMessage,
  sendDailyIronBillMessage,
  sendDailyIronPaymentMessage,
  postTemplate,
  WhatomateDeliveryError,
};
