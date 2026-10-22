const crypto = require('crypto');
const prisma = require('../config/database');
const { getCustomConfiguration } = require('./razorpay-custom-capabilities.service');
// Resolve shared checkout dependencies only when called, so checkout can reuse the validator.
const checkout = () => require('./razorpay-invoice-checkout.service');
const accountService = () => require('./razorpay-checkout-account.service');
const getCheckoutAccountContext = (...args) => accountService().getCheckoutAccountContext(...args);
const requireWebhookContext = (...args) => accountService().requireWebhookContext(...args);
const persistWebhookEvidence = (...args) => accountService().persistWebhookEvidence(...args);
const providerId = (...args) => accountService().providerId(...args);

// https://razorpay.com/docs/payments/payment-methods/bank-transfer/custom-integration/
// https://razorpay.com/docs/api/payments/smart-collect/fetch-payments-bank-transfer/
// Instructions and credit reconciliation share the persisted, server-verified binding.
// fetchVirtualAccount returns instructions, not capture, and its documented entity has no order_id.
const BANK_TRANSFER_BINDING_DEPENDENCY = 'RazorpayVirtualAccountBinding';
const positiveAmount = (value) => Number.isSafeInteger(value) && value > 0;
const timestamp = (value) => Number.isSafeInteger(value) && value > 0 && value <= 8_640_000_000_000;
const review = (code, message) => Object.assign(new (checkout().RazorpayCheckoutError)(code, message, 409), { permanent: true });
const retry = (code, message) => Object.assign(new (checkout().RazorpayCheckoutError)(code, message, 503), { permanent: false });
const dateBound = (value) => value == null ? null : new Date(value).getTime();
const matchesBinding = (binding, attempt, context, virtualAccountId) => binding
  && binding.attemptId === attempt.id && binding.virtualAccountId === virtualAccountId
  && binding.providerOrderId === attempt.razorpayOrderId && binding.mode === context.mode
  && binding.accountId === context.accountId && binding.amountPaise === attempt.amountPaise
  && binding.currency === attempt.currency;

const associationProof = (attempt, context) => crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
  .update(JSON.stringify(['hangers-va-v1', context.mode, context.accountId, attempt.id, attempt.razorpayOrderId])).digest('hex');

