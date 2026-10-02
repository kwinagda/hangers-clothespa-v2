import { test } from 'node:test'
import assert from 'node:assert/strict'
import { supportedUpiIntentApps } from '../../src/app/invoice/[slug]/checkout/razorpay-sdk.ts'

test('UPI discovery accepts string app identifiers from a list and filters malformed entries', () => {
  assert.deepEqual(supportedUpiIntentApps(['gpay', 'phonepe', 7, null]), ['gpay', 'phonepe'])
  assert.deepEqual(supportedUpiIntentApps([]), [])
})

test('UPI discovery treats non-list values as an unavailable contract result', () => {
  for (const value of [null, undefined, {}, 'gpay']) assert.equal(supportedUpiIntentApps(value), null)
})
