const axios = require('axios');
const { getWhatsAppTemplates } = require('./masterData.service');

const DEFAULT_TEMPLATE_ENDPOINT = 'https://whatomate-production-949e.up.railway.app/api/messages/template';

const isEnabled = () => {
  const key = process.env.WHATOMATE_API_KEY || '';
  return Boolean(key && key.length > 10 && process.env.DEV_MODE !== 'true');
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

const resolveParam = ({ name, order, payment }) => {
  const customer = order?.customer || {};
  const values = {
    customerName: customer.name || 'Customer',
    orderNumber: order?.orderNumber || '',
    totalAmount: formatAmount(order?.totalAmount),
    expectedDelivery: formatDate(order?.deliveryDate),
    balanceDue: formatAmount(orderBalance(order)),
    paymentAmount: formatAmount(payment?.amount),
    paymentMethod: payment?.method || '',
  };
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

module.exports = {
  sendOrderStatusMessage,
  sendPaymentReceivedMessage,
  postTemplate,
};
