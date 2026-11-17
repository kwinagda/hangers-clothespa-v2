const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const getBusinessTimezone = () => process.env.BUSINESS_TIMEZONE || 'Asia/Kolkata';
const offsetMinutesAt = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: getBusinessTimezone(),
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(lookup.year), Number(lookup.month) - 1, Number(lookup.day),
    Number(lookup.hour), Number(lookup.minute), Number(lookup.second),
  );
  return (localAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
};

const getBusinessUtcOffset = (value = new Date()) => {
  if (process.env.BUSINESS_UTC_OFFSET) {
    const match = /^([+-])(\d{2}):(\d{2})$/.exec(process.env.BUSINESS_UTC_OFFSET);
    if (!match || Number(match[2]) > 23 || Number(match[3]) > 59) return null;
    return process.env.BUSINESS_UTC_OFFSET;
  }
  const minutes = offsetMinutesAt(value);
  if (minutes === null) return null;
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
};

const parseBusinessDateBoundary = (value, boundary = 'start') => {
  if (!value || !DATE_ONLY.test(String(value))) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() + 1 !== month || calendarCheck.getUTCDate() !== day) return null;
  const time = boundary === 'end' ? [23, 59, 59, 999] : [0, 0, 0, 0];
  const targetAsUtc = Date.UTC(year, month - 1, day, time[0], time[1], time[2], time[3]);
  let timestamp = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const configuredOffset = getBusinessUtcOffset(new Date(timestamp));
    const match = configuredOffset && /^([+-])(\d{2}):(\d{2})$/.exec(configuredOffset);
    const offsetMinutes = match
      ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1)
      : null;
    if (offsetMinutes === null) return null;
    const nextTimestamp = targetAsUtc - offsetMinutes * 60000;
    if (nextTimestamp === timestamp) break;
    timestamp = nextTimestamp;
  }
  return new Date(timestamp);
};

const parseBusinessDateTime = (dateKey, time = '12:00:00') => {
  if (!DATE_ONLY.test(String(dateKey))) return null;
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(String(time));
  if (!timeMatch) return null;
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const [hour, minute, second, millisecond] = [timeMatch[1], timeMatch[2], timeMatch[3] || '0', (timeMatch[4] || '0').padEnd(3, '0')].map(Number);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() + 1 !== month || calendarCheck.getUTCDate() !== day
    || hour > 23 || minute > 59 || second > 59) return null;
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let timestamp = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const configuredOffset = getBusinessUtcOffset(new Date(timestamp));
    const match = configuredOffset && /^([+-])(\d{2}):(\d{2})$/.exec(configuredOffset);
    const offsetMinutes = match
      ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1)
      : null;
    if (offsetMinutes === null) return null;
    const nextTimestamp = targetAsUtc - offsetMinutes * 60000;
    if (nextTimestamp === timestamp) break;
    timestamp = nextTimestamp;
  }
  return new Date(timestamp);
};

const businessDateKey = (value) => {
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    return parseBusinessDateBoundary(value, 'start') ? value : null;
  }
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

const addBusinessDateDays = (dateKey, amount) => {
  if (!DATE_ONLY.test(String(dateKey)) || !Number.isInteger(amount)) return null;
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  date.setUTCDate(date.getUTCDate() + amount);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const parseBusinessMonthBoundary = (year, month, boundary = 'start') => {
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  if (!Number.isInteger(parsedYear) || parsedYear < 1 || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return null;
  const day = boundary === 'end' ? new Date(Date.UTC(parsedYear, parsedMonth, 0)).getUTCDate() : 1;
  return parseBusinessDateBoundary(`${String(parsedYear).padStart(4, '0')}-${String(parsedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`, boundary);
};

module.exports = {
  businessDateKey,
  addBusinessDateDays,
  currentBusinessDateKey,
  getBusinessTimezone,
  getBusinessUtcOffset,
  parseBusinessDateBoundary,
  parseBusinessDateTime,
  parseBusinessMonthBoundary,
};
