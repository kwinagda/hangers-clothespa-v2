const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/database');
const activity = require('../src/services/activity.service');
const originalAudit = activity.writeAuditEvent;
const audits = [];
activity.writeAuditEvent = async (_tx, entry) => audits.push(entry);
const { reconcileRazorpayDispute, normalizeDispute } = require('../src/services/razorpay-dispute.service');
activity.writeAuditEvent = originalAudit;

test('dispute reconciliation preserves finance state and audit without changing balances', async (t) => {
  const originalFind = prisma.payment.findFirst;
  const originalTransaction = prisma.$transaction;
  const originalKey = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_dispute_fixture';
  let saved = null;
  let linked = true;
  const tx = {
    $queryRaw: async () => saved ? [{ id: 'case-fixture', status: saved.status }] : [],
    razorpayDisputeCase: {
      create: async ({ data }) => { saved = { id: 'case-fixture', ...data }; return saved; },
      update: async ({ data }) => { saved = { ...saved, ...data }; return saved; },
    },
  };
  prisma.payment.findFirst = async ({ where }) => {
    assert.deepEqual(where, { razorpayPaymentId: 'pay_fixture', method: 'RAZORPAY', kind: 'RECEIPT', status: 'CAPTURED' });
    return linked ? { id: 'local-payment-fixture' } : null;
  };
  prisma.$transaction = async (run, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return run(tx);
  };
  t.after(async () => {
    prisma.payment.findFirst = originalFind;
    prisma.$transaction = originalTransaction;
    if (originalKey === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = originalKey;
    await prisma.$disconnect();
  });
  const entity = { id: 'disp_fixture', payment_id: 'pay_fixture', amount: 1000, amount_deducted: 1000, currency: 'INR', status: 'open' };
  const reconcile = (status) => reconcileRazorpayDispute({
    disputeId: entity.id, eventId: `evt_${status}`, eventType: `payment.dispute.${status}`,
    provider: { disputes: { fetch: async (id) => { assert.equal(id, entity.id); return { ...entity, status }; } } },
  });
  await t.test('authoritative open dispute links only to captured receipt', async () => {
    const result = await reconcile('open');
    assert.equal(result.state, 'PROCESSED');
    assert.equal(saved.localPaymentId, 'local-payment-fixture');
    assert.equal(saved.amountPaise, 1000n);
    assert.equal(saved.mode, 'TEST');
    assert.equal(audits.at(-1).action, 'RAZORPAY_DISPUTE_SYNCED');
  });
  await t.test('review then won state is retained against late open event', async () => {
    await reconcile('under_review');
    await reconcile('won');
    const result = await reconcile('open');
    assert.equal(result.state, 'REVIEW');
    assert.equal(saved.status, 'WON');
    assert.equal(audits.at(-1).action, 'RAZORPAY_DISPUTE_STATE_REGRESSION_REVIEW');
    assert.equal(audits.at(-1).metadata.priorState, 'WON');
  });
  await t.test('unknown local payment is retained for finance review, not silently settled', async () => {
    saved = null;
    linked = false;
    const result = await reconcile('lost');
    assert.equal(result.state, 'REVIEW');
    assert.equal(saved.linkStatus, 'UNLINKED');
    assert.equal(saved.localPaymentId, null);
  });
  await t.test('mismatched identity and malformed money/status are rejected', () => {
    for (const patch of [{ id: 'disp_other' }, { amount: 1.5 }, { amount_deducted: -1 }, { status: 'invented' }, { currency: '' }]) {
      assert.throws(() => normalizeDispute({ ...entity, ...patch }, entity.id), { code: 'DISPUTE_PROVIDER_DATA_INVALID', permanent: true });
    }
  });
});
