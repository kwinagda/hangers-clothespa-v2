const axios = require('axios');
const { getWhatsAppTemplates } = require('./masterData.service');

const DEFAULT_TEMPLATE_ENDPOINT = 'https://whatomate-production-949e.up.railway.app/api/messages/template';

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

const invoiceSlugFor = (order, config) => {
  const field = config?.invoiceSlugField || 'orderNumber';
  return String(order?.[field] || order?.orderNumber || order?.id || '').trim();
};

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

const postTemplate = async ({ phone, templateName, templateParams, buttonParams, accountName }) => {
  if (!phone || !templateName) return false;

  const payload = {
    phone_number: normalizePhone(phone),
    template_name: templateName,
    template_params: templateParams || {},
    button_params: buttonParams || {},
    account_name: process.env.WHATOMATE_ACCOUNT_NAME || accountName || 'Hangers',
  };

  if (!isEnabled()) {
    console.log('[Whatomate DEV] Would send template:', JSON.stringify(payload));
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
    console.error('[Whatomate] Template send failed:', err?.response?.data || err.message);
    return false;
  }
};

const sendOrderStatusMessage = async (order, status) => {
  const phone = order?.customer?.phone;
  if (!phone) return false;

  const config = await getWhatsAppTemplates();
  const template = config?.orderStatus?.[status];
  if (!template?.templateName) return false;

  const sent = await postTemplate({
    phone,
    templateName: template.templateName,
    templateParams: buildTemplateParams(template.params, { order }),
    buttonParams: { [config.invoiceButtonIndex || '0']: invoiceSlugFor(order, config) },
    accountName: config.accountName,
  });

  if (sent) console.log(`[Whatomate] ${status} template sent to ${phone}`);
  return sent;
};

const sendPaymentReceivedMessage = async (order, amount, method) => {
  const phone = order?.customer?.phone;
  if (!phone) return false;

  const config = await getWhatsAppTemplates();
  const template = config?.paymentReceived;
  if (!template?.templateName) return false;

  const sent = await postTemplate({
    phone,
    templateName: template.templateName,
    templateParams: buildTemplateParams(template.params, {
      order,
      payment: { amount, method },
    }),
    buttonParams: { [config.invoiceButtonIndex || '0']: invoiceSlugFor(order, config) },
    accountName: config.accountName,
  });

  if (sent) console.log(`[Whatomate] Payment template sent to ${phone}`);
  return sent;
};

const dailyIronLogSlugFor = (iron) => String(iron?.subscription?.id || iron?.subscriptionId || '').trim();

const sendDailyIronTemplate = async ({ customer, subscription, template, templateConfig, context, payment }) => {
  const phone = customer?.phone;
  if (!phone || !template?.templateName) return false;

  const buttonIndex = templateConfig?.dailyIron?.logButtonIndex || '0';
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
    buttonParams: { [buttonIndex]: dailyIronLogSlugFor({ subscription }) },
    accountName: templateConfig.accountName,
  });

  if (sent) console.log(`[Whatomate] Daily Iron template ${template.templateName} sent to ${phone}`);
  return sent;
};

const sendDailyIronLogMessage = async ({ customer, subscription, log, monthToDate }) => {
  const config = await getWhatsAppTemplates();
  return sendDailyIronTemplate({
    customer,
    subscription,
    template: config?.dailyIron?.logUpdated,
    templateConfig: config,
    context: { log, monthToDate },
  });
};

const sendDailyIronBillMessage = async ({ customer, subscription, bill }) => {
  const config = await getWhatsAppTemplates();
  return sendDailyIronTemplate({
    customer,
    subscription,
    template: config?.dailyIron?.monthlyBill,
    templateConfig: config,
    context: { bill },
  });
};

const sendDailyIronPaymentMessage = async ({ customer, subscription, bill, amount, method }) => {
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
  });
};

module.exports = {
  sendOrderStatusMessage,
  sendPaymentReceivedMessage,
  sendDailyIronLogMessage,
  sendDailyIronBillMessage,
  sendDailyIronPaymentMessage,
  postTemplate,
};
