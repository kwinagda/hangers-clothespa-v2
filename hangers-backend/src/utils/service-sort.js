const VARIANT_RANKS = [
  { rank: 10, patterns: [/^(plain|normal|regular)$/] },
  { rank: 20, patterns: [/^small$/] },
  { rank: 30, patterns: [/^medium$/] },
  { rank: 40, patterns: [/^large$/] },
  { rank: 50, patterns: [/^single$/] },
  { rank: 60, patterns: [/^double$/] },
  { rank: 70, patterns: [/^half\s+sleeves$/] },
  { rank: 80, patterns: [/^full\s+sleeves$/] },
  { rank: 90, patterns: [/^delicate$/] },
  { rank: 100, patterns: [/^silk$/] },
  { rank: 110, patterns: [/^fancy$/] },
  { rank: 120, patterns: [/^heavy$/] },
  { rank: 130, patterns: [/^very\s+heavy$/] },
  { rank: 140, patterns: [/^designer$/] },
  { rank: 150, patterns: [/^silk\s*\/\s*designer$/] },
  { rank: 160, patterns: [/^with\s+lining$/] },
  { rank: 170, patterns: [/^2\s+ply$/] },
];

const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const getVariantRank = (variantName) => {
  const normalized = normalizeText(variantName).toLowerCase();
  if (!normalized) return 0;

  for (const rule of VARIANT_RANKS) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) return rule.rank;
  }

  return 500;
};

const splitServiceName = (name) => {
  const normalized = normalizeText(name);
  const parts = normalized.split('-').map((part) => normalizeText(part)).filter(Boolean);
  if (parts.length <= 1) return { baseName: normalized, descriptors: [], variantName: '' };

  const descriptors = parts.slice(1);
  return {
    baseName: parts[0],
    descriptors,
    variantName: descriptors.join('-'),
  };
};

const compareServiceSmartDisplay = (a, b) => {
  const aName = splitServiceName(a?.name);
  const bName = splitServiceName(b?.name);
  const baseCompare = aName.baseName.localeCompare(bName.baseName, 'en-IN', { sensitivity: 'base', numeric: true });
  if (baseCompare !== 0) return baseCompare;

  const descriptorLength = Math.max(aName.descriptors.length, bName.descriptors.length);
  for (let index = 0; index < descriptorLength; index += 1) {
    const aDescriptor = aName.descriptors[index] || '';
    const bDescriptor = bName.descriptors[index] || '';
    const rankCompare = getVariantRank(aDescriptor) - getVariantRank(bDescriptor);
    if (rankCompare !== 0) return rankCompare;

    const textCompare = normalizeText(aDescriptor).localeCompare(normalizeText(bDescriptor), 'en-IN', {
      sensitivity: 'base',
      numeric: true,
    });
    if (textCompare !== 0) return textCompare;
  }

  return normalizeText(a?.name).localeCompare(normalizeText(b?.name), 'en-IN', { sensitivity: 'base', numeric: true });
};

const compareServiceDisplay = (a, b) => {
  const aSort = Number(a?.sortOrder || 0);
  const bSort = Number(b?.sortOrder || 0);
  if (aSort > 0 || bSort > 0) {
    if (aSort !== bSort) return (aSort || Number.MAX_SAFE_INTEGER) - (bSort || Number.MAX_SAFE_INTEGER);
  }

  return compareServiceSmartDisplay(a, b);
};

module.exports = {
  compareServiceDisplay,
  compareServiceSmartDisplay,
  getVariantRank,
  splitServiceName,
};
