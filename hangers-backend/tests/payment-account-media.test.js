const test = require('node:test');
const assert = require('node:assert/strict');

const { getPaymentAccountQrMediaUrl } = require('../src/services/payment-account-settings.service');

test('uploaded payment QR media uses the configured public API origin', () => {
  const previous = process.env.PUBLIC_API_URL;
  try {
    process.env.PUBLIC_API_URL = 'https://api.hangers.example';
    assert.equal(
      getPaymentAccountQrMediaUrl({ id: 'primary', qrImageDataUrl: 'data:image/png;base64,abc' }),
      'https://api.hangers.example/api/v1/settings/payment-accounts/primary/qr'
    );
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = previous;
  }
});
