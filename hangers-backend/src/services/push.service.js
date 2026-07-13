// ─────────────────────────────────────────────────────────────────────────────
// PUSH NOTIFICATION SERVICE — Expo push notifications (server-side)
// Requires: expo-server-sdk  (npm install expo-server-sdk)
// ─────────────────────────────────────────────────────────────────────────────

let Expo;
const { maskToken } = require('../utils/redact');
try {
  ({ Expo } = require('expo-server-sdk'));
} catch {
  // expo-server-sdk not installed yet — push notifications silently disabled
}

const expo = Expo ? new Expo() : null;

class PushDeliveryError extends Error {
  constructor(message, { retryable = false, code = null } = {}) {
    super(message);
    this.name = 'PushDeliveryError';
    this.retryable = retryable;
    this.code = code;
  }
}

/**
 * Send a push notification to one customer.
 * Fire-and-forget safe by default. Set throwOnFailure for queue workers.
 *
 * @param {string} pushToken  - Expo push token (e.g. ExponentPushToken[...])
 * @param {string} title
 * @param {string} body
 * @param {object} [data]     - extra JSON payload for deep-linking
 */
const sendPushNotification = async (pushToken, title, body, data = {}, options = {}) => {
  if (!expo) {
    console.log(`[PUSH DEV] Notification simulated for token ${maskToken(pushToken)}`);
    return true;
  }

  if (!Expo.isExpoPushToken(pushToken)) {
    console.warn(`[PUSH] Invalid token: ${maskToken(pushToken)}`);
    if (options.throwOnFailure) {
      throw new PushDeliveryError('Invalid Expo push token', {
        retryable: false,
        code: 'INVALID_PUSH_TOKEN',
      });
    }
    return false;
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
          if (options.throwOnFailure) {
            const retryable = ticket.details?.error === 'MessageRateExceeded' || ticket.details?.error === 'ExpoError';
            throw new PushDeliveryError(ticket.message || 'Expo push ticket failed', {
              retryable,
              code: ticket.details?.error || 'PUSH_TICKET_FAILED',
            });
          }
        }
      }
    }
    return true;
  } catch (err) {
    console.error('[PUSH] Send failed:', err.message);
    if (options.throwOnFailure) {
      if (err instanceof PushDeliveryError) throw err;
      throw new PushDeliveryError(err.message || 'Expo push send failed', {
        retryable: true,
        code: 'PUSH_PROVIDER_FAILURE',
      });
    }
    return false;
  }
};

module.exports = { sendPushNotification, PushDeliveryError };
