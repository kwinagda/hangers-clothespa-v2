const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const getBusinessTimezone = () => process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata';
const getBusinessUtcOffset = () => process.env.BUSINESS_UTC_OFFSET || '+05:30';

const parseBusinessDateBoundary = (value, boundary = 'start') => {
  if (!value || !DATE_ONLY.test(String(value))) return null;
  const time = boundary === 'end' ? '23:59:59.999' : '00:00:00.000';
  const parsed = new Date(`${value}T${time}${getBusinessUtcOffset()}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const businessDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: getBusinessTimezone(),
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
};

const currentBusinessDateKey = () => businessDateKey(new Date());

module.exports = {
  businessDateKey,
  currentBusinessDateKey,
  getBusinessTimezone,
  getBusinessUtcOffset,
  parseBusinessDateBoundary,
};
