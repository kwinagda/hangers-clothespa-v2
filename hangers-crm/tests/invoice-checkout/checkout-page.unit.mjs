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
  if (name === './CustomCheckoutFlow') return { __esModule: true, default: () => React.createElement('div', { 'data-testid': 'custom-checkout' }) }
  if (name === './availability') return { checkoutAvailability }
  if (name === './page.module.css') return { __esModule: true, default: {} }
  return require(name)
}
new Function('require', 'module', 'exports', compiled)(dependencies, module, module.exports)

async function render(payload, query = {}, status = 200) {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const body = String(url).includes('/payment/status') ? { data: { status: 'NONE' } } : payload
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }
  try {
    return renderToStaticMarkup(await module.exports.default({ params: Promise.resolve({ slug: 'local-qa' }), searchParams: Promise.resolve(query) }))
  } finally { globalThis.fetch = previousFetch }
}

test('paid invoice renders confirmation and invoice link without payment action', async () => {
  const html = await render({ data: { invoice: { id: 'invoice-a', invoiceNumber: 'INV-A', balanceDue: 0, status: 'PAID' } } })
  assert.match(html, /Invoice paid/)
  assert.match(html, /aria-current="step">3/)
  assert.match(html, /View invoice details/)
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
