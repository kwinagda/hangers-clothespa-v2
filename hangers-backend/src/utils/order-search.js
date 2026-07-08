const getOrderNumberSearchTerms = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const terms = new Set([raw]);
  const match = raw.match(/^([A-Za-z]+-)(0*)(\d+)(.*)$/);
  if (match) {
    const [, prefix, zeros, digits, suffix] = match;
    const unpadded = `${prefix}${Number.parseInt(digits, 10)}${suffix}`;
    terms.add(unpadded);
    if (!zeros) {
      terms.add(`${prefix}${digits.padStart(3, '0')}${suffix}`);
    }
  }

  return [...terms];
};

const buildOrderSearchOr = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const orderLike = /^[A-Za-z]+-0*\d+.*$/.test(raw);
  const orderNumberFilters = getOrderNumberSearchTerms(raw).map((term) => ({
    orderNumber: orderLike
      ? { equals: term, mode: 'insensitive' }
      : { contains: term, mode: 'insensitive' },
  }));

  return [
    ...orderNumberFilters,
    { customer: { name: { contains: raw, mode: 'insensitive' } } },
    { customer: { phone: { contains: raw } } },
  ];
};

module.exports = { buildOrderSearchOr, getOrderNumberSearchTerms };
