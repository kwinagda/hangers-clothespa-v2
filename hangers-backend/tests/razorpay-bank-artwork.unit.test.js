const test = require('node:test');
const assert = require('node:assert/strict');
const artwork = require('../src/services/razorpay-brand-assets');

test('bank artwork has explicit Razorpay mappings and approved first-party FINO artwork', () => {
  const banks = artwork.filter((asset) => asset.kind === 'bank');
  assert.deepEqual(banks.map((asset) => asset.code), [
    'HDFC', 'ICIC', 'SBIN', 'UTIB', 'KKBK', 'YESB',
    'BARB', 'PUNB', 'CNRB', 'UBIN', 'IDFB', 'INDB', 'FDRL', 'BKID',
    'MAHB', 'IDIB', 'IOBA', 'CBIN', 'UCBA', 'PSIB', 'KARB', 'KVBL',
    'SIBL', 'CSBK', 'DLXB', 'TMBL', 'RATN', 'BDBL', 'AUBL', 'ESFB',
    'UJVN', 'JAKA', 'CIUB', 'DCBL', 'SVCB', 'COSB', 'SRCB', 'ABPB',
    'AIRP', 'IPOS', 'PYTM', 'BARB_R', 'VIJB', 'BKID_C', 'DEUT', 'FSFB',
    'IBKL', 'ALLA', 'JSFB', 'LAVB_R', 'NSPB', 'ORBC', 'UTBI', 'PUNB_R',
    'SCBL', 'CORP', 'FINO',
  ]);
  for (const asset of banks.filter((asset) => asset.code !== 'FINO')) {
    assert.equal(asset.url, `https://cdn.razorpay.com/bank/${asset.code}.gif`);
    assert.ok(asset.label);
    assert.equal(Object.hasOwn(asset, 'enabled'), false);
    assert.equal(Object.isFrozen(asset), true);
  }
  assert.deepEqual(
    (({ label, url, source }) => ({ label, url, source }))(banks.find((asset) => asset.code === 'FINO')),
    { label: 'Fino Payments Bank', url: '/payment-provider-logos/fino.svg', source: 'https://www.fino.bank.in/images/fino-logo.svg' },
  );
  assert.equal(Object.isFrozen(banks.find((asset) => asset.code === 'FINO')), true);
});

test('checkout artwork uses Razorpay CDN or explicitly sourced first-party provider artwork', () => {
  for (const asset of artwork) {
    if (asset.url.startsWith('/payment-provider-logos/')) {
      assert.match(asset.url, /^\/payment-provider-logos\/(cashe\.png|tvs-credit\.svg|liquiloans\.png|fino\.svg)$/);
      assert.match(asset.source, /^https:\/\/(www\.cashe\.co\.in|www\.tvscredit\.com|www\.liquiloans\.com|www\.fino\.bank\.in)\//);
    } else {
      const url = new URL(asset.url);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.hostname, 'cdn.razorpay.com');
      assert.equal(asset.source, asset.url);
    }
  }

  const urls = new Map(artwork.map((asset) => [`${asset.kind}:${asset.code.toLowerCase()}`, asset.url]));
  assert.equal(urls.get('network:maes'), 'https://cdn.razorpay.com/card-networks/maestro.svg');
  assert.equal(urls.get('cardless_emi:earlysalary'), 'https://cdn.razorpay.com/cardless_emi/earlysalary.svg');
  assert.equal(urls.get('paylater:amazonpay'), 'https://cdn.razorpay.com/wallet-sq/amazonpay.png');
  assert.equal(urls.get('paylater:icic'), 'https://cdn.razorpay.com/paylater/icic.svg');
  assert.equal(urls.get('wallet:payzapp'), 'https://cdn.razorpay.com/wallet-sq/payzapp.png');
  assert.equal(urls.get('wallet:olamoney'), 'https://cdn.razorpay.com/wallet-sq/olamoney.png');

  const cardless = new Map(artwork.filter((asset) => asset.kind === 'cardless_emi').map((asset) => [asset.code, asset]));
  assert.deepEqual(['cshe', 'tvsc', 'liquiloans'].map((code) => {
    const { label, url, source } = cardless.get(code);
    return { label, url, source };
  }), [
    { label: 'CASHe', url: '/payment-provider-logos/cashe.png', source: 'https://www.cashe.co.in/wp-content/themes/cashe/images/logo.png' },
    { label: 'TVS Credit', url: '/payment-provider-logos/tvs-credit.svg', source: 'https://www.tvscredit.com/wp-content/uploads/2025/03/tvs_credit_logo.svg' },
    { label: 'LiquiLoans', url: '/payment-provider-logos/liquiloans.png', source: 'https://www.liquiloans.com/investment-assets/img/logo_new.png' },
  ]);
});

test('cardless EMI catalogue maps every observed provider to verified artwork', () => {
  const urls = new Map(artwork
    .filter((asset) => asset.kind === 'cardless_emi')
    .map((asset) => [asset.code, asset.url]));

  for (const [code, extension] of [
    ['earlysalary', 'svg'], ['zestmoney', 'svg'], ['hdfc', 'svg'], ['kkbk', 'svg'],
    ['idfb', 'svg'], ['icic', 'svg'], ['walnut369', 'svg'], ['sezzle', 'svg'],
    ['instant_emi', 'svg'], ['shopse', 'png'], ['snapmint', 'svg'],
  ]) {
    assert.equal(urls.get(code), `https://cdn.razorpay.com/cardless_emi/${code}.${extension}`);
  }

  assert.equal(urls.get('cshe'), '/payment-provider-logos/cashe.png');
  assert.equal(urls.get('tvsc'), '/payment-provider-logos/tvs-credit.svg');
  assert.equal(urls.get('liquiloans'), '/payment-provider-logos/liquiloans.png');
});
