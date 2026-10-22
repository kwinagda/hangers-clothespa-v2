const test = require('node:test');
const assert = require('node:assert/strict');
const { createTraceContext, getTraceContext, parseTraceParent, runWithTraceContext } = require('../src/utils/trace-context');

test('valid W3C traceparent keeps trace identity and creates a distinct server span', () => {
  const parent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
  const parsed = parseTraceParent(parent);
  const context = createTraceContext(parent);
  assert.equal(parsed.traceId, '0123456789abcdef0123456789abcdef');
  assert.equal(context.traceId, parsed.traceId);
  assert.equal(context.parentSpanId, parsed.parentSpanId);
  assert.notEqual(context.spanId, parsed.parentSpanId);
  assert.match(context.spanId, /^[0-9a-f]{16}$/);
});

test('invalid, zero, and unsupported traceparents start an independent trace', () => {
  for (const value of [undefined, '00-00000000000000000000000000000000-0123456789abcdef-01', '01-0123456789abcdef0123456789abcdef-0123456789abcdef-01']) {
    assert.equal(parseTraceParent(value), null);
    const context = createTraceContext(value);
    assert.match(context.traceId, /^[0-9a-f]{32}$/);
    assert.match(context.spanId, /^[0-9a-f]{16}$/);
    assert.notEqual(context.traceId, '00000000000000000000000000000000');
  }
});

test('trace context remains isolated across asynchronous request work', async () => {
  const context = createTraceContext(null);
  await runWithTraceContext(context, async () => {
    await Promise.resolve();
    assert.equal(getTraceContext().traceId, context.traceId);
    assert.equal(getTraceContext().spanId, context.spanId);
  });
  assert.equal(getTraceContext(), null);
});
