const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE || 'Asia/Kolkata'
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

type DateInput = Date | string | number | null | undefined

const asDate = (value: DateInput) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (value === null || value === undefined || value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const parseDateKey = (value: string) => {
  if (!DATE_ONLY.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null
  return { year, month, day }
}

const businessParts = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value)
  return Object.fromEntries(parts.map(({ type, value: part }) => [type, part])) as Record<string, string>
}

export const currentBusinessDateKey = (now: Date = new Date()) => {
  const parts = businessParts(now)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export const businessDateKey = (value: DateInput) => {
  if (typeof value === 'string' && DATE_ONLY.test(value)) return parseDateKey(value) ? value : null
  const date = asDate(value)
  return date ? currentBusinessDateKey(date) : null
}

export const addBusinessDays = (dateKey: string, amount: number) => {
  const parsed = parseDateKey(dateKey)
  if (!parsed || !Number.isInteger(amount)) throw new RangeError('A valid business date and whole number of days are required')
  const { year, month, day } = parsed
  const date = new Date(Date.UTC(year, month - 1, day + amount))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

const dateTimeParts = (dateKey: string, time: string) => {
  const match = DATE_TIME_LOCAL.exec(`${dateKey}T${time}`)
  if (!match) return null
  const [, year, month, day, hour, minute, second = '0'] = match
  const values = [year, month, day, hour, minute, second].map(Number)
  const [y, m, d, h, min, s] = values
  const check = new Date(Date.UTC(y, m - 1, d, h, min, s))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d || h > 23 || min > 59 || s > 59) return null
  return { year: y, month: m, day: d, hour: h, minute: min, second: s }
}

export const businessDateTimeToIso = (dateKey: string, time = '12:00') => {
  const target = dateTimeParts(dateKey, time)
  if (!target) return null
  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second)
  let guess = targetAsUtc
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = businessParts(new Date(guess))
    const representedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
    const correction = targetAsUtc - representedAsUtc
    if (!correction) break
    guess += correction
  }
  return new Date(guess).toISOString()
}

export const businessDateToEffectiveIso = (dateKey: string, now: Date = new Date()) =>
  dateKey === currentBusinessDateKey(now) ? now.toISOString() : businessDateTimeToIso(dateKey, '12:00')

export const currentBusinessDateTimeLocal = (now: Date = new Date()) => {
  const parts = businessParts(now)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export const businessDateTimeLocalToIso = (value: string) => {
  const match = DATE_TIME_LOCAL.exec(value)
  if (!match) return null
  return businessDateTimeToIso(`${match[1]}-${match[2]}-${match[3]}`, `${match[4]}:${match[5]}:${match[6] || '00'}`)
}

const formatCalendarDate = (dateKey: string, options: Intl.DateTimeFormatOptions) => {
  const parts = dateTimeParts(dateKey, '12:00')
  if (!parts) return '-'
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)),
  )
}

export const formatBusinessDate = (value: DateInput, options: Intl.DateTimeFormatOptions = {}) => {
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    return formatCalendarDate(value, { day: '2-digit', month: 'short', year: 'numeric', ...options })
  }
  const date = asDate(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', ...options, timeZone: BUSINESS_TIME_ZONE,
  }).format(date)
}

export const formatBusinessTime = (value: DateInput, options: Intl.DateTimeFormatOptions = {}) => {
  const date = asDate(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric', minute: '2-digit', ...options, timeZone: BUSINESS_TIME_ZONE,
  }).format(date)
}

export const formatBusinessDateTime = (value: DateInput, options: Intl.DateTimeFormatOptions = {}) => {
  const date = asDate(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    ...options, timeZone: BUSINESS_TIME_ZONE,
  }).format(date)
}

export const formatBusinessMonth = (value: DateInput) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number)
    if (month < 1 || month > 12) return '-'
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 15)))
  }
  const date = asDate(value)
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: BUSINESS_TIME_ZONE }).format(date)
}
