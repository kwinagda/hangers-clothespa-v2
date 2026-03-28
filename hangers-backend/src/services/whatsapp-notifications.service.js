// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP ORDER NOTIFICATIONS — Auto-send to customer on key status changes
// Uses Meta Business API with pre-approved templates
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');

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

  if (isDevMode()) {
    console.log(`\n📱 [WA DEV] Would send "${notif.template}" to ${phone} for order ${orderNum} (${notif.label})`);
    return;
  }

  try {
    const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
    const accessToken   = process.env.META_WA_ACCESS_TOKEN;
    const waPhone       = normalizePhone(phone);

    // Template parameters: {{1}} = customer name, {{2}} = order number
    // Adjust parameters to match your approved Meta templates
    const payload = {
      messaging_product: 'whatsapp',
      to:   waPhone,
      type: 'template',
      template: {
        name:     notif.template,
        language: { code: 'en_US' },
        components: [
          {
            type:       'body',
            parameters: [
              { type: 'text', text: name     },
              { type: 'text', text: orderNum },
            ],
          },
        ],
      },
    };

    await axios.post(
      `${META_API_BASE}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );

    console.log(`✅ WA notification sent to ${phone} — ${notif.label}`);
  } catch (err) {
    // Non-blocking — log but don't crash the status update
    console.error('WhatsApp notification failed:', err?.response?.data || err.message);
  }
};

module.exports = { sendStatusNotification };
