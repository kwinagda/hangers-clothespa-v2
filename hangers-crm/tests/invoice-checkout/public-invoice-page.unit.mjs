import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../../src/app/invoice/[slug]/page.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled)((name) => {
  if (name === '@/lib/branding') return { LOGO_BLUE_URL: '/logo-blue.png', LOGO_WHITE_URL: '/logo-white.png' }
  if (name === './InvoicePaymentButton') return { __esModule: true, default: () => React.createElement('div', { 'data-testid': 'payment-action' }) }
  if (name === './CallbackDiagnostic') return { __esModule: true, default: () => null }
  return require(name)
}, module, module.exports)

async function render(invoice) {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: { invoice } }) })
  try {
    return renderToStaticMarkup(await module.exports.default({ params: Promise.resolve({ slug: 'fixture' }) }))
  } finally {
    globalThis.fetch = previousFetch
  }
}

test('public service invoice shows source-backed service, appointment and monetary values', async () => {
  const html = await render({
    id: 'invoice-fixture', invoiceNumber: 'INV-FS-1', invoiceType: 'FIELD_SERVICE', orderNumber: 'FS-APPT-1',
    status: 'OPEN', paymentStatus: 'UNPAID', createdAt: '2026-09-01T00:00:00.000Z',
    subtotal: 1000, discount: 0, taxAmount: 0, totalAmount: 1000, paidAmount: 0, creditAmount: 0, balanceDue: 1000,
    serviceDate: '2026-10-01T00:00:00.000Z',
    customer: { name: 'Home', phone: '+919930367267' },
    items: [{ serviceName: 'Curtain steam cleaning', garmentType: 'SERVICE', quantity: 1, unitPrice: 1000, subtotal: 1000 }],
  })
  assert.match(html, /Curtain steam cleaning/)
  assert.match(html, /Service appointment/)
  assert.match(html, /INV-FS-1/)
  assert.doesNotMatch(html, /Sofa Cleaning|Total Clothes|Expected Delivery|Coupon Discount|Upcharge/)
})

test('unknown invoice amounts are not displayed as zero', async () => {
  const html = await render({
    id: 'invoice-incomplete', invoiceNumber: 'INV-UNKNOWN', invoiceType: 'ORDER', orderNumber: 'HCS-UNKNOWN',
    status: 'OPEN', paymentStatus: 'UNPAID', customer: { name: 'Home' }, items: [],
  })
  assert.match(html, /Unavailable/)
  assert.doesNotMatch(html, /₹0/)
})
