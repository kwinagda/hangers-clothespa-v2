// ─────────────────────────────────────────────────────────────────────────────
// WHATOMATE — WhatsApp notifications via WhatOmate API
// Set WHATOMATE_API_URL and WHATOMATE_API_KEY in .env
// All order status templates are defined here as plain-text messages.
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');

const isEnabled = () => {
  const key = process.env.WHATOMATE_API_KEY || '';
  return key && key.length > 5 && process.env.DEV_MODE !== 'true';
};

const normalizePhone = (phone) => {
  const c = phone.replace(/[\s\-\(\)\+]/g, '');
  if (c.startsWith('91') && c.length === 12) return c;
  if (c.length === 10) return `91${c}`;
  return c;
};

// ── Send a plain-text WhatsApp message via WhatOmate ─────────────────────────
const sendWhatsApp = async (phone, message) => {
  if (!phone || !message) return false;

  const apiUrl = process.env.WHATOMATE_API_URL || 'https://app.whatomate.com/api/v1/message';
  const apiKey = process.env.WHATOMATE_API_KEY || '';

  if (!isEnabled()) {
    console.log(`\n[WhatOmate DEV] Would send to ${phone}:\n${message}\n`);
    return true;
  }

  try {
    const waPhone = normalizePhone(phone);
    await axios.post(
      apiUrl,
      {
        phoneNumber: waPhone,
        message,
        type: 'text',
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );
    return true;
  } catch (err) {
    console.error('[WhatOmate] Send failed:', err?.response?.data || err.message);
    return false;
  }
};

// ── Order status message templates ────────────────────────────────────────────
const STATUS_MESSAGES = {
  PENDING: (name, orderNum) =>
    `Hi ${name}! ✅ Your order #${orderNum} with Hangers Clothes Spa has been placed successfully. We will arrange a pickup shortly. Thank you for choosing us!`,

  PICKED_UP: (name, orderNum) =>
    `Hi ${name}! 🧺 Your garments for order #${orderNum} have been picked up by our team. We'll take great care of them — stay tuned for updates!`,

  SENT_TO_PLANT: (name, orderNum) =>
    `Hi ${name}! 🏭 Your garments (order #${orderNum}) have been sent to our expert cleaning plant for full treatment. We'll notify you when they're back!`,

  PROCESSING: (name, orderNum) =>
    `Hi ${name}! 🎉 Your garments from order #${orderNum} are back from the plant and going through our quality check. Almost ready!`,

  IRONING: (name, orderNum) =>
    `Hi ${name}! 👔 Your garments (order #${orderNum}) are now being professionally pressed and finished. Looking great — nearly done!`,

  READY_FOR_DELIVERY: (name, orderNum) =>
    `Hi ${name}! ✨ Your order #${orderNum} is ready for delivery! Freshly cleaned, ironed, and packed with care. Our team will be heading your way soon.`,

  OUT_FOR_DELIVERY: (name, orderNum) =>
    `Hi ${name}! 🚴 Your garments are on the way! Order #${orderNum} is out for delivery. Please be available to receive them at your doorstep.`,

  DELIVERED: (name, orderNum) =>
    `Hi ${name}! 🌟 Order #${orderNum} has been delivered. Thank you for choosing Hangers Clothes Spa! We hope your garments look and feel perfect. See you soon! 🙏`,

  CANCELLED: (name, orderNum) =>
    `Hi ${name}. Your order #${orderNum} with Hangers Clothes Spa has been cancelled. If you have any questions, please call us at ${process.env.SHOP_PHONE || '+91 7977417014'}.`,
};

// ── Send status notification ──────────────────────────────────────────────────
const sendOrderStatusMessage = async (order, status) => {
  const template = STATUS_MESSAGES[status];
  if (!template) return;

  const phone   = order.customer?.phone;
  const name    = order.customer?.name || 'Customer';
  const orderNum = order.orderNumber;

  if (!phone) return;

  const message = template(name, orderNum);
  const sent = await sendWhatsApp(phone, message);
  if (sent) console.log(`[WhatOmate] ${status} notification sent to ${phone}`);
};

// ── Send payment received notification ────────────────────────────────────────
const sendPaymentReceivedMessage = async (order, amount) => {
  const phone   = order.customer?.phone;
  const name    = order.customer?.name || 'Customer';
  const orderNum = order.orderNumber;

  if (!phone) return;

  const message = `Hi ${name}! 💳 Payment of ₹${amount} received for order #${orderNum}. Thank you! Your receipt has been recorded. We appreciate your business at Hangers Clothes Spa! 🙏`;
  const sent = await sendWhatsApp(phone, message);
  if (sent) console.log(`[WhatOmate] Payment notification sent to ${phone}`);
};

module.exports = {
  sendWhatsApp,
  sendOrderStatusMessage,
  sendPaymentReceivedMessage,
  STATUS_MESSAGES,
};