const prepareRazorpayVirtualAccount = async ({ attemptId, invoiceId, shareId, virtualAccountId }) => {
  const context = getCheckoutAccountContext({ feature: 'BANK_TRANSFER' });
  if (getCustomConfiguration().feeBearer !== 'MERCHANT') throw review('BANK_TRANSFER_FEE_REVIEW', 'Bank transfer fee configuration needs review');
  const attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attemptId } });
  const expiresAt = dateBound(attempt?.expiresAt);
  const createdAt = dateBound(attempt?.createdAt);
  if (!attempt || attempt.invoiceId !== invoiceId || attempt.publicShareId !== shareId || attempt.mode !== context.mode
    || !providerId(attempt.razorpayOrderId, 'order') || !['CREATED', 'PENDING'].includes(attempt.status)
    || !Number.isSafeInteger(expiresAt) || !Number.isSafeInteger(createdAt)
    || expiresAt <= createdAt || expiresAt <= Date.now()) {
    throw review('BANK_TRANSFER_ATTEMPT_MISMATCH', 'Bank transfer does not belong to this payable checkout');
  }
  const order = await context.provider.orders.fetch(attempt.razorpayOrderId);
  if (order?.id !== attempt.razorpayOrderId || order.notes?.crm_attempt_id !== attempt.id
    || order.notes?.invoice_id !== attempt.invoiceId || !positiveAmount(order.amount)
    || BigInt(order.amount) !== attempt.amountPaise || order.currency !== attempt.currency || order.status !== 'created') {
    throw review('BANK_TRANSFER_ORDER_BINDING_MISMATCH', 'Bank transfer order cannot be verified');
  }
  const existing = await prisma.razorpayVirtualAccountBinding.findUnique({ where: { attemptId: attempt.id } });
  if (existing && !matchesBinding(existing, attempt, context, virtualAccountId || existing.virtualAccountId)) {
    throw review('BANK_TRANSFER_ASSOCIATION_CONFLICT', 'Saved virtual account does not match this checkout account and amount');
  }
  if (!virtualAccountId) {
    if (existing) {
      virtualAccountId = existing.virtualAccountId;
    } else {
      const notes = { crm_attempt_id: attempt.id, crm_va_proof: associationProof(attempt, context) };
      return { mode: context.mode, attemptId: attempt.id, providerOrderId: order.id,
        amount: String(attempt.amountPaise), currency: attempt.currency,
        expiresAt: new Date(expiresAt).toISOString(), sdk: { order_id: order.id, notes } };
    }
  }
  if (!providerId(virtualAccountId, 'va')) throw review('BANK_TRANSFER_REFERENCE_INVALID', 'Virtual account reference is invalid');
  const account = await context.provider.virtualAccounts.fetch(virtualAccountId);
  // A persisted binding already proves association independently of API-key rotation.
  // Only first-time binding requires notes authenticated with the current server secret.
  if (account?.id !== virtualAccountId || account.entity !== 'virtual_account' || account.status !== 'active'
    || (!existing && (account.notes?.crm_attempt_id !== attempt.id
      || account.notes?.crm_va_proof !== associationProof(attempt, context)))
    || account.closed_at != null || (account.close_by != null
      && (!timestamp(account.close_by) || account.close_by * 1000 <= Date.now()))) {
    throw review('BANK_TRANSFER_ASSOCIATION_UNVERIFIED', 'Virtual account association could not be confirmed');
  }
  const receivers = (Array.isArray(account.receivers) ? account.receivers : []).filter((receiver) => receiver?.entity === 'bank_account'
    && providerId(receiver.id, 'ba') && ['name', 'bank_name', 'ifsc', 'account_number']
      .every((field) => typeof receiver[field] === 'string' && receiver[field].trim().length > 0))
    .map(({ id, name, bank_name, ifsc, account_number }) => ({ id, name, bankName: bank_name, ifsc, accountNumber: account_number }));
  if (!receivers.length) throw review('BANK_TRANSFER_INSTRUCTIONS_UNAVAILABLE', 'Bank transfer instructions are unavailable');
  if (!existing) {
    try {
      await prisma.razorpayVirtualAccountBinding.create({ data: {
        attemptId: attempt.id, virtualAccountId: account.id, providerOrderId: order.id, mode: context.mode,
        accountId: context.accountId, amountPaise: attempt.amountPaise, currency: attempt.currency,
      } });
    } catch (error) {
      if (error?.code !== 'P2002') throw error;
      const winner = await prisma.razorpayVirtualAccountBinding.findUnique({ where: { attemptId: attempt.id } });
      if (!matchesBinding(winner, attempt, context, account.id)) {
        throw review('BANK_TRANSFER_ASSOCIATION_CONFLICT', 'Virtual account is already bound to a different checkout');
      }
    }
  }
  const currentAttempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { id: attempt.id } });
  if (!currentAttempt || !matchesBinding({ attemptId: attempt.id, virtualAccountId: account.id,
    providerOrderId: order.id, mode: context.mode, accountId: context.accountId,
    amountPaise: attempt.amountPaise, currency: attempt.currency }, currentAttempt, context, account.id)
    || !['CREATED', 'PENDING'].includes(currentAttempt.status)
    || dateBound(currentAttempt.expiresAt) !== expiresAt || expiresAt <= Date.now()
    || (account.close_by != null && account.close_by * 1000 <= Date.now())) {
    throw review('BANK_TRANSFER_ATTEMPT_MISMATCH', 'Checkout changed or expired while bank instructions were being fetched');
  }
  return { mode: context.mode, attemptId: attempt.id, providerOrderId: order.id,
    virtualAccountId: account.id, amount: String(attempt.amountPaise), currency: attempt.currency, receivers,
    closeBy: account.close_by ?? null,
    expiresAt: new Date(Math.min(expiresAt, account.close_by == null ? expiresAt : account.close_by * 1000)).toISOString() };
};

const getBankTransferWebhookPayload = (body) => {
  const payment = body?.payload?.payment?.entity;
  const account = body?.payload?.virtual_account?.entity;
  const transfer = body?.payload?.bank_transfer?.entity;
  return {
    accountId: providerId(body?.account_id, 'acc'),
    bankTransfer: {
      virtualAccountId: providerId(account?.id, 'va'),
      bankTransferId: providerId(transfer?.id, 'bt'),
      paymentId: providerId(transfer?.payment_id, 'pay'),
      amount: positiveAmount(transfer?.amount) ? transfer.amount : null,
      paymentAmount: positiveAmount(payment?.amount) ? payment.amount : null,
      currency: payment?.currency === 'INR' ? payment.currency : null,
      referencesValid: Boolean(providerId(payment?.id, 'pay') && providerId(account?.id, 'va')
        && providerId(transfer?.id, 'bt') && payment.id === transfer.payment_id && account.id === transfer.virtual_account_id),
    },
  };
};

