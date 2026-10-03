import { test } from 'node:test'
import assert from 'node:assert/strict'
import { supportedUpiIntentApps, upiIntentUnavailable } from '../../src/app/invoice/[slug]/checkout/razorpay-sdk.ts'

test('UPI discovery accepts string app identifiers from a list and filters malformed entries', () => {
  assert.deepEqual(supportedUpiIntentApps(['gpay', 'phonepe', 7, null]), ['gpay', 'phonepe'])
  assert.deepEqual(supportedUpiIntentApps([]), [])
})

test('UPI discovery treats non-list values as an unavailable contract result', () => {
  for (const value of [null, undefined, {}, 'gpay']) assert.equal(supportedUpiIntentApps(value), null)
})

test('UPI Intent is unavailable for Customer Fee Bearer even when the method list says enabled', () => {
  assert.equal(upiIntentUnavailable({ upi_intent: true }, { upi_intent: true }, 'CUSTOMER'), true)
  assert.equal(upiIntentUnavailable({ upi_intent: true }, { upi_intent: true }, 'MERCHANT'), false)
})

test('UPI Intent remains unavailable when either authoritative method snapshot disables it', () => {
  assert.equal(upiIntentUnavailable({ upi_intent: true }, { upi_intent: false }, 'MERCHANT'), true)
  assert.equal(upiIntentUnavailable({ upi_intent: false }, { upi_intent: true }, 'MERCHANT'), true)
})
