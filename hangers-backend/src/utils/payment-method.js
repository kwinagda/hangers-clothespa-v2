const normalizePaymentMethod = (method) => {
  const raw = String(method || '').trim();
  const value = raw.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').toUpperCase();

  if (!value) return 'OTHER';
  if (['CASH'].includes(value)) return 'CASH';
  if (['UPI', 'GOOGLE_PAY', 'GPAY', 'G_PAY', 'PAYTM', 'PHONEPE', 'PHONE_PE', 'BHIM', 'GPAY_UPI'].includes(value)) return 'UPI';
  if (['CARD', 'CREDIT_CARD', 'DEBIT_CARD', 'CC', 'DC', 'POS', 'SWIPE'].includes(value)) return 'CARD';
  if (['RAZORPAY'].includes(value)) return 'RAZORPAY';
  if (['ONLINE', 'NETBANKING', 'NET_BANKING', 'BANK_TRANSFER', 'IMPS', 'NEFT', 'RTGS'].includes(value)) return 'ONLINE';
  if (['COD'].includes(value)) return 'COD';
  if (['WALLET'].includes(value)) return 'WALLET';
  if (['PAY_LATER', 'PAYLATER'].includes(value)) return 'Pay Later';
  if (['SPLIT'].includes(value)) return 'SPLIT';

  return 'OTHER';
};

module.exports = { normalizePaymentMethod };