const validateRazorpayBankTransferPayment = async (payment, { provider, mode, accountId, event, attempt: suppliedAttempt, providerOrder } = {}) => {
  const context = event ? requireWebhookContext(event, 'BANK_TRANSFER', provider)
    : getCheckoutAccountContext({ feature: 'BANK_TRANSFER', mode, accountId, provider, webhook: true });
  const references = event?.event === 'virtual_account.credited' ? event.payload.bankTransfer : null;
  if (event?.event === 'virtual_account.credited' && (!references?.referencesValid || !providerId(event.paymentId, 'pay')
    || references.paymentId !== event.paymentId || !providerId(references.virtualAccountId, 'va')
    || !providerId(references.bankTransferId, 'bt'))) {
    throw review('BANK_TRANSFER_REFERENCE_MISMATCH', 'Signed bank transfer references are incomplete or conflicting');
  }
  const feeBearer = getCustomConfiguration().feeBearer;
  if (feeBearer !== 'MERCHANT') {
    throw review(feeBearer === 'CUSTOMER' ? 'BANK_TRANSFER_CUSTOMER_FEE_REVIEW' : 'BANK_TRANSFER_FEE_BEARER_UNVERIFIED',
      'Bank transfer requires verified fee accounting before automatic invoice settlement');
  }
  if (!providerId(payment?.id, 'pay') || (event?.paymentId && payment.id !== event.paymentId) || payment.method !== 'bank_transfer'
    || !providerId(payment.order_id, 'order') || (event?.orderId && event.orderId !== payment.order_id)) {
    throw review('BANK_TRANSFER_PAYMENT_BINDING_MISMATCH', 'Fetched bank transfer payment does not match the signed event and a provider order');
  }
  if (['created', 'pending', 'authorized'].includes(payment.status)) {
    // Bank transfers auto-capture. Never issue a capture request from this consumer.
    throw retry('BANK_TRANSFER_CAPTURE_PENDING', 'Bank transfer capture is not yet confirmed by Razorpay');
  }
  if (payment.status !== 'captured' || payment.captured !== true) {
    throw review('BANK_TRANSFER_PAYMENT_STATE_REVIEW', 'Credited bank transfer is not a captured payment');
  }
  if (payment.international !== false || payment.currency !== 'INR' || !positiveAmount(payment.amount)
    || !timestamp(payment.created_at)) {
    throw review('BANK_TRANSFER_PAYMENT_DATA_REVIEW', 'Bank transfer currency, domestic status, amount or timestamp requires review');
  }
  if (payment.amount_refunded !== 0 || payment.refund_status != null) {
    throw review('BANK_TRANSFER_REFUND_REVIEW', 'Refunded bank transfer requires the existing Finance refund flow');
  }
  const attempt = await prisma.razorpayCheckoutAttempt.findUnique({ where: { razorpayOrderId: payment.order_id } });
  if (!attempt) throw retry('BANK_TRANSFER_CHECKOUT_BINDING_PENDING', 'Checkout binding is not yet visible');
  if (suppliedAttempt && (suppliedAttempt.id !== attempt.id || suppliedAttempt.razorpayOrderId !== attempt.razorpayOrderId
    || suppliedAttempt.mode !== attempt.mode || suppliedAttempt.amountPaise !== attempt.amountPaise
    || suppliedAttempt.currency !== attempt.currency || suppliedAttempt.invoiceId !== attempt.invoiceId
    || suppliedAttempt.customerId !== attempt.customerId
    || dateBound(suppliedAttempt.expiresAt) !== dateBound(attempt.expiresAt)
    || JSON.stringify(suppliedAttempt.allocationPlan) !== JSON.stringify(attempt.allocationPlan))) {
    throw review('BANK_TRANSFER_CHECKOUT_BINDING_MISMATCH', 'Settlement checkout does not match the persisted bank-transfer checkout');
  }
  if (attempt.mode !== context.mode) {
    throw review('BANK_TRANSFER_CHECKOUT_BINDING_MISSING', 'Bank transfer does not match a checkout attempt in this payment mode');
  }
  if (!['CREATED', 'PENDING', 'AUTHORIZED', 'FAILED', 'CAPTURED'].includes(attempt.status)
    || (attempt.status === 'CAPTURED' && attempt.razorpayPaymentId !== payment.id)) {
    throw review('BANK_TRANSFER_CHECKOUT_STATE_REVIEW', 'Bank transfer checkout state requires Finance review');
  }
  if (BigInt(payment.amount) !== attempt.amountPaise || payment.currency !== attempt.currency) {
    throw review('BANK_TRANSFER_AMOUNT_REVIEW', 'Bank transfer does not equal the bound invoice amount and currency');
  }
  if (references && (references.amount !== payment.amount || references.paymentAmount !== payment.amount
    || references.currency !== payment.currency)) {
    throw review('BANK_TRANSFER_SIGNED_AMOUNT_MISMATCH', 'Signed credit amount and currency do not match the fetched payment');
  }
  const order = await context.provider.orders.fetch(payment.order_id);
  if (providerOrder && (providerOrder.id !== order?.id || providerOrder.amount !== order?.amount
    || providerOrder.currency !== order?.currency
    || providerOrder.notes?.crm_attempt_id !== order?.notes?.crm_attempt_id
    || providerOrder.notes?.invoice_id !== order?.notes?.invoice_id
    || providerOrder.notes?.allocation_plan_hash !== order?.notes?.allocation_plan_hash)) {
    throw review('BANK_TRANSFER_ORDER_BINDING_MISMATCH', 'Settlement order differs from the fetched bank-transfer order');
  }
  const allocationHash = attempt.allocationPlan
    ? crypto.createHash('sha256').update(JSON.stringify(attempt.allocationPlan.map(({ invoiceId, amount }) => ({ invoiceId, amount })))).digest('hex') : null;
  if (order?.id !== attempt.razorpayOrderId || order.notes?.crm_attempt_id !== attempt.id
    || order.notes?.invoice_id !== attempt.invoiceId || (allocationHash && order.notes?.allocation_plan_hash !== allocationHash)
    || !positiveAmount(order.amount) || BigInt(order.amount) !== attempt.amountPaise || order.currency !== attempt.currency) {
    throw review('BANK_TRANSFER_ORDER_BINDING_MISMATCH', 'Fetched bank transfer order does not match the saved checkout binding');
  }
  const transfer = await context.provider.payments.bankTransfer(payment.id);
  if (transfer?.entity !== 'bank_transfer' || !providerId(transfer.id, 'bt') || transfer.payment_id !== payment.id
    || !providerId(transfer.virtual_account_id, 'va')
    || (references && (transfer.id !== references.bankTransferId || transfer.virtual_account_id !== references.virtualAccountId)) || !positiveAmount(transfer.amount)
    || transfer.amount !== payment.amount) {
    throw review('BANK_TRANSFER_CREDIT_BINDING_MISMATCH', 'Fetched bank credit does not match the payment, virtual account and amount');
  }
  const virtualAccount = await context.provider.virtualAccounts.fetch(transfer.virtual_account_id);
  const savedBinding = await prisma.razorpayVirtualAccountBinding.findUnique({ where: { attemptId: attempt.id } });
  if (!savedBinding) throw retry('BANK_TRANSFER_ASSOCIATION_PENDING', 'Virtual-account binding is not yet visible');
  if (!matchesBinding(savedBinding, attempt, context, transfer.virtual_account_id)) {
    throw review('BANK_TRANSFER_ASSOCIATION_MISSING', 'Bank credit has no verified virtual-account checkout association');
  }
  if (virtualAccount?.entity !== 'virtual_account' || virtualAccount.id !== transfer.virtual_account_id
    || !['active', 'closed'].includes(virtualAccount.status)
    || (virtualAccount.customer_id != null && virtualAccount.customer_id !== payment.customer_id)
    || (payment.customer_id != null && payment.customer_id !== virtualAccount.customer_id)) {
    throw review('BANK_TRANSFER_VIRTUAL_ACCOUNT_MISMATCH', 'Fetched virtual account does not match the credited payment');
  }
  if (!timestamp(virtualAccount.created_at) || payment.created_at < virtualAccount.created_at
    || (virtualAccount.status === 'closed' && virtualAccount.closed_at == null)) {
    throw review('BANK_TRANSFER_CLOSURE_UNKNOWN', 'Virtual account credit period cannot be verified');
  }
  for (const field of ['close_by', 'closed_at']) {
    if (virtualAccount[field] != null && !timestamp(virtualAccount[field])) {
      throw review('BANK_TRANSFER_CLOSURE_UNKNOWN', 'Virtual account closure timestamp is not recognized');
    }
    if (virtualAccount[field] != null && (field === 'close_by'
      ? payment.created_at >= virtualAccount[field] : payment.created_at > virtualAccount[field])) {
      throw review('BANK_TRANSFER_LATE_CREDIT_REVIEW', 'Bank transfer was received after the virtual account closure boundary');
    }
  }
  const paidAt = payment.created_at * 1000;
  const expiresAt = dateBound(attempt.expiresAt);
  const createdAt = dateBound(attempt.createdAt);
  if (!Number.isSafeInteger(expiresAt) || !Number.isSafeInteger(createdAt) || expiresAt <= createdAt) {
    throw review('BANK_TRANSFER_PERIOD_UNKNOWN', 'Checkout credit period cannot be verified');
  }
  if (paidAt >= expiresAt || payment.created_at < Math.floor(createdAt / 1000)) {
    throw review('BANK_TRANSFER_LATE_CREDIT_REVIEW', 'Bank transfer was received outside the checkout attempt period');
  }
  return {
    version: 1,
    accountId: context.accountId,
    mode: context.mode,
    virtualAccountId: virtualAccount.id,
    bankTransferId: transfer.id,
    providerOrderId: order.id,
    providerPaymentId: payment.id,
    attemptId: attempt.id,
    invoiceId: attempt.invoiceId,
    customerId: attempt.customerId,
    amountPaise: String(attempt.amountPaise),
    currency: attempt.currency,
    feeBearer,
    paymentCreatedAt: payment.created_at,
    fetchedAt: new Date().toISOString(),
  };
};

