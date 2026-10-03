const { AsyncLocalStorage } = require('node:async_hooks');
const { randomBytes } = require('node:crypto');

const storage = new AsyncLocalStorage();
const TRACEPARENT_V00 = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

const randomHex = (bytes) => {
  let value;
  do { value = randomBytes(bytes).toString('hex'); } while (/^0+$/.test(value));
  return value;
};

const parseTraceParent = (value) => {
  if (typeof value !== 'string') return null;
  const match = TRACEPARENT_V00.exec(value.trim());
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1].toLowerCase(), parentSpanId: match[2].toLowerCase(), traceFlags: match[3].toLowerCase() };
};

const createTraceContext = (traceParent) => {
  const parent = parseTraceParent(traceParent);
  return {
    traceId: parent?.traceId || randomHex(16),
    spanId: randomHex(8),
    parentSpanId: parent?.parentSpanId || null,
    traceFlags: parent?.traceFlags || '01',
  };
};

const runWithTraceContext = (context, callback) => storage.run(context, callback);
const getTraceContext = () => storage.getStore() || null;

module.exports = { createTraceContext, getTraceContext, parseTraceParent, runWithTraceContext };
