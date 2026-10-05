const test = require('node:test');
const assert = require('node:assert/strict');

const databasePath = require.resolve('../src/config/database');
const previousDatabase = require.cache[databasePath];
const workerPath = require.resolve('../src/services/razorpay-webhook-worker.service');
const previousWorker = require.cache[workerPath];

const attempt = {
  id: 'attempt-fixture',
  razorpayOrderId: 'order-fixture',
  status: 'PENDING',
  amountPaise: 1000n,
  currency: 'INR',
};
let lockTail = Promise.resolve();
const database = {
  async $transaction(callback) {
    let release;
    const prior = lockTail;
    lockTail = new Promise((resolve) => { release = resolve; });
    await prior;
    const tx = {
      async $queryRaw(strings) {
        assert.match(strings.join(''), /FOR UPDATE/);
        return [{ id: attempt.id }];
      },
      razorpayCheckoutAttempt: {
        async findUnique() { return { ...attempt }; },
        async update({ data }) {
          Object.assign(attempt, data);
          return { ...attempt };
        },
      },
    };
    try { return await callback(tx); }
    finally { release(); }
  },
};

require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: database };
delete require.cache[workerPath];
const { setAttemptState } = require(workerPath);

const lockAndCapture = () => database.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT "id" FROM "razorpay_checkout_attempts" WHERE "razorpayOrderId" = ${attempt.razorpayOrderId} FOR UPDATE`;
  attempt.status = 'CAPTURED';
});

test('a FAILED webhook racing a capture cannot leave the attempt downgraded', async (t) => {
  t.after(() => {
    if (previousDatabase) require.cache[databasePath] = previousDatabase;
    else delete require.cache[databasePath];
    if (previousWorker) require.cache[workerPath] = previousWorker;
    else delete require.cache[workerPath];
  });

  for (const order of ['capture-first', 'failure-first']) {
    await t.test(order, async () => {
      attempt.status = 'PENDING';
      lockTail = Promise.resolve();
      const capture = order === 'capture-first'
        ? lockAndCapture()
        : Promise.resolve().then(() => setAttemptState('order-fixture', 'FAILED', 'pay-fixture', 'PAYMENT_FAILED'));
      const failure = order === 'capture-first'
        ? Promise.resolve().then(() => setAttemptState('order-fixture', 'FAILED', 'pay-fixture', 'PAYMENT_FAILED'))
        : lockAndCapture();
      await Promise.all([capture, failure]);
      assert.equal(attempt.status, 'CAPTURED');
    });
  }
});
