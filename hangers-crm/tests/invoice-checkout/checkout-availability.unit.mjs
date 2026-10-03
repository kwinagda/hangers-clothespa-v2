import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkoutAvailability } from '../../src/app/invoice/[slug]/checkout/availability.ts'

test('paid invoice stays confirmable without another payment', () => {
  assert.equal(checkoutAvailability('0', 'PAID', false), 'PAID')
  assert.equal(checkoutAvailability('100', 'PAID', false), 'UNAVAILABLE')
})

test('combined zero balance is not falsely attributed to a Razorpay capture', () => {
  assert.equal(checkoutAvailability(0, undefined, true), 'NO_BALANCE')
  assert.equal(checkoutAvailability(5880, undefined, true), 'PAYABLE')
  assert.equal(checkoutAvailability(0, 'OPEN', false), 'NO_BALANCE')
})

test('cancelled invoices and invalid balances never expose checkout', () => {
  assert.equal(checkoutAvailability(100, 'CANCELLED', false), 'CANCELLED')
  assert.equal(checkoutAvailability(0, 'VOID', false), 'CANCELLED')
  for (const balance of [-1, NaN, Infinity, 'invalid']) {
    assert.equal(checkoutAvailability(balance, 'OPEN', false), 'UNAVAILABLE')
  }
  assert.equal(checkoutAvailability(0.5, 'OPEN', false), 'BELOW_MINIMUM')
  assert.equal(checkoutAvailability(1, 'OPEN', false), 'PAYABLE')
})
