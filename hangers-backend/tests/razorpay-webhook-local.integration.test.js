const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('dotenv').config();
const prisma = require('../src/config/database');
const { handleRazorpayWebhook } = require('../src/controllers/webhooks.controller');
const { processRazorpayWebhookBatch, setAttemptState } = require('../src/services/razorpay-webhook-worker.service');

test('local Test webhook is durably accepted once and an expired worker lease is recovered', {
  skip: process.env.RUN_LOCAL_WEBHOOK_INTEGRATION !== '1',
}, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.port || '5432', '5432');
  const database = process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' ? 'hangers_test' : 'hangers_db';
  assert.equal(url.pathname, `/${database}`);
  assert.match(process.env.RAZORPAY_KEY_ID, /^rzp_test_/);
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, database);
  const previous = process.env.RAZORPAY_WEBHOOK_SECRET_TEST;
  const previousOld = process.env.RAZORPAY_WEBHOOK_SECRET_TEST_PREVIOUS;
  process.env.RAZORPAY_WEBHOOK_SECRET_TEST = crypto.randomBytes(32).toString('hex');
  delete process.env.RAZORPAY_WEBHOOK_SECRET_TEST_PREVIOUS;
  const eventId = `qa-local-recovery-${crypto.randomUUID()}`;
  const body = { event: 'qa.recovery.probe', payload: {} };
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET_TEST).update(rawBody).digest('hex');
  const request = (bytes = rawBody, signatureValue = signature) => ({
    id: eventId, params: { mode: 'test' }, body, rawBody: bytes,
    headers: { 'x-razorpay-event-id': eventId, 'x-razorpay-signature': signatureValue },
  });
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });
  try {
    const invalid = response();
    await handleRazorpayWebhook(request(Buffer.from(`${rawBody} `)), invalid);
    assert.equal(invalid.statusCode, 400);
    assert.equal(await prisma.razorpayWebhookEvent.count({ where: { eventId } }), 0);

    const accepted = response();
    await handleRazorpayWebhook(request(), accepted);
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.body.accepted, true);
    const stored = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
    assert.equal(stored.status, 'RECEIVED');
    assert.equal(stored.mode, 'TEST');
    assert.equal(stored.payloadHash, crypto.createHash('sha256').update(rawBody).digest('hex'));

    const duplicate = response();
    await handleRazorpayWebhook(request(), duplicate);
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(await prisma.razorpayWebhookEvent.count({ where: { eventId } }), 1);

    // Simulate a worker that died after claiming, without waiting five minutes.
    await prisma.razorpayWebhookEvent.update({ where: { id: stored.id }, data: {
      status: 'PROCESSING', attempts: 1, lockedAt: new Date(Date.now() - 600000),
    } });
    const retryStart = Date.now();
    await processRazorpayWebhookBatch({ onlyEventId: stored.id, concurrency: 1,
      processor: async (event) => {
        assert.equal(event.attempts, 2);
        const error = new Error('Isolated transient provider failure');
        error.statusCode = 429;
        error.headers = { 'retry-after': '60' };
        throw error;
      },
    });
    const retry = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
    assert.equal(retry.status, 'RETRY');
    assert.equal(retry.lockedAt, null);
    assert.ok(retry.nextAttemptAt.getTime() >= retryStart + 60000);
    assert.equal(await processRazorpayWebhookBatch({ onlyEventId: stored.id,
      processor: async () => { throw new Error('Future retry must not be claimed'); },
    }), 0);
    await prisma.razorpayWebhookEvent.update({ where: { id: stored.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    let processed = 0;
    assert.equal(await processRazorpayWebhookBatch({ onlyEventId: stored.id, concurrency: 1,
      processor: async (event) => {
        assert.equal(event.id, stored.id);
        assert.equal(event.attempts, 3);
        processed += 1;
        return { state: 'IGNORED' };
      },
    }), 1);
    const recovered = await prisma.razorpayWebhookEvent.findUnique({ where: { eventId } });
    assert.equal(recovered.status, 'IGNORED');
    assert.equal(recovered.lockedAt, null);
    assert.equal(processed, 1);
    assert.equal(await processRazorpayWebhookBatch({ onlyEventId: stored.id,
      processor: async () => { throw new Error('Terminal event must not be claimed again'); },
    }), 0);
  } finally {
    await prisma.razorpayWebhookEvent.deleteMany({ where: { eventId } });
    if (previous === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET_TEST;
    else process.env.RAZORPAY_WEBHOOK_SECRET_TEST = previous;
    if (previousOld === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET_TEST_PREVIOUS;
    else process.env.RAZORPAY_WEBHOOK_SECRET_TEST_PREVIOUS = previousOld;
    await prisma.$disconnect();
  }
});

test('PostgreSQL row lock prevents a failed webhook from downgrading a committed capture', {
  skip: process.env.RUN_LOCAL_WEBHOOK_INTEGRATION !== '1',
}, async (t) => {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.port || '5432', '5432');
  const database = process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' ? 'hangers_test' : 'hangers_db';
  assert.equal(url.pathname, `/${database}`);
  assert.equal((await prisma.$queryRaw`SELECT current_database() AS name`)[0].name, database);

  const suffix = crypto.randomUUID().replaceAll('-', '');
  const orderId = `order_race_${suffix}`;
  const attemptId = `webhook-race-${suffix}`;
  const resourceFilter = { resource: 'razorpay_checkout_attempt', resourceId: attemptId };
  let attempt;
  try {
    attempt = await prisma.razorpayCheckoutAttempt.create({ data: {
      id: attemptId,
      idempotencyKey: `webhook-race-key-${suffix}`,
      invoiceId: `webhook-race-invoice-${suffix}`,
      invoiceNumber: `WEBHOOK-RACE-${suffix}`,
      customerId: `webhook-race-customer-${suffix}`,
      amountPaise: 1000n,
      currency: 'INR',
      mode: 'TEST',
      status: 'PENDING',
      razorpayOrderId: orderId,
    } });

    let releaseCapture;
    let captureHasLock;
    const locked = new Promise((resolve) => { captureHasLock = resolve; });
    const holdCapture = new Promise((resolve) => { releaseCapture = resolve; });
    const captureTransaction = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "razorpay_checkout_attempts" WHERE "razorpayOrderId" = ${orderId} FOR UPDATE`;
      await tx.razorpayCheckoutAttempt.update({ where: { id: attemptId }, data: { status: 'CAPTURED' } });
      captureHasLock();
      await holdCapture;
    });

    await locked;
    const failedWebhook = setAttemptState(orderId, 'FAILED', `pay_race_${suffix}`, 'PAYMENT_FAILED');
    const waitDeadline = Date.now() + 2000;
    let failureIsBlocked = false;
    while (Date.now() < waitDeadline) {
      const [activity] = await prisma.$queryRaw`SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND query ILIKE '%razorpay_checkout_attempts%'
      ) AS blocked`;
      if (activity.blocked) {
        failureIsBlocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    releaseCapture();
    await Promise.all([captureTransaction, failedWebhook]);
    assert.equal(failureIsBlocked, true, 'the failed-webhook transaction must wait on the capture row lock');

    const finalAttempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attemptId } });
    assert.equal(finalAttempt.status, 'CAPTURED');
    assert.equal(finalAttempt.razorpayPaymentId, null);
  } finally {
    if (attempt) {
      await prisma.activityLog.deleteMany({ where: resourceFilter });
      await prisma.auditLog.deleteMany({ where: resourceFilter });
      await prisma.razorpayCheckoutAttempt.deleteMany({ where: { id: attemptId } });
    }
  }
});
