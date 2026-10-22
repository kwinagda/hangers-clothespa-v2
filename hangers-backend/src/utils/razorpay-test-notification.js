const isRazorpayTestPayment = (payment) => (
  String(payment?.method || '').toUpperCase() === 'RAZORPAY'
  && String(payment?.mode || '').toUpperCase() === 'TEST'
);

const shouldSuppressRazorpayTestNotification = (payment, normalizedPhone, recipientEnabled) => (
  isRazorpayTestPayment(payment)
  && !(normalizedPhone === '919930367267' && recipientEnabled === true)
);

module.exports = { isRazorpayTestPayment, shouldSuppressRazorpayTestNotification };
