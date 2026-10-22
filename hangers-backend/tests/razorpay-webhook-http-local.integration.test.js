const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('dotenv').config({ quiet: true });
const prisma = require('../src/config/database');

test('existing localhost proxy preserves signed webhook bytes and deduplicates delivery', {
  skip: process.env.RUN_LOCAL_WEBHOOK_HTTP_INTEGRATION !== '1',
}, async (t) => {
  const database = new URL(process.env.DATABASE_URL);
  assert.equal(database.hostname, 'localhost');
  assert.equal(database.port, '5432');
  assert.equal(database.pathname, '/hangers_db');
  assert.match(process.env.RAZORPAY_KEY_ID || '', /^rzp_test_/);
  assert.ok(process.env.RAZORPAY_WEBHOOK_SECRET_TEST, 'Existing Test secret must be configured');
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, 'hangers_db');
  const eventId = `qa-http-recovery-${crypto.randomUUID()}`;
  const raw = JSON.stringify({ event: 'qa.recovery.probe', payload: {} }, null, 2);
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET_TEST).update(raw).digest('hex');
  t.after(async () => {
    await prisma.razorpayWebhookEvent.deleteMany({ where: { eventId } });
    await prisma.$disconnect();
  });
  const deliver = (body) => fetch('http://localhost:5002/api/v1/webhooks/razorpay/test', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/json', 'x-razorpay-event-id': eventId, 'x-razorpay-signature': signature }, body,
  });
  const altered = await deliver(`${raw} `);
  assert.equal(altered.status, 400);
  assert.equal((await altered.json()).code, 'WEBHOOK_SIGNATURE_INVALID');
  assert.equal(await prisma.razorpayWebhookEvent.count({ where: { eventId } }), 0);
  const accepted = await deliver(raw);
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).accepted, true);
  const duplicate = await deliver(raw);
  assert.equal(duplicate.status, 200);
  assert.equal(await prisma.razorpayWebhookEvent.count({ where: { eventId } }), 1);
  const stored = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
  assert.equal(stored.mode, 'TEST');
  assert.equal(stored.payloadHash, crypto.createHash('sha256').update(raw).digest('hex'));
});
