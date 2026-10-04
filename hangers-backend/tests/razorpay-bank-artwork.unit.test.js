const test = require('node:test');
const assert = require('node:assert/strict');
const artwork = require('../src/services/razorpay-brand-assets');

test('supplied bank artwork has explicit Razorpay-hosted mappings, not activation rules', () => {
  const banks = artwork.filter((asset) => asset.kind === 'bank');
  assert.deepEqual(banks.map((asset) => asset.code), [
    'HDFC', 'ICIC', 'SBIN', 'UTIB', 'KKBK', 'YESB',
    'BARB', 'PUNB', 'CNRB', 'UBIN', 'IDFB', 'INDB', 'FDRL', 'BKID',
    'MAHB', 'IDIB', 'IOBA', 'CBIN', 'UCBA', 'PSIB', 'KARB', 'KVBL',
    'SIBL', 'CSBK', 'DLXB', 'TMBL', 'RATN', 'BDBL', 'AUBL', 'ESFB',
    'UJVN', 'JAKA', 'CIUB', 'DCBL', 'SVCB', 'COSB', 'SRCB', 'ABPB',
    'AIRP', 'IPOS', 'PYTM',
  ]);
  assert.equal(banks.some((asset) => asset.code === 'FINO'), false);
  for (const asset of banks) {
    assert.equal(asset.url, `https://cdn.razorpay.com/bank/${asset.code}.gif`);
    assert.ok(asset.label);
    assert.equal(Object.hasOwn(asset, 'enabled'), false);
    assert.equal(Object.isFrozen(asset), true);
  }
});
