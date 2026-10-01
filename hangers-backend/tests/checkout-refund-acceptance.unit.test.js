const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('A20 authoritative failed refund records failure without posting a refund or changing allocations', async () => {
  let attempt = {
    id: 'refund-attempt-fixture', sourcePaymentId: 'payment-fixture',
    orderId: 'order-fixture', invoiceId: 'invoice-fixture',
    amountPaise: 1000n, currency: 'INR', mode: 'TEST', status: 'PENDING',
    razorpayRefundId: 'rfnd_fixture', localRefundPaymentId: null,
    sourcePayment: { razorpayPaymentId: 'pay_fixture' },
  };
  const audits = [];
  const updates = [];
  const tx = {
    $queryRaw: async () => [{ id: attempt.id }],
    razorpayRefundAttempt: {
      findUnique: async () => attempt,
      update: async ({ where, data }) => {
        assert.equal(where.id, attempt.id);
        updates.push(data);
        attempt = { ...attempt, ...data };
        return attempt;
      },
    },
  };
  const prisma = {
    razorpayRefundAttempt: { findFirst: async () => attempt },
    $transaction: async (run) => run(tx),
  };
  class PaymentRuleError extends Error {}
  const dependencies = {
    axios: {
      get: () => assert.fail('Real provider reads are forbidden'),
      post: () => assert.fail('Real provider writes are forbidden'),
    },
    crypto: require('node:crypto'),
    '../config/database': prisma,
    './payment.service': {
      PaymentRuleError,
      recordOrderRefund: () => assert.fail('Failed refunds must not post ledger entries'),
    },
    './activity.service': { writeAuditEvent: async (_tx, entry) => audits.push(entry) },
    '../utils/redact': { razorpayErrorSummary: () => assert.fail('No provider exception expected') },
  };
  // Load the actual service with an allowlisted dependency graph, never the DB client.
  const module = { exports: {} };
  const filename = path.join(__dirname, '../src/services/razorpay-refund.service.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, Date, process: { env: {} },
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });

  let fetches = 0;
  const result = await module.exports.reconcileRazorpayRefundWebhook({
    refundId: 'rfnd_fixture', eventType: 'refund.processed',
  }, async (id) => {
    fetches += 1;
    assert.equal(id, 'rfnd_fixture');
    return { id, payment_id: 'pay_fixture', amount: 1000, currency: 'INR', status: 'failed' };
  });

  assert.equal(fetches, 1);
  assert.equal(result.providerStatus, 'failed', 'Authoritative status overrides the event label');
  assert.equal(attempt.status, 'FAILED');
  assert.equal(attempt.providerStatus, 'failed');
  assert.equal(attempt.failureCode, null, 'Do not synthesize a provider error code when the fetched refund has none');
  assert.ok(attempt.completedAt instanceof Date);
  assert.equal(attempt.localRefundPaymentId, null);
  assert.equal(attempt.sourcePaymentId, 'payment-fixture');
  assert.equal(attempt.invoiceId, 'invoice-fixture');
  assert.equal(updates.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'RAZORPAY_REFUND_FAILED');
  assert.equal(audits[0].status, 'FAILURE');
  assert.equal(audits[0].metadata.sourcePaymentId, 'payment-fixture');
  assert.equal(audits[0].metadata.invoiceId, 'invoice-fixture');
});
