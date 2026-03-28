// ─────────────────────────────────────────────────────────────────────────────
// PUSH NOTIFICATION SERVICE — Expo push notifications (server-side)
// Requires: expo-server-sdk  (npm install expo-server-sdk)
// ─────────────────────────────────────────────────────────────────────────────

let Expo;
try {
  ({ Expo } = require('expo-server-sdk'));
} catch {
  // expo-server-sdk not installed yet — push notifications silently disabled
}

const expo = Expo ? new Expo() : null;

/**
 * Send a push notification to one customer.
 * Fire-and-forget safe — does NOT throw.
 *
 * @param {string} pushToken  - Expo push token (e.g. ExponentPushToken[...])
 * @param {string} title
 * @param {string} body
 * @param {object} [data]     - extra JSON payload for deep-linking
 */
const sendPushNotification = async (pushToken, title, body, data = {}) => {
  if (!expo) {
    console.log(`[PUSH DEV] ${title}: ${body} → ${pushToken}`);
    return;
  }

  if (!Expo.isExpoPushToken(pushToken)) {
    console.warn(`[PUSH] Invalid token: ${pushToken}`);
    return;
  }

  try {
    const chunks = expo.chunkPushNotifications([{
      to:    pushToken,
      sound: 'default',
      title,
      body,
      data,
    }]);

    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === 'error') {
          console.error('[PUSH] Ticket error:', ticket.message);
        }
      }
    }
  } catch (err) {
    console.error('[PUSH] Send failed:', err.message);
  }
};

module.exports = { sendPushNotification };
