const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canResumeUnattemptedCheckout, getUnattemptedCheckoutResumeBlockReason, matchesExpectedCheckoutBinding } = require('../src/services/razorpay-invoice-checkout.service');

const attempt = {
  id: 'attempt_123',
  invoiceId: 'invoice_123',
  razorpayOrderId: 'order_123',
  amountPaise: 15900n,
  currency: 'INR',
  status: 'CREATED',
};

const providerOrder = {
  id: 'order_123',
  status: 'created',
  attempts: 0,
  amount: 15900,
  amount_due: 15900,
  amount_paid: 0,
  currency: 'INR',
  notes: { crm_attempt_id: 'attempt_123', invoice_id: 'invoice_123' },
};

test('resumes only the identical Razorpay order confirmed created and never attempted', () => {
  assert.equal(canResumeUnattemptedCheckout({ attempt, providerOrder, providerPayments: { items: [] } }), true);
});

test('refuses resume if any payment attempt exists, even before CRM resolves its status', () => {
  for (const status of ['created', 'authorized', 'failed', 'captured']) {
    assert.equal(canResumeUnattemptedCheckout({
      attempt,
      providerOrder,
      providerPayments: { items: [{ id: 'pay_123', status }] },
    }), false);
  }
});

test('refuses resume for non-created provider states, prior attempts, or a non-CREATED CRM attempt', () => {
  for (const changed of [
    { providerOrder: { ...providerOrder, status: 'attempted' } },
    { providerOrder: { ...providerOrder, status: 'paid' } },
    { providerOrder: { ...providerOrder, attempts: 1 } },
    { attempt: { ...attempt, status: 'AUTHORIZED' } },
    { attempt: { ...attempt, status: 'PENDING' } },
  ]) {
    assert.equal(canResumeUnattemptedCheckout({ attempt, providerOrder, providerPayments: { items: [] }, ...changed }), false);
  }
});

test('refuses resume when provider order identity, invoice binding, amount, due amount, paid amount, or currency differs', () => {
  for (const changedOrder of [
    { ...providerOrder, id: 'order_other' },
    { ...providerOrder, amount: 15901 },
    { ...providerOrder, amount_due: 15901 },
    { ...providerOrder, amount_paid: 1 },
    { ...providerOrder, currency: 'USD' },
    { ...providerOrder, notes: { ...providerOrder.notes, crm_attempt_id: 'attempt_other' } },
    { ...providerOrder, notes: { ...providerOrder.notes, invoice_id: 'invoice_other' } },
  ]) {
    assert.equal(canResumeUnattemptedCheckout({ attempt, providerOrder: changedOrder, providerPayments: { items: [] } }), false);
  }
});

test('requires an authoritative empty payments collection and complete provider-order evidence', () => {
  for (const providerPayments of [undefined, {}, { items: null }, { items: [{ id: 'pay_123', status: 'failed' }] }]) {
    assert.equal(canResumeUnattemptedCheckout({ attempt, providerOrder, providerPayments }), false);
  }
  assert.equal(canResumeUnattemptedCheckout({ attempt, providerOrder: undefined, providerPayments: { items: [] } }), false);
});

test('returns safe diagnostic codes for every condition that blocks checkout resume', () => {
  const cases = [
    [{ attempt: { ...attempt, status: 'PENDING' }, providerOrder, providerPayments: { items: [] } }, 'CRM_ATTEMPT_NOT_RESUMABLE'],
    [{ attempt, providerOrder: undefined, providerPayments: { items: [] } }, 'PROVIDER_ORDER_MISSING'],
    [{ attempt, providerOrder: { ...providerOrder, id: 'order_other' }, providerPayments: { items: [] } }, 'PROVIDER_ORDER_ID_MISMATCH'],
    [{ attempt, providerOrder: { ...providerOrder, status: 'paid' }, providerPayments: { items: [] } }, 'PROVIDER_ORDER_NOT_CREATED'],
    [{ attempt, providerOrder: { ...providerOrder, attempts: 1 }, providerPayments: { items: [] } }, 'PROVIDER_ATTEMPTS_EXIST'],
    [{ attempt, providerOrder: { ...providerOrder, amount: 'invalid' }, providerPayments: { items: [] } }, 'PROVIDER_AMOUNT_INVALID'],
    [{ attempt, providerOrder: { ...providerOrder, amount: 15901 }, providerPayments: { items: [] } }, 'PROVIDER_AMOUNT_MISMATCH'],
    [{ attempt, providerOrder: { ...providerOrder, amount_due: 15901 }, providerPayments: { items: [] } }, 'PROVIDER_AMOUNT_DUE_MISMATCH'],
    [{ attempt, providerOrder: { ...providerOrder, amount_paid: 1 }, providerPayments: { items: [] } }, 'PROVIDER_AMOUNT_ALREADY_PAID'],
    [{ attempt, providerOrder: { ...providerOrder, currency: 'USD' }, providerPayments: { items: [] } }, 'PROVIDER_CURRENCY_MISMATCH'],
    [{ attempt, providerOrder: { ...providerOrder, notes: { ...providerOrder.notes, invoice_id: 'invoice_other' } }, providerPayments: { items: [] } }, 'PROVIDER_INVOICE_BINDING_MISMATCH'],
    [{ attempt, providerOrder, providerPayments: undefined }, 'PROVIDER_PAYMENT_LIST_UNAVAILABLE'],
    [{ attempt, providerOrder, providerPayments: { items: [{ id: 'pay_123', status: 'created' }] } }, 'PROVIDER_PAYMENT_ATTEMPTS_EXIST'],
  ];
  for (const [input, expected] of cases) assert.equal(getUnattemptedCheckoutResumeBlockReason(input), expected);
  assert.equal(getUnattemptedCheckoutResumeBlockReason({ attempt, providerOrder, providerPayments: { items: [] } }), null);
});

test('settlement binding requires both the expected invoice and public share when supplied', () => {
  const boundAttempt = { invoiceId: 'invoice_123', publicShareId: 'share_123' };
  assert.equal(matchesExpectedCheckoutBinding({ attempt: boundAttempt, expectedInvoiceId: 'invoice_123', expectedShareId: 'share_123' }), true);
  assert.equal(matchesExpectedCheckoutBinding({ attempt: boundAttempt, expectedInvoiceId: 'invoice_other', expectedShareId: 'share_123' }), false);
  assert.equal(matchesExpectedCheckoutBinding({ attempt: boundAttempt, expectedInvoiceId: 'invoice_123', expectedShareId: 'share_other' }), false);
  assert.equal(matchesExpectedCheckoutBinding({ attempt: boundAttempt, expectedInvoiceId: 'invoice_123' }), true,
    'a refreshed valid public token may reconcile the same invoice without matching the original token ID');
});
