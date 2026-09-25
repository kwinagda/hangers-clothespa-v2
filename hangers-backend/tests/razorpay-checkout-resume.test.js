const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canResumeUnattemptedCheckout } = require('../src/services/razorpay-invoice-checkout.service');

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
