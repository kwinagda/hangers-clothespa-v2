const prisma = require('../config/database');
const { PAYMENT_QR_SETTING_KEY, DEFAULT_PAYMENT_QR_SETTINGS } = require('../config/print-settings');

const normalizePaymentAccount = (account = {}, fallback = {}) => ({
  id: String(account.id || fallback.id || 'primary'),
  label: String(account.label || fallback.label || 'Primary Account'),
  isDefault: Boolean(account.isDefault),
  provider: String(account.provider || fallback.provider || 'UPI'),
  vpa: String(account.vpa || fallback.vpa || '').trim(),
  gpayNumber: String(account.gpayNumber || fallback.gpayNumber || '').trim(),
  payeeName: String(account.payeeName || fallback.payeeName || 'Hangers Clothes Spa').trim(),
  qrImageUrl: String(account.qrImageUrl || fallback.qrImageUrl || '').trim(),
  qrImageDataUrl: String(account.qrImageDataUrl || fallback.qrImageDataUrl || '').trim(),
});

const normalizePaymentQrSettings = (settings = {}) => {
  const legacyAccount = normalizePaymentAccount({
    id: settings.defaultAccountId || 'primary',
    label: settings.label || 'Primary Account',
    isDefault: true,
    provider: settings.provider,
    vpa: settings.vpa,
    gpayNumber: settings.gpayNumber,
    payeeName: settings.payeeName,
    qrImageUrl: settings.qrImageUrl,
    qrImageDataUrl: settings.qrImageDataUrl,
  }, DEFAULT_PAYMENT_QR_SETTINGS.accounts[0]);

  const rawAccounts = Array.isArray(settings.accounts) && settings.accounts.length
    ? settings.accounts
    : [legacyAccount];
  const accounts = rawAccounts.map((account, index) => normalizePaymentAccount(account, index === 0 ? legacyAccount : {}));
  const requestedDefaultId = settings.defaultAccountId || accounts.find((account) => account.isDefault)?.id || accounts[0]?.id || 'primary';
  const defaultAccountId = accounts.some((account) => account.id === requestedDefaultId)
    ? requestedDefaultId
    : accounts[0]?.id || 'primary';

  return {
    provider: String(settings.provider || DEFAULT_PAYMENT_QR_SETTINGS.provider || 'UPI'),
    vpa: String(settings.vpa || '').trim(),
    gpayNumber: String(settings.gpayNumber || '').trim(),
    payeeName: String(settings.payeeName || DEFAULT_PAYMENT_QR_SETTINGS.payeeName || 'Hangers Clothes Spa').trim(),
    defaultAccountId,
    accounts: accounts.map((account) => ({ ...account, isDefault: account.id === defaultAccountId })),
  };
};

const publicBaseUrl = () => String(
  process.env.PUBLIC_API_URL
  || process.env.CRM_URL
  || process.env.CUSTOMER_APP_URL
  || ''
).replace(/\/$/, '');

const getPaymentAccountQrMediaUrl = (account) => {
  if (!account) return '';
  if (account.qrImageUrl) return account.qrImageUrl;
  if (!account.qrImageDataUrl || !account.id) return '';
  const baseUrl = publicBaseUrl();
  if (!baseUrl || /^https?:\/\/localhost\b|^https?:\/\/127\./.test(baseUrl)) return '';
  return `${baseUrl}/api/v1/settings/payment-accounts/${encodeURIComponent(account.id)}/qr`;
};

const getPaymentQrSettings = async (tx = prisma) => {
  const setting = await tx.setting.findUnique({ where: { key: PAYMENT_QR_SETTING_KEY } });
  if (!setting?.value) return normalizePaymentQrSettings(DEFAULT_PAYMENT_QR_SETTINGS);
  try {
    return normalizePaymentQrSettings(JSON.parse(setting.value));
  } catch {
    return normalizePaymentQrSettings(DEFAULT_PAYMENT_QR_SETTINGS);
  }
};

const getDefaultPaymentAccount = async (tx = prisma) => {
  const settings = await getPaymentQrSettings(tx);
  const account = settings.accounts.find((item) => item.id === settings.defaultAccountId) || settings.accounts[0];
  return { settings, account };
};

module.exports = {
  normalizePaymentQrSettings,
  getPaymentQrSettings,
  getDefaultPaymentAccount,
  getPaymentAccountQrMediaUrl,
};
