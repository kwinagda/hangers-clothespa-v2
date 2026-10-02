const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const servicePath = path.resolve(__dirname, '../src/services/razorpay-invoice-checkout.service.js');

// Load the actual service without initializing Prisma, SDKs or their dependencies.
const loadReservationHarness = (error) => {
  const calls = { transactions: 0, provider: 0, delays: [], warnings: [] };
  const forbidden = () => assert.fail('Unexpected dependency or provider access');
  const dependencies = {
    crypto,
    razorpay: forbidden,
    '../config/database': {
      $transaction: async (_callback, options) => {
        calls.transactions += 1;
        assert.equal(options.isolationLevel, 'Serializable');
        throw error;
      },
    },
    './payment.service': {},
    './outbox.service': {},
    './activity.service': {},
    '../utils/redact': {},
    '../utils/razorpay-payment-method': {},
  };
  const context = {
    module: { exports: {} },
    require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected import: ${id}`);
      return dependencies[id];
    },
    console: { warn: (message) => calls.warnings.push(JSON.parse(message)), error: forbidden },
    setTimeout: (resolve, delay) => { calls.delays.push(delay); resolve(); },
    process: { env: { RAZORPAY_KEY_ID: 'rzp_test_reservation_unit' } },
  };
  vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), context, { filename: servicePath });
  return {
    calls,
    run: () => context.module.exports.createInvoiceCheckout({
      invoice: { id: 'invoice-reservation-unit', customerId: 'home-unit' },
      shareId: 'share-reservation-unit',
      idempotencyKey: 'reservation-unit',
      customCheckout: true,
      provider: { orders: {
        create: () => { calls.provider += 1; return forbidden(); },
        fetch: () => { calls.provider += 1; return forbidden(); },
        fetchPayments: () => { calls.provider += 1; return forbidden(); },
      } },
    }),
  };
};

test('reservation conflicts have bounded retries and never reach the provider on exhaustion', async (t) => {
  for (const [name, error, expectedCode] of [
    ['Prisma serialization conflict', Object.assign(new Error('conflict'), { code: 'P2034' }), 'P2034'],
    ['raw-query serialization failure', Object.assign(new Error('conflict'), { code: 'P2010', meta: { code: '40001' } }), '40001'],
    ['raw-query deadlock', Object.assign(new Error('conflict'), { code: 'P2010', meta: { code: '40P01' } }), '40P01'],
  ]) {
    await t.test(name, async () => {
      const { calls, run } = loadReservationHarness(error);
      await assert.rejects(run(), (actual) => actual === error);
      assert.equal(calls.transactions, 5);
      assert.equal(calls.provider, 0);
      assert.equal(calls.delays.length, 4);
      assert.equal(calls.warnings.length, 4);
      for (let index = 0; index < 4; index += 1) {
        const minimum = 10 * (2 ** index);
        assert.ok(calls.delays[index] >= minimum && calls.delays[index] < minimum + 20);
        assert.equal(calls.warnings[index].event, 'RAZORPAY_CHECKOUT_RESERVATION_RETRY');
        assert.equal(calls.warnings[index].retry, index + 1);
        assert.equal(calls.warnings[index].retryLimit, 4);
        assert.equal(calls.warnings[index].backoffMs, calls.delays[index]);
        assert.equal(calls.warnings[index].errorCode, expectedCode);
      }
    });
  }
  await t.test('unrelated raw-query error is not retried', async () => {
    const error = Object.assign(new Error('constraint failure'), { code: 'P2010', meta: { code: '23505' } });
    const { calls, run } = loadReservationHarness(error);
    await assert.rejects(run(), (actual) => actual === error);
    assert.equal(calls.transactions, 1);
    assert.equal(calls.provider, 0);
    assert.equal(calls.delays.length, 0);
    assert.equal(calls.warnings.length, 0);
  });
});
