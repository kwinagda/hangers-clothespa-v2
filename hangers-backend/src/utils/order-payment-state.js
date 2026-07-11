const EXCLUDED_PAYMENT_STATUSES = new Set(['FAILED']);

const roundMoney = (value) => Number((Number(value || 0)).toFixed(2));

const paidAmountFromPayments = (payments = []) =>
  roundMoney(payments.reduce((sum, payment) => {
    const status = String(payment?.status || '').toUpperCase();
    if (EXCLUDED_PAYMENT_STATUSES.has(status)) return sum;
    return sum + Number(payment?.amount || 0);
  }, 0));

const deriveOrderPaymentState = (order) => {
  const paidFromPayments = paidAmountFromPayments(order?.payments || []);
  const recordedPaid = Number(order?.paidAmount || 0);
  const paidAmount = roundMoney(Math.max(recordedPaid, paidFromPayments));
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
  };
};

const withDerivedPaymentState = (order) => {
  const derived = deriveOrderPaymentState(order);
  return {
    ...order,
    paidAmount: derived.paidAmount,
    paymentStatus: derived.paymentStatus,
    balanceDue: derived.balanceDue,
  };
};

module.exports = {
  deriveOrderPaymentState,
  paidAmountFromPayments,
  withDerivedPaymentState,
};
