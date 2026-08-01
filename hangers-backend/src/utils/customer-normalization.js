const VALID_CUSTOMER_TAGS = new Set(['REGULAR', 'VIP', 'CORPORATE', 'NEW', 'INACTIVE']);
const VALID_LANGUAGES = new Set(['ENGLISH', 'HINDI', 'MARATHI']);

const collapseSpaces = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const normalizeCustomerPhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  const phone = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(phone) ? phone : null;
};

const titleCaseName = (value) => {
  const cleaned = collapseSpaces(value);
  if (!cleaned) return null;
  return cleaned.split(' ').map((word) => {
    if (/^[A-Z0-9&/-]{1,3}$/.test(word)) return word;
    return word
      .toLocaleLowerCase('en-IN')
      .replace(/(^|[.'’`-])([a-z])/g, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('en-IN')}`);
  }).join(' ');
};

const normalizeCustomerName = (value) => {
  const cleaned = collapseSpaces(value);
  if (!cleaned) return null;
  if (/^\+?\d[\d\s()+-]*$/.test(cleaned)) return null;
  return titleCaseName(cleaned);
};

const normalizeNullableText = (value) => {
  const cleaned = collapseSpaces(value);
  return cleaned || null;
};

const normalizeCustomerTag = (value) => {
  const tag = collapseSpaces(value).toUpperCase();
  return VALID_CUSTOMER_TAGS.has(tag) ? tag : 'REGULAR';
};

const normalizePreferredLanguage = (value) => {
  const language = collapseSpaces(value).toUpperCase();
  return VALID_LANGUAGES.has(language) ? language : 'ENGLISH';
};

const normalizeCustomerInput = (input = {}) => ({
  ...(Object.prototype.hasOwnProperty.call(input, 'phone') && { phone: normalizeCustomerPhone(input.phone) }),
  ...(Object.prototype.hasOwnProperty.call(input, 'name') && { name: normalizeCustomerName(input.name) }),
  ...(Object.prototype.hasOwnProperty.call(input, 'tag') && { tag: normalizeCustomerTag(input.tag) }),
  ...(Object.prototype.hasOwnProperty.call(input, 'notes') && { notes: normalizeNullableText(input.notes) }),
  ...(Object.prototype.hasOwnProperty.call(input, 'mapLocation') && { mapLocation: normalizeNullableText(input.mapLocation) }),
  ...(Object.prototype.hasOwnProperty.call(input, 'preferredLanguage') && { preferredLanguage: normalizePreferredLanguage(input.preferredLanguage) }),
});

module.exports = {
  VALID_CUSTOMER_TAGS,
  VALID_LANGUAGES,
  collapseSpaces,
  normalizeCustomerPhone,
  normalizeCustomerName,
  normalizeNullableText,
  normalizeCustomerTag,
  normalizePreferredLanguage,
  normalizeCustomerInput,
};
