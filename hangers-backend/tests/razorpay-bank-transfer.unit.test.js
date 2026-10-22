const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../src/config/database');
const { getBankTransferWebhookPayload, validateRazorpayBankTransferPayment } = require('../src/services/razorpay-bank-transfer.service');

test('bank credit boundaries reject unverified scope before database or provider operations', async (t) => {
  const env = { ...process.env };
  const originalFind = prisma.razorpayCheckoutAttempt.findUnique;
  prisma.razorpayCheckoutAttempt.findUnique = async () => assert.fail('Boundary rejection must precede database lookup');
  t.after(async () => {
    prisma.razorpayCheckoutAttempt.findUnique = originalFind;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
    await prisma.$disconnect();
  });
  Object.assign(process.env, { RAZORPAY_KEY_ID: 'rzp_test_bank_fixture', RAZORPAY_KEY_SECRET: 'fixture-secret',
    RAZORPAY_ACCOUNT_ID_TEST: 'acc_fixture', RAZORPAY_CUSTOM_BANK_TRANSFER_ENABLED: 'true', RAZORPAY_CUSTOM_FEE_BEARER: 'MERCHANT' });
  const body = { account_id: 'acc_fixture', payload: {
    payment: { entity: { id: 'pay_fixture', amount: 1000, currency: 'INR' } },
    virtual_account: { entity: { id: 'va_fixture' } },
    bank_transfer: { entity: { id: 'bt_fixture', payment_id: 'pay_fixture', virtual_account_id: 'va_fixture', amount: 1000 } },
  } };
  const event = { event: 'virtual_account.credited', mode: 'TEST', paymentId: 'pay_fixture', orderId: 'order_fixture', payload: getBankTransferWebhookPayload(body) };
  const payment = { id: 'pay_fixture', order_id: 'order_fixture', method: 'bank_transfer', status: 'captured', captured: true,
    international: false, currency: 'INR', amount: 1000, created_at: 1700000000, amount_refunded: 0, refund_status: null };
  const provider = {};
  await t.test('minimal payload drops unrelated bank details and flags conflicting references', () => {
    assert.equal(event.payload.bankTransfer.referencesValid, true);
    const changed = structuredClone(body);
    changed.payload.bank_transfer.entity.payment_id = 'pay_other';
    changed.payload.bank_transfer.entity.payer_account = 'never-retain';
    const extracted = getBankTransferWebhookPayload(changed);
    assert.equal(extracted.bankTransfer.referencesValid, false);
    assert.doesNotMatch(JSON.stringify(extracted), /never-retain/);
  });
  for (const [name, changedEvent, changedPayment, code] of [
    ['foreign mode', { ...event, mode: 'LIVE' }, payment, 'RAZORPAY_MODE_MISMATCH'],
    ['foreign account', { ...event, payload: { ...event.payload, accountId: 'acc_other' } }, payment, 'RAZORPAY_ACCOUNT_MISMATCH'],
    ['missing signed credit', { ...event, payload: { accountId: 'acc_fixture' } }, payment, 'BANK_TRANSFER_REFERENCE_MISMATCH'],
    ['foreign payment', event, { ...payment, id: 'pay_other' }, 'BANK_TRANSFER_PAYMENT_BINDING_MISMATCH'],
    ['pending capture', event, { ...payment, status: 'authorized', captured: false }, 'BANK_TRANSFER_CAPTURE_PENDING'],
    ['failed payment', event, { ...payment, status: 'failed', captured: false }, 'BANK_TRANSFER_PAYMENT_STATE_REVIEW'],
    ['international payment', event, { ...payment, international: true }, 'BANK_TRANSFER_PAYMENT_DATA_REVIEW'],
    ['refunded payment', event, { ...payment, amount_refunded: 100 }, 'BANK_TRANSFER_REFUND_REVIEW'],
  ]) await t.test(name, async () => {
    await assert.rejects(validateRazorpayBankTransferPayment(changedPayment, { event: changedEvent, provider }), { code });
  });
  await t.test('disabled activation and unverified fee bearer cannot settle', async () => {
    process.env.RAZORPAY_CUSTOM_BANK_TRANSFER_ENABLED = 'false';
    await assert.rejects(validateRazorpayBankTransferPayment(payment, { event, provider }), { code: 'RAZORPAY_BANK_TRANSFER_NOT_ENABLED' });
    process.env.RAZORPAY_CUSTOM_BANK_TRANSFER_ENABLED = 'true';
    delete process.env.RAZORPAY_CUSTOM_FEE_BEARER;
    await assert.rejects(validateRazorpayBankTransferPayment(payment, { event, provider }), { code: 'BANK_TRANSFER_FEE_BEARER_UNVERIFIED' });
  });
});
