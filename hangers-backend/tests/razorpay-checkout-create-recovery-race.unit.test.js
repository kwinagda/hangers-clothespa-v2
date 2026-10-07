const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const servicePath = path.resolve(__dirname, '../src/services/razorpay-invoice-checkout.service.js');

const loadService = ({ planInvoices = null, seededAttempt = null, seededAttempts = null } = {}) => {
  const calls = { audits: [], providerCreates: 0, providerOrderFetches: 0, providerPaymentFetches: 0 };
  const invoice = {
    id: 'invoice-home-race-unit',
    invoiceNumber: 'INV-HOME-RACE-UNIT',
    customerId: 'home-customer-unit',
    orderId: null,
    ironBillId: null,
    serviceAppointmentId: null,
    status: 'OPEN',
    currency: 'INR',
    balanceDue: 10,
    voidedAt: null,
  };
  const receivables = planInvoices || [invoice];
  const attempts = seededAttempts ? [...seededAttempts] : seededAttempt ? [seededAttempt] : [];
  const matchesAttemptQuery = (row, where = {}) => {
    if (!row || (where.customerId && row.customerId !== where.customerId)
      || (where.mode && row.mode !== where.mode)
      || (where.id && typeof where.id === 'string' && row.id !== where.id)
      || (where.id?.not && row.id === where.id.not)
      || (where.id?.in && !where.id.in.includes(row.id))
      || (where.razorpayOrderId && row.razorpayOrderId !== where.razorpayOrderId)) return false;
    if (where.OR && !where.OR.some((clause) => {
      if (clause.invoiceId) return typeof clause.invoiceId === 'string'
        ? clause.invoiceId === row.invoiceId : clause.invoiceId.in.includes(row.invoiceId);
      const ids = clause.allocationPlan?.array_contains?.map((item) => item.invoiceId) || [];
      return ids.length > 0 && ids.every((id) => row.allocationPlan?.some((item) => item.invoiceId === id));
    })) return false;
    const expected = where.status;
    if (typeof expected === 'string' && row.status !== expected) return false;
    if (expected?.in && !expected.in.includes(row.status)) return false;
    return true;
  };
  const tx = {
    $queryRaw: async (strings, ...values) => {
      if (!strings.join('').includes('FROM "invoices"')) return [];
      return receivables.filter((row) => row.id === values[0]).map(({ id }) => ({ id }));
    },
    invoice: {
      findMany: async ({ where }) => receivables.filter((row) => (
        (!where.customerId || row.customerId === where.customerId)
        && (!where.id?.in || where.id.in.includes(row.id))
      )),
      findUnique: async ({ where }) => receivables.find((row) => row.id === where.id) || null,
    },
    order: { findUnique: async () => null },
    razorpayCheckoutAttempt: {
      findUnique: async ({ where }) => {
        if (where.idempotencyKey) return attempts.find((item) => item.idempotencyKey === where.idempotencyKey) || null;
        return attempts.find((item) => item.id === where.id) || null;
      },
      findFirst: async ({ where }) => {
        return attempts.find((item) => matchesAttemptQuery(item, where)) || null;
      },
      findMany: async ({ where, orderBy }) => {
        const rows = attempts.filter((item) => matchesAttemptQuery(item, where));
        if (orderBy?.createdAt === 'desc') rows.reverse();
        return rows;
      },
      create: async ({ data }) => {
        const attempt = { id: `attempt-home-race-unit-${attempts.length}`, razorpayOrderId: null, razorpayPaymentId: null, ...data };
        attempts.push(attempt);
        return attempt;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (let index = 0; index < attempts.length; index += 1) {
          if (!matchesAttemptQuery(attempts[index], where)) continue;
          attempts[index] = { ...attempts[index], ...data };
          count += 1;
        }
        return { count };
      },
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const dependencies = {
    crypto,
    razorpay: class Razorpay {},
    '../config/database': prisma,
    './payment.service': { PaymentRuleError: class PaymentRuleError {} },
    './outbox.service': { enqueueOutboxEvent: async () => {}, OUTBOX_EVENT: {} },
    './activity.service': { writeAuditEvent: async (_tx, event) => { calls.audits.push(event); return event; } },
    './razorpay-payment-journey-logger': { recordPaymentJourneyEvent: async () => {} },
    './razorpay-refund.service': { reserveAutomaticSurplusRefund: async () => null },
    '../utils/redact': { safeText: (value) => typeof value === 'string' ? value.slice(0, 240) : null },
    '../utils/razorpay-payment-method': { getSafeRazorpayPaymentMethod: () => ({}), getSafeRazorpayPaymentDiagnostics: () => ({}) },
    './receivables.service': { openInvoiceWhere: {} },
  };
  const context = {
    module: { exports: {} },
    require: (id) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected import: ${id}`);
      return dependencies[id];
    },
    console: { warn: () => {}, error: () => {} },
    process: { env: { RAZORPAY_KEY_ID: 'rzp_test_unit', RAZORPAY_KEY_SECRET: 'test-secret' } },
  };
  vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), context, { filename: servicePath });
  return {
    service: context.module.exports,
    calls,
    getAttempt: () => attempts.at(-1) || null,
    getAttempts: () => attempts,
    advanceAttempt: (next) => { attempts[attempts.length - 1] = { ...attempts.at(-1), ...next }; },
    invoice: receivables[0],
  };
};

test('unrelated active single-invoice attempt does not block combined checkout', async () => {
  const firstInvoice = {
    id: 'invoice-home-plan-first-unit',
    invoiceNumber: 'INV-HOME-PLAN-FIRST-UNIT',
    customerId: 'home-customer-unit',
    orderId: null,
    ironBillId: null,
    serviceAppointmentId: null,
    status: 'OPEN',
    currency: 'INR',
    balanceDue: 10,
    voidedAt: null,
  };
  const secondInvoice = {
    ...firstInvoice,
    id: 'invoice-home-plan-second-unit',
    invoiceNumber: 'INV-HOME-PLAN-SECOND-UNIT',
    balanceDue: 20,
  };
  const activeSingleAttempt = {
    id: 'attempt-home-paid-invoice-unit',
    invoiceId: 'invoice-home-already-paid-unit',
    customerId: firstInvoice.customerId,
    status: 'CREATED',
    mode: 'TEST',
    amountPaise: 35000n,
    currency: 'INR',
    razorpayOrderId: 'order-home-existing-single-unit',
    razorpayPaymentId: null,
    allocationPlan: null,
  };
  const harness = loadService({ planInvoices: [firstInvoice, secondInvoice], seededAttempt: activeSingleAttempt });
  const provider = makeProvider(harness, {});

  const result = await harness.service.createInvoiceCheckout({
      invoice: firstInvoice,
      allocationPlan: [
        { invoiceId: firstInvoice.id, amount: 10 },
        { invoiceId: secondInvoice.id, amount: 20 },
      ],
      shareId: 'share-home-plan-unit',
      idempotencyKey: 'home-plan-unit',
      customCheckout: true,
      provider,
    });

  assert.equal(harness.calls.providerCreates, 1);
  assert.equal(result.attempt.status, 'CREATED');
  assert.equal(result.attempt.allocationPlan.length, 2);
});

test('custom checkout resumes the one active CREATED provider order after verifying it is unattempted', async () => {
  const base = loadService().invoice;
  const prior = {
    id: 'attempt-resume-created-unit', invoiceId: base.id, customerId: base.customerId,
    publicShareId: 'share-resume-unit', mode: 'TEST', status: 'CREATED', amountPaise: 1000n,
    currency: 'INR', allocationPlan: null, razorpayOrderId: 'order-resume-created-unit',
  };
  const harness = loadService({ seededAttempt: prior });
  const provider = {
    orders: {
      create: async () => { harness.calls.providerCreates += 1; throw new Error('unexpected create'); },
      fetch: async (id) => {
        harness.calls.providerOrderFetches += 1;
        return {
          id, status: 'created', attempts: 0, amount: 1000, amount_due: 1000, amount_paid: 0,
          currency: 'INR', notes: { crm_attempt_id: prior.id, invoice_id: base.id, share_id: prior.publicShareId },
        };
      },
      fetchPayments: async () => { harness.calls.providerPaymentFetches += 1; return { count: 0, items: [] }; },
    },
  };

  const result = await harness.service.createInvoiceCheckout({
    invoice: base, shareId: prior.publicShareId, idempotencyKey: 'resume-created-order',
    customCheckout: true, provider,
  });

  assert.equal(result.reused, true);
  assert.equal(result.attempt.id, prior.id);
  assert.equal(result.order.id, prior.razorpayOrderId);
  assert.equal(harness.calls.providerOrderFetches, 1);
  assert.equal(harness.calls.providerPaymentFetches, 1);
  assert.equal(harness.calls.providerCreates, 0);
  assert.equal(harness.getAttempts().length, 1);
});

test('custom checkout does not resume an active CREATED order with provider payment evidence', async () => {
  const base = loadService().invoice;
  const prior = {
    id: 'attempt-resume-attempted-unit', invoiceId: base.id, customerId: base.customerId,
    publicShareId: 'share-resume-unit', mode: 'TEST', status: 'CREATED', amountPaise: 1000n,
    currency: 'INR', allocationPlan: null, razorpayOrderId: 'order-resume-attempted-unit',
  };
  const harness = loadService({ seededAttempt: prior });
  const provider = {
    orders: {
      create: async () => { harness.calls.providerCreates += 1; throw new Error('unexpected create'); },
      fetch: async (id) => ({
        id, status: 'attempted', attempts: 1, amount: 1000, amount_due: 1000, amount_paid: 0,
        currency: 'INR', notes: { crm_attempt_id: prior.id, invoice_id: base.id, share_id: prior.publicShareId },
      }),
      fetchPayments: async () => ({ count: 1, items: [{ id: 'pay-created-unit', order_id: prior.razorpayOrderId, amount: 1000, currency: 'INR', status: 'created' }] }),
    },
  };

  await assert.rejects(harness.service.createInvoiceCheckout({
    invoice: base, shareId: prior.publicShareId, idempotencyKey: 'resume-attempted-order',
    customCheckout: true, provider,
  }), (error) => error.code === 'CHECKOUT_ATTEMPT_UNRESOLVED');

  assert.equal(harness.calls.providerCreates, 0);
  assert.equal(harness.getAttempts().length, 1);
});

test('combined checkout validates only its frozen selected invoices, not other open customer invoices', async () => {
  const firstInvoice = {
    ...loadService().invoice,
    id: 'invoice-selected-first-unit',
    invoiceNumber: 'CUSTOM-CARD-20261001-ONE',
  };
  const secondInvoice = {
    ...firstInvoice,
    id: 'invoice-selected-second-unit',
    invoiceNumber: 'QA-CHECKOUT-46753DDC9F',
  };
  const thirdInvoice = {
    ...firstInvoice,
    id: 'invoice-selected-third-unit',
    invoiceNumber: 'INV-001645',
    balanceDue: 100,
  };
  const excludedDailyIronInvoice = {
    ...firstInvoice,
    id: 'invoice-excluded-daily-iron-unit',
    invoiceNumber: 'INV-001295',
    sourceType: 'DAILY_IRON',
    balanceDue: 22,
  };
  const harness = loadService({ planInvoices: [firstInvoice, secondInvoice, thirdInvoice, excludedDailyIronInvoice] });
  const result = await harness.service.createInvoiceCheckout({
    invoice: firstInvoice,
    allocationPlan: [
      { invoiceId: firstInvoice.id, amount: 10 },
      { invoiceId: secondInvoice.id, amount: 10 },
      { invoiceId: thirdInvoice.id, amount: 100 },
    ],
    expectedAmountPaise: 12000,
    shareId: 'share-selected-only-unit',
    idempotencyKey: 'selected-only-unit',
    customCheckout: true,
    provider: makeProvider(harness, {}),
  });

  assert.equal(harness.calls.providerCreates, 1);
  assert.equal(result.order.amount, 12000);
  assert.equal(result.attempt.allocationPlan.length, 3);
  assert.equal(result.attempt.allocationPlan.some((item) => item.invoiceId === excludedDailyIronInvoice.id), false);
});

for (const status of ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW']) {
  for (const combined of [false, true]) {
    test(`${status}: ${combined ? 'individual blocks combined' : 'combined blocks individual'} overlap before provider call`, async () => {
      const base = loadService().invoice;
      const second = { ...base, id: 'invoice-second-unit', balanceDue: 20 };
      const prior = {
        id: 'overlapping-attempt', invoiceId: combined ? second.id : 'other-anchor',
        customerId: base.customerId, mode: 'TEST', status,
        allocationPlan: combined ? null : [{ invoiceId: base.id, amount: 10 }],
        razorpayOrderId: 'order_existing',
      };
      const harness = loadService({ planInvoices: combined ? [base, second] : [base], seededAttempt: prior });
      await assert.rejects(harness.service.createInvoiceCheckout({
        invoice: base, shareId: 'share-unit', idempotencyKey: 'request-unit', customCheckout: true,
        allocationPlan: combined ? [{ invoiceId: base.id, amount: 10 }, { invoiceId: second.id, amount: 20 }] : null,
        provider: makeProvider(harness, {}),
      }), (error) => error.code === 'CHECKOUT_ALREADY_IN_PROGRESS');
      assert.equal(harness.calls.providerCreates, 0);
    });
  }
}

test('Live attempt does not reserve Test invoice checkout', async () => {
  const base = loadService().invoice;
  const harness = loadService({ seededAttempt: {
    id: 'live-attempt', invoiceId: base.id, customerId: base.customerId,
    mode: 'LIVE', status: 'PENDING', razorpayOrderId: 'order_live',
  } });
  const result = await harness.service.createInvoiceCheckout({
    invoice: base, shareId: 'share-unit', idempotencyKey: 'request-unit', customCheckout: true,
    provider: makeProvider(harness, {}),
  });
  assert.equal(result.attempt.mode, 'TEST');
  assert.equal(harness.calls.providerCreates, 1);
});

for (const status of ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW']) {
  test(`explicit new payment action supersedes ${status} attempt and creates a distinct provider order`, async () => {
  const base = loadService().invoice;
  const prior = {
    id: 'attempt-prior-unresolved-unit', invoiceId: base.id, customerId: base.customerId,
    publicShareId: 'share-unit', mode: 'TEST', status, amountPaise: 1000n,
    currency: 'INR', allocationPlan: null, razorpayOrderId: 'order-prior-unit',
  };
  const harness = loadService({ seededAttempt: prior });
  const result = await harness.service.createInvoiceCheckout({
    invoice: base, shareId: 'share-unit', idempotencyKey: 'explicit-new-attempt',
    supersedeAttemptId: prior.id, customCheckout: true, provider: makeProvider(harness, {}),
  });

  assert.equal(harness.calls.providerCreates, 1);
  assert.equal(result.attempt.status, 'CREATED');
  assert.equal(result.attempt.supersedesAttemptId, prior.id);
  assert.ok(harness.calls.audits.some((event) => event.action === 'RAZORPAY_CHECKOUT_ATTEMPT_SUPERSEDED'));
  });
}

test('explicit combined retry supersedes every unresolved order overlapping its invoice snapshot', async () => {
  const firstInvoice = { ...loadService().invoice, id: 'invoice-first-overlap', invoiceNumber: 'INV-FIRST-OVERLAP' };
  const secondInvoice = { ...firstInvoice, id: 'invoice-second-overlap', invoiceNumber: 'INV-SECOND-OVERLAP', balanceDue: 20 };
  const priorFirst = {
    id: 'attempt-first-overlap', invoiceId: firstInvoice.id, customerId: firstInvoice.customerId,
    publicShareId: 'individual-share', mode: 'TEST', status: 'PENDING', amountPaise: 1000n,
    currency: 'INR', allocationPlan: null, razorpayOrderId: 'order-first-overlap',
  };
  const priorSecond = {
    id: 'attempt-second-overlap', invoiceId: secondInvoice.id, customerId: secondInvoice.customerId,
    publicShareId: 'individual-share', mode: 'TEST', status: 'CREATED', amountPaise: 2000n,
    currency: 'INR', allocationPlan: null, razorpayOrderId: 'order-second-overlap',
  };
  const harness = loadService({ planInvoices: [firstInvoice, secondInvoice], seededAttempts: [priorFirst, priorSecond] });
  const result = await harness.service.createInvoiceCheckout({
    invoice: firstInvoice, shareId: 'customer-share', idempotencyKey: 'combined-retry-overlap',
    supersedeAttemptId: priorFirst.id, customCheckout: true,
    allocationPlan: [{ invoiceId: firstInvoice.id, amount: 10 }, { invoiceId: secondInvoice.id, amount: 20 }],
    expectedAmountPaise: 3000, provider: makeProvider(harness, {}),
  });

  assert.equal(harness.calls.providerCreates, 1);
  assert.equal(result.attempt.status, 'CREATED');
  assert.deepEqual(harness.getAttempts().slice(0, 2).map((item) => item.status), ['SUPERSEDED', 'SUPERSEDED']);
  assert.ok(harness.calls.audits.some((event) => event.metadata?.supersededByAttemptId === result.attempt.id));
  assert.deepEqual(harness.calls.audits.find((event) => event.action === 'RAZORPAY_CHECKOUT_ATTEMPT_RESERVED')?.metadata?.supersededAttemptIds?.sort(),
    [priorFirst.id, priorSecond.id].sort());
});

const makeProvider = (harness, nextState) => ({
  orders: {
    create: async (payload) => {
      harness.calls.providerCreates += 1;
      harness.advanceAttempt(nextState);
      return {
        id: 'order-home-race-unit',
        receipt: payload.receipt,
        amount: payload.amount,
        amount_due: payload.amount,
        amount_paid: 0,
        currency: payload.currency,
        status: 'created',
        attempts: 0,
        notes: payload.notes,
      };
    },
    fetchPayments: async () => ({ count: 0, items: [] }),
  },
});

test('stale displayed amount is rejected before reserving or calling the provider', async () => {
  const harness = loadService();
  await assert.rejects(harness.service.createInvoiceCheckout({
    invoice: harness.invoice, shareId: 'share-unit', idempotencyKey: 'stale-amount',
    expectedAmountPaise: 999, customCheckout: true, provider: makeProvider(harness, {}),
  }), (error) => error.code === 'CHECKOUT_ATTEMPT_STALE');
  assert.equal(harness.calls.providerCreates, 0);
  assert.equal(harness.getAttempt(), null);
});

test('100 invoice snapshot uses exact paise and one provider order', async () => {
  const base = loadService().invoice;
  const invoices = Array.from({ length: 100 }, (_, index) => ({ ...base, id: `invoice-${index}`, balanceDue: (101 + index) / 100 }));
  const harness = loadService({ planInvoices: invoices });
  const amount = invoices.reduce((sum, row) => sum + Math.round(row.balanceDue * 100), 0);
  const result = await harness.service.createInvoiceCheckout({
    invoice: invoices[0], shareId: 'share-unit', idempotencyKey: 'large-plan',
    allocationPlan: invoices.map((row) => ({ invoiceId: row.id, amount: row.balanceDue })),
    expectedAmountPaise: amount, customCheckout: true, provider: makeProvider(harness, {}),
  });
  assert.equal(result.attempt.amountPaise, BigInt(amount));
  assert.equal(result.attempt.allocationPlan.length, 100);
  assert.equal(harness.calls.providerCreates, 1);
});

test('late provider order response preserves recovery REVIEW and blocks replacement checkout', async () => {
  const harness = loadService();
  const provider = makeProvider(harness, { status: 'REVIEW' });
  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-first',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ATTEMPT_CHANGED'
      && error.details?.razorpayOrderId === 'order-home-race-unit',
  );

  assert.equal(harness.getAttempt().status, 'REVIEW');
  assert.equal(harness.getAttempt().razorpayOrderId, 'order-home-race-unit');
  assert.equal(harness.calls.providerCreates, 1);
  assert.ok(harness.calls.audits.some((event) => event.action === 'RAZORPAY_PROVIDER_ORDER_CREATE_RESPONSE_AFTER_RECOVERY'));

  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-retry',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ALREADY_IN_PROGRESS',
  );
  assert.equal(harness.calls.providerCreates, 1, 'the recovery-held attempt must prevent a second provider order');
});

test('late provider order response cannot regress a captured attempt', async () => {
  const harness = loadService();
  const provider = makeProvider(harness, {
    status: 'CAPTURED',
    razorpayOrderId: 'order-home-race-unit',
    razorpayPaymentId: 'pay-home-race-unit',
  });
  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-captured',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ATTEMPT_CHANGED',
  );

  assert.equal(harness.getAttempt().status, 'CAPTURED');
  assert.equal(harness.getAttempt().razorpayOrderId, 'order-home-race-unit');
  assert.equal(harness.getAttempt().razorpayPaymentId, 'pay-home-race-unit');
  assert.equal(harness.calls.providerCreates, 1);
});

test('known provider order is attached to REVIEW when payment verification fails after recovery', async () => {
  const harness = loadService();
  const provider = makeProvider(harness, { status: 'REVIEW' });
  provider.orders.fetchPayments = async () => { throw Object.assign(new Error('network timeout'), { code: 'ETIMEDOUT' }); };

  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-verification-timeout',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ATTEMPT_CHANGED'
      && error.details?.razorpayOrderId === 'order-home-race-unit',
  );

  assert.equal(harness.getAttempt().status, 'REVIEW');
  assert.equal(harness.getAttempt().razorpayOrderId, 'order-home-race-unit');
  assert.equal(harness.calls.providerCreates, 1);
  assert.ok(harness.calls.audits.some((event) => event.action === 'RAZORPAY_ORDER_CREATE_OUTCOME_AFTER_RECOVERY'));
});

test('late definitive amount rejection cannot replace a recovery state', async () => {
  const harness = loadService();
  const provider = { orders: { create: async () => {
    harness.calls.providerCreates += 1;
    harness.advanceAttempt({ status: 'REVIEW' });
    throw Object.assign(new Error('validation rejected'), {
      statusCode: 400,
      error: {
        code: 'BAD_REQUEST_ERROR',
        source: 'business',
        step: 'payment_initiation',
        reason: 'input_validation_failed',
        field: 'amount',
      },
    });
  } } };

  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-late-rejection',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ATTEMPT_CHANGED',
  );

  assert.equal(harness.getAttempt().status, 'REVIEW');
  assert.equal(harness.getAttempt().razorpayOrderId, null);
  assert.equal(harness.calls.providerCreates, 1);
  assert.ok(harness.calls.audits.some((event) => event.action === 'RAZORPAY_ORDER_CREATE_REJECTION_AFTER_RECOVERY'));
});

test('late ambiguous create error cannot regress a captured attempt', async () => {
  const harness = loadService();
  const provider = { orders: { create: async () => {
    harness.calls.providerCreates += 1;
    harness.advanceAttempt({
      status: 'CAPTURED',
      razorpayOrderId: 'order-home-race-unit',
      razorpayPaymentId: 'pay-home-race-unit',
    });
    throw Object.assign(new Error('network timeout'), { code: 'ETIMEDOUT' });
  } } };

  await assert.rejects(
    harness.service.createInvoiceCheckout({
      invoice: harness.invoice,
      shareId: 'share-home-race-unit',
      idempotencyKey: 'home-race-unit-late-timeout',
      customCheckout: true,
      provider,
    }),
    (error) => error.code === 'CHECKOUT_ATTEMPT_CHANGED',
  );

  assert.equal(harness.getAttempt().status, 'CAPTURED');
  assert.equal(harness.getAttempt().razorpayOrderId, 'order-home-race-unit');
  assert.equal(harness.getAttempt().razorpayPaymentId, 'pay-home-race-unit');
  assert.equal(harness.calls.providerCreates, 1);
  assert.ok(harness.calls.audits.some((event) => event.action === 'RAZORPAY_ORDER_CREATE_OUTCOME_AFTER_RECOVERY'));
});
