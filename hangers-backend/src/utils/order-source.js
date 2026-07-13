const normalizeKey = (value) => String(value || '')
  .trim()
  .replace(/[\s-]+/g, '_')
  .toUpperCase();

const normalizeOrderSource = (rawSource, orderSources) => {
  const sources = Array.isArray(orderSources) ? orderSources : [];
  const requested = normalizeKey(rawSource || 'COUNTER');

  for (const source of sources) {
    const sourceValue = normalizeKey(source.value);
    const aliases = Array.isArray(source.aliases) ? source.aliases : [];
    const accepted = new Set([sourceValue, ...aliases.map(normalizeKey)]);
    if (accepted.has(requested)) {
      return {
        value: source.value,
        label: source.label || source.value,
        initialStatus: source.initialStatus,
      };
    }
  }

  return null;
};

module.exports = { normalizeOrderSource };

