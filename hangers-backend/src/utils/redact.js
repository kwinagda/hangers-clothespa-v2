const maskPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length <= 4) return '***';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

const maskToken = (value) => {
  const text = String(value || '');
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
};

const providerErrorSummary = (err) => {
  const status = err?.response?.status;
  const code = err?.response?.data?.code || err?.response?.data?.error || err?.code;
  const message = err?.response?.data?.message || err?.message;
  return {
    ...(status && { status }),
    ...(code && { code }),
    ...(message && { message: String(message).slice(0, 160) }),
  };
};

module.exports = { maskPhone, maskToken, providerErrorSummary };

