// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP ORDER NOTIFICATIONS — Auto-send to customer on key status changes
// Uses Meta Business API with pre-approved templates
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const { DEFAULT_LANGUAGE, LANGUAGE_CODES } = require('../config/master-data');

const META_API_BASE = 'https://graph.facebook.com/v20.0';

const isDevMode = () => {
  const t = process.env.META_WA_ACCESS_TOKEN || '';
  return !t || t === 'YOUR_META_ACCESS_TOKEN' || t.length < 20;
};

const normalizePhone = (phone) => {
  const c = phone.replace(/[\s\-\(\)\+]/g, '');
  if (c.startsWith('91') && c.length === 12) return c;
  if (c.length === 10) return `91${c}`;
  return c;
};

// Which statuses trigger a WhatsApp message
const NOTIFY_STATUSES = {
  PICKED_UP:            { template: 'hangers_picked_up',   label: 'Picked Up'              },
  READY_FOR_DELIVERY:   { template: 'hangers_ready',       label: 'Ready for Delivery'     },
  OUT_FOR_DELIVERY:     { template: 'hangers_out_delivery', label: 'Out for Delivery'       },
  DELIVERED:            { template: 'hangers_delivered',    label: 'Delivered'              },
};

const IRON_LOG_TEMPLATES = {
  ENGLISH: 'hangers_iron_log_en',
  HINDI: 'hangers_iron_log_hi',
  MARATHI: 'hangers_iron_log_mr',
};

const IRON_BILL_TEMPLATES = {
  ENGLISH: 'hangers_iron_bill_en',
  HINDI: 'hangers_iron_bill_hi',
  MARATHI: 'hangers_iron_bill_mr',
};

const sendTemplateMessage = async ({ phone, templateName, language = 'en', parameters = [] }) => {
  if (!phone || !templateName) return false;

  if (isDevMode()) {
    console.log(`\n[WA DEV] Would send "${templateName}" to ${phone} with ${parameters.length} params`);
    return true;
  }

  try {
    const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
    const accessToken = process.env.META_WA_ACCESS_TOKEN;
    const waPhone = normalizePhone(phone);

    await axios.post(
      `${META_API_BASE}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: waPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          components: [
            {
              type: 'body',
              parameters: parameters.map((text) => ({ type: 'text', text: String(text ?? '') })),
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );

    return true;
  } catch (err) {
    console.error('WhatsApp notification failed:', err?.response?.data || err.message);
    return false;
  }
};

/**
 * Send a WhatsApp template message to the customer when order status changes.
 * Called from orders.controller.js → updateStatus
 *
 * @param {object} order  - full order object with customer relation
 * @param {string} status - new status
 */
const sendStatusNotification = async (order, status) => {
  const notif = NOTIFY_STATUSES[status];
  if (!notif) return; // No message for this status

  const phone      = order.customer?.phone;
  const name       = order.customer?.name || 'Customer';
  const orderNum   = order.orderNumber;

  if (!phone) return;

  const sent = await sendTemplateMessage({
    phone,
    templateName: notif.template,
    language: 'en',
    parameters: [name, orderNum],
  });

  if (sent) console.log(`WA notification sent to ${phone} - ${notif.label}`);
};

const sendIronLogNotification = async ({ customer, log, monthToDate }) => {
  const language = customer?.preferredLanguage || DEFAULT_LANGUAGE;
  return sendTemplateMessage({
    phone: customer?.phone,
    templateName: IRON_LOG_TEMPLATES[language] || IRON_LOG_TEMPLATES[DEFAULT_LANGUAGE],
    language: LANGUAGE_CODES[language] || 'en',
    parameters: [
      customer?.name || 'Customer',
      log?.pieces || 0,
      log?.serviceName || 'Garment',
      log?.dateLabel || '',
      monthToDate?.pieces || 0,
      monthToDate?.amount || 0,
    ],
  });
};

const sendIronBillNotification = async ({ customer, bill }) => {
  const language = customer?.preferredLanguage || DEFAULT_LANGUAGE;
  return sendTemplateMessage({
    phone: customer?.phone,
    templateName: IRON_BILL_TEMPLATES[language] || IRON_BILL_TEMPLATES[DEFAULT_LANGUAGE],
    language: LANGUAGE_CODES[language] || 'en',
    parameters: [
      customer?.name || 'Customer',
      bill?.monthLabel || '',
      bill?.totalPieces || 0,
      bill?.totalAmount || 0,
      bill?.billNumber || '',
    ],
  });
};

module.exports = {
  sendStatusNotification,
  sendIronLogNotification,
  sendIronBillNotification,
};
