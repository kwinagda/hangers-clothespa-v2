const isCompleteFailedOrderPaymentList = ({ response, orderId, amountPaise, currency }) => {
  const items = response?.items;
  const count = Number(response?.count);
  if (!Array.isArray(items) || items.length === 0 || !Number.isSafeInteger(count) || count !== items.length) return false;
  const expectedAmount = typeof amountPaise === 'bigint' ? amountPaise : BigInt(amountPaise);
  const expectedCurrency = String(currency || '').toUpperCase();
  return items.every((payment) => (
    typeof payment?.id === 'string'
    && payment.id.trim().length > 0
    && typeof payment.amount === 'number'
    && Number.isSafeInteger(payment.amount)
    && payment.order_id === orderId
    && BigInt(payment.amount) === expectedAmount
    && String(payment.currency || '').toUpperCase() === expectedCurrency
    && String(payment.status || '').toLowerCase() === 'failed'
    && payment.captured !== true
  ));
};

module.exports = { isCompleteFailedOrderPaymentList };
