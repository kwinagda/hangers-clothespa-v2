const test = require('node:test');
const assert = require('node:assert/strict');
const { processWebhook } = require('../src/services/razorpay-webhook-worker.service');
const { DOWNTIME_EVENTS } = require('../src/services/razorpay-downtime.service');

test('webhook dispatch preserves dedicated consumer contracts and mode isolation', async (t) => {
  const prior = process.env.RAZORPAY_KEY_ID;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_dispatch_fixture';
  t.after(() => { if (prior === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = prior; });
  const provider = { fixture: true };
  for (const type of [...DOWNTIME_EVENTS, 'virtual_account.credited']) {
    await t.test(type, async () => {
      const event = { id: 'fixture', mode: 'TEST', event: type, attempts: 1 };
      const consumer = async (received, options) => {
        assert.equal(received, event);
        assert.equal(options.provider, provider);
        return { state: 'REVIEW', reason: 'fixture-review' };
      };
      assert.deepEqual(await processWebhook(event, {
        razorpayProvider: provider, downtimeReconciler: consumer, bankTransferReconciler: consumer,
      }), { state: 'REVIEW', reason: 'fixture-review' });
    });
  }
  await t.test('refund events pass scoped references to authoritative reconciliation', async () => {
    for (const type of ['refund.created', 'refund.processed', 'refund.failed', 'refund.speed_changed']) {
      const result = await processWebhook({ event: type, mode: 'TEST', refundId: 'rfnd_fixture', refundAttemptId: 'attempt-fixture', eventId: 'evt_fixture' }, {
        refundReconciler: async (args) => {
          assert.deepEqual(args, { refundId: 'rfnd_fixture', refundAttemptId: 'attempt-fixture', eventId: 'evt_fixture', eventType: type });
          return { refundId: args.refundId, providerStatus: 'pending' };
        },
      });
      assert.equal(result.providerStatus, 'pending');
    }
  });
  await t.test('dispute review result is not promoted to settled', async () => {
    const result = await processWebhook({ mode: 'TEST', event: 'payment.dispute.lost', disputeId: 'disp_fixture' }, {
      disputeReconciler: async (args) => { assert.equal(args.disputeId, 'disp_fixture'); return { state: 'REVIEW', linkStatus: 'UNLINKED' }; },
    });
    assert.equal(result.state, 'REVIEW');
  });
  await t.test('mode mismatch and unknown event never dispatch or silently settle', async () => {
    await assert.rejects(processWebhook({ mode: 'LIVE', event: 'virtual_account.credited' }, {
      bankTransferReconciler: async () => assert.fail('Mode mismatch must reject before dispatch'),
    }), { code: 'RAZORPAY_MODE_MISMATCH', permanent: true });
    await assert.rejects(processWebhook({ mode: 'TEST', event: 'unknown.event' }), { code: 'EVENT_REQUIRES_FINANCE_HANDLING', permanent: true });
  });
});
