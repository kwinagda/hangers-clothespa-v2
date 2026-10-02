import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { checkoutAvailability } from '../../src/app/invoice/[slug]/checkout/availability.ts'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../../src/app/invoice/[slug]/checkout/page.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText
const module = { exports: {} }
const dependencies = (name) => {
  if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
  if (name === 'next/navigation') return { notFound() { throw new Error('NOT_FOUND') } }
  if (name === '@/lib/branding') return { LOGO_BLUE_URL: '/hangers-logo.png' }
  if (name === '../InvoicePaymentButton') return { __esModule: true, default: (props) => React.createElement('button', {
    'data-anchor': props.invoiceId, 'data-scope': props.paymentScope,
  }, 'Pay outstanding') }
  if (name === './CustomCheckoutFlow') return { __esModule: true, default: (props) => React.createElement('div', {
    'data-testid': 'custom-checkout',
    'data-initial-status': props.initialStatus?.status,
    'data-order-id': props.initialStatus?.razorpayOrderId,
    'data-payment-id': props.initialStatus?.razorpayPaymentId,
  }) }
  if (name === './availability') return { checkoutAvailability }
  if (name === './page.module.css') return { __esModule: true, default: {} }
  return require(name)
}
new Function('require', 'module', 'exports', compiled)(dependencies, module, module.exports)

async function render(payload, query = {}, responseStatus = 200, paymentStatus = { data: { status: 'NONE' } }, customCheckout = false) {
  const previousFetch = globalThis.fetch
  const previousCustomCheckout = process.env.NEXT_PUBLIC_RAZORPAY_CUSTOM_CHECKOUT
  if (customCheckout) process.env.NEXT_PUBLIC_RAZORPAY_CUSTOM_CHECKOUT = 'true'
  globalThis.fetch = async (url) => {
    const isPaymentStatus = String(url).includes('/payment/status')
    const body = isPaymentStatus ? paymentStatus : payload
    const status = isPaymentStatus ? 200 : responseStatus
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }
  try {
    return renderToStaticMarkup(await module.exports.default({ params: Promise.resolve({ slug: 'local-qa' }), searchParams: Promise.resolve(query) }))
  } finally {
    globalThis.fetch = previousFetch
    if (previousCustomCheckout === undefined) delete process.env.NEXT_PUBLIC_RAZORPAY_CUSTOM_CHECKOUT
    else process.env.NEXT_PUBLIC_RAZORPAY_CUSTOM_CHECKOUT = previousCustomCheckout
  }
}

test('paid invoice renders confirmation and invoice link without payment action', async () => {
  const html = await render({ data: { invoice: { id: 'invoice-a', invoiceNumber: 'INV-A', balanceDue: 0, status: 'PAID' } } })
  assert.match(html, /Invoice paid/)
  assert.match(html, /aria-current="step">3/)
  assert.match(html, /View invoice details/)
  assert.doesNotMatch(html, /<button/)
})

test('server-confirmed capture and provider references seed Custom Checkout receipt state', async () => {
  const html = await render(
    { data: { invoice: { id: 'invoice-captured', invoiceNumber: 'INV-CAPTURED', balanceDue: 0, status: 'PAID' } } },
    {}, 200,
    { data: { status: 'CAPTURED', razorpayOrderId: 'order_verified', razorpayPaymentId: 'pay_verified' } },
    true,
  )
  assert.match(html, /data-testid="custom-checkout"/)
  assert.match(html, /data-initial-status="CAPTURED"/)
  assert.match(html, /data-order-id="order_verified"/)
  assert.match(html, /data-payment-id="pay_verified"/)
  assert.doesNotMatch(html, /<button/)
})

test('zero-balance invoice advances to complete without claiming a Razorpay capture', async () => {
  const html = await render({ data: { invoice: {
    id: 'invoice-settled', invoiceNumber: 'INV-SETTLED', balanceDue: 0, paidAmount: 10, status: 'PICKED_UP',
  } } })
  assert.match(html, /No balance due/)
  assert.match(html, /aria-current="step">3 <b>Complete<\/b>/)
  assert.match(html, /2 <b>Payment<\/b>/)
  assert.doesNotMatch(html, /aria-current="step">2|Payment received|Invoice paid|<button/)
})

test('all supported invoice source types expose checkout for a positive unpaid balance', async (t) => {
  for (const [invoiceType, orderNumber] of [
    ['ORDER', 'HCS-ORDER-1'],
    ['DAILY_IRON', 'DIB-IRON-1'],
    ['FIELD_SERVICE', 'FS-APPT-1'],
  ]) {
    await t.test(invoiceType, async () => {
      const html = await render({ data: { invoice: {
        id: `invoice-${invoiceType.toLowerCase()}`,
        invoiceNumber: `INV-${invoiceType}`,
        invoiceType,
        orderNumber,
        balanceDue: 125,
        paidAmount: 0,
        status: 'OPEN',
      } } })
      assert.match(html, /Complete your payment/)
      assert.match(html, /Pay outstanding/)
      assert.ok(html.includes(`INV-${invoiceType}`))
      assert.ok(html.includes(orderNumber))
    })
  }
})

test('combined checkout uses full server total and first anchor regardless of supplied selection', async () => {
  const html = await render({ data: { paymentSummary: {
    totals: { balanceDue: 5880 }, customer: { name: 'Home' },
    receivables: [{ invoiceId: 'first', invoiceNumber: 'INV-A', balanceDue: 2680 }, { invoiceId: 'second', invoiceNumber: 'INV-B', balanceDue: 3200 }],
  } } }, { invoiceId: 'second' })
  assert.match(html, /data-anchor="first"/)
  assert.match(html, /data-scope="CUSTOMER_OUTSTANDING"/)
  for (const reference of ['INV-A', 'INV-B', '5,880', '2,680', '3,200']) assert.ok(html.includes(reference))
})

test('zero outstanding and cancelled invoices stay usable with no payment action', async () => {
  const summary = await render({ data: { paymentSummary: { totals: { balanceDue: 0 }, receivables: [] } } })
  assert.match(summary, /No balance due/)
  assert.doesNotMatch(summary, /<button|Invoice paid/)
  const cancelled = await render({ data: { invoice: { balanceDue: 100, status: 'CANCELLED' } } })
  assert.match(cancelled, /cancelled and cannot accept payment/)
  assert.doesNotMatch(cancelled, /<button/)
})

test('API outage is recoverable and not presented as a missing invoice', async () => {
  const html = await render({}, {}, 503)
  assert.match(html, /Payment details temporarily unavailable/)
  assert.match(html, /Retry loading checkout/)
  assert.doesNotMatch(html, /<button/)
  await assert.rejects(render({}, {}, 404), /NOT_FOUND/)
})
