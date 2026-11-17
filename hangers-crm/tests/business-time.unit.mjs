import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addBusinessDays,
  businessDateKey,
  businessDateTimeLocalToIso,
  businessDateTimeToIso,
  businessDateToEffectiveIso,
  currentBusinessDateKey,
  formatBusinessDate,
  formatBusinessTime,
} from '../src/lib/businessTime.ts'

test('CRM formats timestamps in the business timezone regardless of host TZ', () => {
  const timestamp = new Date('2026-07-13T12:00:00.000Z')
  assert.equal(formatBusinessTime(timestamp), '5:30 pm')
  assert.equal(formatBusinessDate(timestamp), '13 Jul 2026')
})

test('date-only formatting preserves the selected calendar day', () => {
  assert.equal(formatBusinessDate('2026-07-13'), '13 Jul 2026')
  assert.equal(businessDateKey('2026-07-13'), '2026-07-13')
  assert.equal(businessDateKey('2026-02-30'), null)
  assert.equal(businessDateKey('2026-07-12T18:30:00.000Z'), '2026-07-13')
  assert.equal(addBusinessDays('2026-07-01', -1), '2026-06-30')
  assert.throws(() => addBusinessDays('2026-02-30', 1), RangeError)
})

test('business date/time inputs convert to the correct UTC instant', () => {
  assert.equal(businessDateTimeToIso('2026-07-13', '00:00'), '2026-07-12T18:30:00.000Z')
  assert.equal(businessDateTimeLocalToIso('2026-07-13T09:15'), '2026-07-13T03:45:00.000Z')
})

test('current-day effective entries preserve the actual time while backdated entries use local noon', () => {
  const now = new Date('2026-07-12T20:00:00.000Z')
  assert.equal(currentBusinessDateKey(now), '2026-07-13')
  assert.equal(businessDateToEffectiveIso('2026-07-13', now), now.toISOString())
  assert.equal(businessDateToEffectiveIso('2026-07-12', now), '2026-07-12T06:30:00.000Z')
})
