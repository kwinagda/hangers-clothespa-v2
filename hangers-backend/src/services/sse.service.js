// ─────────────────────────────────────────────────────────────────────────────
// SSE SERVICE — Server-Sent Events pub/sub for real-time order board updates.
//
// Clients subscribe via GET /api/v1/realtime/orders.
// Any controller calls emitOrderUpdate(orderId, payload) after a status change.
// ─────────────────────────────────────────────────────────────────────────────

// Map<string, Set<Response>> — channel → connected clients
const channels = new Map();

function getChannel(name) {
  if (!channels.has(name)) channels.set(name, new Set());
  return channels.get(name);
}

/**
 * Registers an Express Response object as an SSE subscriber.
 * Sends an initial ping so the client knows it's connected.
 * Removes the subscriber on disconnect.
 */
function subscribe(channelName, res) {
  res.set({
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no', // disable Nginx buffering
  });
  res.flushHeaders();

  const channel = getChannel(channelName);
  channel.add(res);

  // Heartbeat every 25s so proxies don't close idle connections
  const heartbeat = setInterval(() => {
    if (res.writableEnded) { clearInterval(heartbeat); return; }
    res.write(': ping\n\n');
  }, 25_000);

  res.write('data: {"type":"connected"}\n\n');

  res.on('close', () => {
    clearInterval(heartbeat);
    channel.delete(res);
    if (channel.size === 0) channels.delete(channelName);
  });
}

/**
 * Emits a JSON event to all subscribers of channelName.
 * @param {string} channelName
 * @param {string} event  — SSE event name (e.g. "order:updated")
 * @param {object} data
 */
function emit(channelName, event, data) {
  const channel = channels.get(channelName);
  if (!channel || channel.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of channel) {
    if (!res.writableEnded) {
      res.write(payload);
    }
  }
}

// ── Convenience helpers ───────────────────────────────────────────────────────

const ORDERS_CHANNEL = 'orders';

function emitOrderUpdate(orderId, payload) {
  emit(ORDERS_CHANNEL, 'order:updated', { orderId, ...payload });
}

function subscribeToOrders(res) {
  subscribe(ORDERS_CHANNEL, res);
}

module.exports = { subscribe, emit, emitOrderUpdate, subscribeToOrders };
