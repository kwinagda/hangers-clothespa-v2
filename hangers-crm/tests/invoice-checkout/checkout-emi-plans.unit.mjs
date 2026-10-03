import { test } from 'node:test'
import assert from 'node:assert/strict'
import { issuerPlans } from '../../src/app/invoice/[slug]/checkout/razorpay-sdk.ts'

const eligible = { issuerCode: 'HDFC', emiAvailable: true }

test('issuer EMI plans use the documented emi_plans object shape', () => {
  const methods = { emi: true, emi_plans: { HDFC: { min_amount: 10000, plans: { 3: 12, 6: 12 } } } }
  assert.deepEqual(issuerPlans(methods, eligible, 18000).map(({ duration, rate, minimum }) => ({ duration, rate, minimum })), [
    { duration: 3, rate: 12, minimum: 10000 },
    { duration: 6, rate: 12, minimum: 10000 },
  ])
})

test('undocumented EMI response aliases and array shapes fail closed', () => {
  assert.deepEqual(issuerPlans({ emi: true, emi_options: { HDFC: [{ duration: 3, interest: 12, min_amount: 10000 }] } }, eligible, 18000), [])
  assert.deepEqual(issuerPlans({ emi: true, emi_plans: { HDFC: [{ duration: 3, interest: 12, min_amount: 10000 }] } }, eligible, 18000), [])
  assert.deepEqual(issuerPlans({ emi: true, emi_plans: { HDFC: { min_amount: 10000, plans: [{ duration: 3, interest: 12 }] } } }, eligible, 18000), [])
})
