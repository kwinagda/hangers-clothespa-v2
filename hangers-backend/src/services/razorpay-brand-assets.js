// Public Razorpay-hosted assets observed in Standard Checkout on 1 October 2026.
// User approved their use after support ticket #21192410. These are artwork,
// not a payment-method availability list; the SDK/API controls availability.
const source = 'https://checkout.razorpay.com/v1/checkout.js';
const assets = [
  ['network', 'VISA', 'Visa', 'https://cdn.razorpay.com/card-networks/visa.svg'],
  ['network', 'MC', 'Mastercard', 'https://cdn.razorpay.com/card-networks/mastercard.svg'],
  ['network', 'RUPAY', 'RuPay', 'https://cdn.razorpay.com/card-networks/rupay.svg'],
  ['network', 'AMEX', 'American Express', 'https://cdn.razorpay.com/card-networks/amex.svg'],
  ['upi', 'gpay', 'Google Pay', 'https://cdn.razorpay.com/app/googlepay.svg'],
  ['upi', 'phonepe', 'PhonePe', 'https://cdn.razorpay.com/app/phonepe.svg'],
  ['upi', 'paytm', 'Paytm', 'https://cdn.razorpay.com/app/paytm.svg'],
  ['upi', 'cred', 'CRED', 'https://cdn.razorpay.com/app/cred_circle.png'],
  ['upi', 'popclubapp', 'POP', 'https://cdn.razorpay.com/app/popclubapp.svg'],
  ['upi', 'navi', 'Navi', 'https://cdn.razorpay.com/app/navi.png'],
  ['wallet', 'amazonpay', 'Amazon Pay', 'https://cdn.razorpay.com/wallet-sq/amazonpay.png'],
  ['wallet', 'phonepe', 'PhonePe', 'https://cdn.razorpay.com/wallet-sq/phonepe.png'],
  ['wallet', 'mobikwik', 'MobiKwik', 'https://cdn.razorpay.com/wallet-sq/mobikwik.png'],
  ['wallet', 'airtelmoney', 'Airtel Money', 'https://cdn.razorpay.com/wallet-sq/airtelmoney.png'],
].map(([kind, code, label, url]) => Object.freeze({ kind, code, label, url, source }));

module.exports = Object.freeze(assets);
