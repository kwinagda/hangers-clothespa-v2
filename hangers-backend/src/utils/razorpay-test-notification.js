const isRazorpayTestPayment = (payment) => (
  String(payment?.method || '').toUpperCase() === 'RAZORPAY'
  && String(payment?.mode || '').toUpperCase() === 'TEST'
);

module.exports = { isRazorpayTestPayment };
