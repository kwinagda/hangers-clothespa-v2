const DEFAULT_CAPTURED_PAYMENT_STATUSES = new Set(['CAPTURED', 'SUCCESS', 'PAID']);

const roundMoney = (value) => Number((Number(value || 0)).toFixed(2));

const paidAmountFromPayments = (payments = [], capturedStatuses = DEFAULT_CAPTURED_PAYMENT_STATUSES) =>
  roundMoney(payments.reduce((sum, payment) => {
    const status = String(payment?.status || '').toUpperCase();
    if (!capturedStatuses.has(status)) return sum;
    return sum + (String(payment?.kind || 'RECEIPT').toUpperCase() === 'REFUND' ? -Number(payment?.amount || 0) : Number(payment?.amount || 0));
  }, 0));

const paidAmountFromAllocations = (allocations = [], capturedStatuses = DEFAULT_CAPTURED_PAYMENT_STATUSES) =>
  roundMoney(allocations.reduce((sum, allocation) => {
    if (String(allocation?.status || 'POSTED').toUpperCase() !== 'POSTED') return sum;
    const paymentStatus = String(allocation?.payment?.status || 'CAPTURED').toUpperCase();
    if (!capturedStatuses.has(paymentStatus)) return sum;
    const refunded = (allocation?.refundAllocations || []).reduce((total, refund) => {
      if (String(refund?.status || 'POSTED').toUpperCase() !== 'POSTED') return total;
      const refundStatus = String(refund?.refundPayment?.status || 'CAPTURED').toUpperCase();
      return capturedStatuses.has(refundStatus) ? total + Number(refund?.amount || 0) : total;
    }, 0);
    return sum + Number(allocation?.amount || 0) - refunded;
  }, 0));

const deriveOrderPaymentState = (order, options = {}) => {
  const capturedStatuses = options.capturedStatuses || DEFAULT_CAPTURED_PAYMENT_STATUSES;
  const payments = Array.isArray(order?.payments) ? order.payments : [];
  const directAllocations = Array.isArray(order?.paymentAllocations) ? order.paymentAllocations : null;
  const nestedAllocations = payments.some((payment) => Array.isArray(payment?.allocations))
    ? payments.flatMap((payment) => (payment.allocations || []).map((allocation) => ({ ...allocation, payment })))
    : null;
  const allocations = directAllocations || nestedAllocations || [];
  const hasPaymentLedger = directAllocations !== null || nestedAllocations !== null;
  const paidFromPayments = paidAmountFromPayments(payments, capturedStatuses);
  const paidFromAllocations = paidAmountFromAllocations(allocations, capturedStatuses);
  const recordedPaid = Number(order?.paidAmount || 0);
  const paidAmount = hasPaymentLedger ? paidFromAllocations : roundMoney(recordedPaid);
  const writeOffAmount = roundMoney(order?.writeOffAmount || 0);
  const totalAmount = roundMoney(order?.totalAmount || 0);
  const effectivePaid = roundMoney(paidAmount + writeOffAmount);
  const balanceDue = roundMoney(Math.max(0, totalAmount - effectivePaid));
  const paymentStatus = totalAmount <= 0
    ? (paidAmount > 0 || writeOffAmount > 0 ? 'PAID' : (order?.paymentStatus || 'UNPAID'))
    : effectivePaid >= totalAmount
      ? 'PAID'
      : effectivePaid > 0
        ? 'PARTIAL'
        : 'UNPAID';

  return {
    paidAmount,
    paymentStatus,
    balanceDue,
    paidFromPayments,
    paidFromAllocations,
    recordedPaid: roundMoney(recordedPaid),
    ledgerLoaded: hasPaymentLedger,
    ledgerDrift: hasPaymentLedger ? roundMoney(recordedPaid - paidFromAllocations) : null,
  };
};

const withDerivedPaymentState = (order) => {
  const derived = deriveOrderPaymentState(order);
  return {
    ...order,
    paidAmount: derived.paidAmount,
    paymentStatus: derived.paymentStatus,
    balanceDue: derived.balanceDue,
    paymentLedgerDrift: derived.ledgerDrift,
  };
};

module.exports = {
  deriveOrderPaymentState,
  DEFAULT_CAPTURED_PAYMENT_STATUSES,
  paidAmountFromPayments,
  paidAmountFromAllocations,
  withDerivedPaymentState,
};