const validateRazorpayBankTransferSettlement = async ({ attempt, providerOrder, providerPayment, provider }) => {
  if (!attempt || !providerOrder || !providerPayment) {
    throw review('BANK_TRANSFER_SETTLEMENT_BINDING_MISSING', 'Settlement requires checkout, order and payment evidence');
  }
  return validateRazorpayBankTransferPayment(providerPayment, {
    provider, mode: attempt.mode, attempt, providerOrder,
  });
};

const resolveRazorpayBankTransferBinding = async (event, { provider } = {}) => {
  if (event?.event !== 'virtual_account.credited') throw review('BANK_TRANSFER_EVENT_UNSUPPORTED', 'Unsupported bank transfer event');
  const context = requireWebhookContext(event, 'BANK_TRANSFER', provider);
  if (!providerId(event.paymentId, 'pay')) throw review('BANK_TRANSFER_REFERENCE_MISMATCH', 'Signed payment reference is invalid');
  const payment = await context.provider.payments.fetch(event.paymentId);
  return validateRazorpayBankTransferPayment(payment, { provider: context.provider, event });
};

const reconcileRazorpayVirtualAccountCredit = async (event, { provider } = {}) => {
  const context = requireWebhookContext(event, 'BANK_TRANSFER', provider);
  const binding = await resolveRazorpayBankTransferBinding(event, { provider: context.provider });
  // Persist reconciled credit evidence under the inbox lease before existing ledger settlement.
  await persistWebhookEvidence(prisma, event, { bankTransferReconciliation: binding }, { orderId: binding.providerOrderId });
  const result = await checkout().settleCapturedPayment({
    paymentId: binding.providerPaymentId,
    providerOrderId: binding.providerOrderId,
    expectedInvoiceId: binding.invoiceId,
    source: 'VIRTUAL_ACCOUNT_CREDITED_WEBHOOK',
    provider: context.provider,
  });
  if (result.pending) throw retry('BANK_TRANSFER_CAPTURE_PENDING', 'Bank transfer capture confirmation is pending');
  if (result.failed || (!result.alreadyRecorded && result.attempt?.status !== 'CAPTURED')) {
    throw review('BANK_TRANSFER_SETTLEMENT_REVIEW', 'Bank transfer could not be confirmed in the invoice ledger');
  }
  return { state: 'PROCESSED', paymentId: binding.providerPaymentId, invoiceId: binding.invoiceId, providerStatus: 'captured' };
};

module.exports = {
  prepareRazorpayVirtualAccount,
  BANK_TRANSFER_BINDING_DEPENDENCY,
  getBankTransferWebhookPayload,
  resolveRazorpayBankTransferBinding,
  validateRazorpayBankTransferPayment,
  validateRazorpayBankTransferSettlement,
  reconcileRazorpayVirtualAccountCredit,
};
