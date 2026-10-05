import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { checkoutAvailability } from '../../src/app/invoice/[slug]/checkout/availability.ts'

const require = createRequire(import.meta.url)
const postcss = require('postcss')
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
  if (name === './CheckoutIntro') return { __esModule: true, default: () => null }
  if (name === './CheckoutNavigation') return {
    CheckoutNavigation: ({ children }) => React.createElement(React.Fragment, null, children),
    CheckoutBack: ({ href, className }) => React.createElement('a', { href, className, 'aria-label': 'Back to invoice details' }, 'Back'),
  }
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
  assert.match(html, /aria-current="step"><span>3<\/span>/)
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
  assert.match(html, /aria-current="step"><span>3<\/span><b>Complete<\/b>/)
  assert.match(html, /<span>2<\/span><b>Payment<\/b>/)
  assert.doesNotMatch(html, /aria-current="step"><span>2|Payment received|Invoice paid|<button/)
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

test('custom checkout normal, error, warning, and selected text meet WCAG AA source-color contrast', () => {
  const css = readFileSync(new URL('../../src/app/invoice/[slug]/RazorpayCustomCheckout.module.css', import.meta.url), 'utf8')
  const root = postcss.parse(css)
  const declarations = (selector) => {
    let result = {}
    root.walkRules((rule) => {
      if (rule.selector.split(',').map((item) => item.trim()).includes(selector)) {
        Object.assign(result, Object.fromEntries(rule.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value])))
      }
    })
    return result
  }
  const luminance = (hex) => {
    const normalized = hex.length === 4 ? `#${[...hex.slice(1)].map((channel) => channel + channel).join('')}` : hex
    const channels = normalized.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }
  const ratio = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
    return (values[0] + 0.05) / (values[1] + 0.05)
  }
  const colorPairs = [
    ['.heading p', '#ffffff'],
    ['.heading p', '#f3f7fa'],
    ['.references', '#ffffff'],
    ['.references', '#f3f7fa'],
    ['.checkout small', '#ffffff'],
    ['.checkout small', '#f3f7fa'],
    ['.notice', declarations('.notice').background],
    ['.error', declarations('.error').background],
    ['.checkout', '#f3f7fa'],
    ['.checkout', declarations('.methodSelected').background],
  ]
  for (const [foregroundSelector, backgroundColor] of colorPairs) {
    const textColor = declarations(foregroundSelector).color || declarations('.checkout').color
    assert.ok(textColor && backgroundColor && ratio(textColor, backgroundColor) >= 4.5,
      `${foregroundSelector} text ${textColor} on ${backgroundColor} must meet 4.5:1`)
  }
  assert.doesNotMatch(declarations('.actions button:disabled').opacity || '', /./,
    'disabled primary actions must not fade their text/background below the contrast target')
  assert.doesNotMatch(declarations('.brandChoice:disabled').opacity || '', /./,
    'disabled UPI app choices must not fade their text/background below the contrast target')
  const focusOutline = declarations('.brandChoice:focus-visible').outline || ''
  const focusColor = focusOutline.match(/#[\da-f]{6}/i)?.[0]
  assert.ok(focusColor, 'checkout controls must retain a visible focus outline')
  for (const background of ['#ffffff', '#f3f7fa']) {
    for (const selector of ['.actions button', '.brandChoice']) {
      const style = declarations(selector)
      assert.ok(ratio(style.color, style.background) >= 4.5,
        `${selector} text must remain at least 4.5:1 while disabled on ${background}`)
    }
    assert.ok(ratio(focusColor, background) >= 3,
      `focus indicator must have at least 3:1 contrast against ${background}`)
  }
  assert.match(declarations('.method:focus-within').outline || '', /3px solid #035a8f/i,
    'payment-method keyboard focus must keep a visible outline')
})
