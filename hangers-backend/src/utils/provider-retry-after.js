const providerRetryAfterMs = (error, now = Date.now()) => {
  const headers = error?.response?.headers || error?.headers;
  const value = headers?.get?.('retry-after') || headers?.['retry-after']
    || headers?.['Retry-After'] || error?.details?.retryAfter;
  if (typeof value !== 'string' || value.length > 128 || /[\r\n]/.test(value)) return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const milliseconds = Number(text) * 1000;
    return Number.isSafeInteger(milliseconds) && now + milliseconds <= 8.64e15 ? milliseconds : null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
};

module.exports = { providerRetryAfterMs };
