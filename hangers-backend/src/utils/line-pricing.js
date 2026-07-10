const roundMoney = (value) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

const parseMoney = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, roundMoney(parsed));
};

const parsePositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeLineDiscountType = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'FLAT' || normalized === 'PERCENT') return normalized;
  return null;
};

const normalizeUpcharges = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => ({
    ...entry,
    amount: parseMoney(entry?.amount),
  }));
};

const getUpchargeTotal = (upcharges = []) =>
  roundMoney(upcharges.reduce((sum, item) => sum + parseMoney(item?.amount), 0));

const calculateLineDiscountAmount = ({ lineTotal, quantity, lineDiscountType, lineDiscountValue, explicitAmount }) => {
  if (lineTotal <= 0) return 0;

  if (lineDiscountType === 'PERCENT') {
    const percent = Math.min(100, parseMoney(lineDiscountValue));
    return roundMoney((lineTotal * percent) / 100);
  }

  if (lineDiscountType === 'FLAT') {
    const perUnitDiscount = parseMoney(lineDiscountValue);
    return Math.min(lineTotal, roundMoney(perUnitDiscount * parsePositiveInt(quantity, 1)));
  }

  return Math.min(lineTotal, parseMoney(explicitAmount));
};

const normalizeOrderItem = (item, options = {}) => {
  const { defaultServiceName = '', allowUpcharges = false } = options;
  const quantity = parsePositiveInt(item?.quantity, 1);
  const unitPrice = parseMoney(item?.unitPrice);
  const baseUnitPrice = parseMoney(item?.baseUnitPrice ?? item?.originalUnitPrice ?? unitPrice, unitPrice);
  const lineDiscountType = normalizeLineDiscountType(item?.lineDiscountType);
  const lineDiscountValue = lineDiscountType ? parseMoney(item?.lineDiscountValue) : 0;
  const lineTotal = roundMoney(unitPrice * quantity);
  const lineDiscountAmount = calculateLineDiscountAmount({
    lineTotal,
    quantity,
    lineDiscountType,
    lineDiscountValue,
    explicitAmount: item?.lineDiscountAmount,
  });
  const upcharges = allowUpcharges ? normalizeUpcharges(item?.upcharges) : [];
  const upchargeTotal = allowUpcharges ? getUpchargeTotal(upcharges) : 0;
  const subtotal = roundMoney(Math.max(0, lineTotal - lineDiscountAmount) + upchargeTotal);

  return {
    serviceId: item?.serviceId || null,
    serviceName: String(item?.serviceName || defaultServiceName).trim(),
    garmentType: String(item?.garmentType || '').trim(),
    variant: item?.variant ? String(item.variant).trim() : null,
    quantity,
    baseUnitPrice,
    unitPrice,
    lineDiscountType,
    lineDiscountValue,
    lineDiscountAmount,
    lineTotal,
    subtotal,
    upcharges,
    upchargeTotal,
    notes: item?.notes ? String(item.notes).trim() : null,
  };
};

module.exports = {
  roundMoney,
  parseMoney,
  normalizeLineDiscountType,
  getUpchargeTotal,
  calculateLineDiscountAmount,
  normalizeOrderItem,
};
