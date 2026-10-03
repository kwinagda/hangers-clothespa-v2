import test from 'node:test'
import assert from 'node:assert/strict'
import { checkoutRequestMessage, isInvoiceNotFound } from '../../src/app/invoice/[slug]/checkout/checkout-errors.ts'
import { checkoutRequest } from '../../src/app/invoice/[slug]/checkout/razorpay-sdk.ts'

test('a provider-coded missing invoice is distinguished from payment status', () => {
  const error = { status: 404, code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' }
  assert.equal(isInvoiceNotFound(error), true)
  assert.match(checkoutRequestMessage(error, 'status'), /invoice link is no longer available/i)
  assert.match(checkoutRequestMessage(error, 'methods'), /invoice link is no longer available/i)
})

test('a missing API route never exposes its raw path', () => {
  const error = { status: 404, message: 'Route not found: GET /api/v1/public/invoices/secret/payment/status' }
  assert.equal(isInvoiceNotFound(error), false)
  assert.doesNotMatch(checkoutRequestMessage(error, 'status'), /Route not found|\/api\/v1|secret/)
  assert.doesNotMatch(checkoutRequestMessage(error, 'methods'), /Route not found|\/api\/v1|secret/)
})

test('transient status and methods failures get distinct useful guidance', () => {
  const error = { status: 503, message: 'internal proxy stack trace' }
  assert.match(checkoutRequestMessage(error, 'status'), /Do not pay again/i)
  assert.match(checkoutRequestMessage(error, 'methods'), /Retry loading payment methods/i)
  assert.doesNotMatch(checkoutRequestMessage(error, 'status'), /proxy stack trace/)
})

test('rate limiting and actionable client errors retain specific guidance', () => {
  assert.match(checkoutRequestMessage({ status: 429 }, 'status'), /rate-limited/i)
  assert.equal(checkoutRequestMessage({ status: 400, message: 'Invoice balance changed' }, 'methods'), 'Invoice balance changed')
  assert.match(checkoutRequestMessage({}, 'methods'), /Secure payment details could not be loaded/i)
})

test('checkout preparation errors are customer-safe and preserve useful invoice actions', () => {
  const backendFailure = { status: 500, code: 'CHECKOUT_ORDER_CREATE_FAILED', message: 'Failed to start online payment' }
  assert.match(checkoutRequestMessage(backendFailure, 'prepare'), /Check payment status before trying again/i)
  assert.doesNotMatch(checkoutRequestMessage(backendFailure, 'prepare'), /CHECKOUT_ORDER_CREATE_FAILED|Failed to start online payment/)
  assert.match(checkoutRequestMessage({ status: 409, code: 'CHECKOUT_ATTEMPT_STALE' }, 'prepare'), /Reload the invoice/i)
  assert.match(checkoutRequestMessage({ status: 409, code: 'ORDER_CANCELLED', message: 'raw server detail' }, 'prepare'), /cannot accept an online payment/i)
})

test('a throttled capabilities request does not block payment-status recovery', async () => {
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch
  let calls = 0
  globalThis.window = { location: { href: 'http://localhost:5002/invoice/test' } }
  globalThis.fetch = async (input) => {
    calls += 1
    if (String(input).includes('/capabilities')) {
      return new Response(JSON.stringify({ message: 'Too many requests' }), {
        status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
      })
    }
    return new Response(JSON.stringify({ data: { status: 'CREATED' } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    await assert.rejects(checkoutRequest('http://localhost:5001/api/v1/public/invoices/test/payment/custom/capabilities'), { status: 429 })
    const status = await checkoutRequest('http://localhost:5001/api/v1/public/invoices/test/payment/status')
    assert.deepEqual(status, { status: 'CREATED' })
    await assert.rejects(checkoutRequest('http://localhost:5001/api/v1/public/invoices/test/payment/custom/capabilities'), { status: 429 })
    assert.equal(calls, 2)
  } finally {
    globalThis.window = previousWindow
    globalThis.fetch = previousFetch
  }
})
