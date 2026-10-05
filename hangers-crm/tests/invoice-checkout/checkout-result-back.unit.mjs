import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../../src/app/invoice/[slug]/checkout/CustomCheckoutFlow.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText

function fixture(status) {
  const states = [{ key: 'rzp_test_ui', mode: 'TEST', configuration: { feeBearer: 'MERCHANT' } }]
  let cursor = 0
  let back
  const module = { exports: {} }
  const dependencies = (name) => {
    if (name === 'react') return {
      ...React,
      useState(initial) {
        const index = cursor++
        if (!(index in states)) states[index] = initial
        return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
      },
      useEffect() {}, useCallback(fn) { return fn }, useRef(value) { return { current: value } },
    }
    if (name === 'next/navigation') return { useRouter() { return { refresh() {}, replace() {} } } }
    if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
    if (name === './CheckoutNavigation') return { useCheckoutBack(priority, handler) { assert.equal(priority, 2); back = handler } }
    if (name === './PaymentReceivedVisual') return { PaymentReceivedMark: () => null, PaidAmount: ({ label }) => React.createElement('strong', null, label) }
    if (name === '../RazorpayCustomCheckout') return { __esModule: true, default: (props) => React.createElement('div', {
      'data-method-list': props.showList, 'data-read-only': props.readOnly,
      'data-prepares-order': Boolean(props.onPrepare), 'data-recovery-required': props.recoveryRequired,
    }) }
    if (name === './razorpay-sdk') return { money: (paise) => `INR ${paise / 100}`, checkoutRequest() { throw new Error('Result presentation must not invoke payment APIs') } }
    if (name === './checkout-mode' || name === './checkout-errors') return {}
    if (name === '@/lib/seo') return { SITE_URL: 'https://hangers-cs.com' }
    if (name === '@/components/ui/Button') return { Button: ({ children, variant: _variant, ...props }) => React.createElement('button', props, children) }
    if (name.endsWith('.module.css')) return { __esModule: true, default: {} }
    return require(name)
  }
  new Function('require', 'module', 'exports', compiled)(dependencies, module, module.exports)
  const render = () => {
    cursor = 0
    return renderToStaticMarkup(module.exports.default({ slug: 'local-fixture', amountPaise: 1000, initialStatus: status }))
  }
  return { render, back: () => back() }
}

test('Back from a captured result shows read-only methods without exposing order preparation', () => {
  const view = fixture({ status: 'CAPTURED', capturedAmountPaise: 1000, currency: 'INR', canResumeCheckout: true })
  assert.match(view.render(), /Payment received/)
  assert.equal(view.back(), true)
  const html = view.render()
  assert.match(html, /No further payment is required/)
  assert.match(html, /data-method-list="true" data-read-only="true" data-prepares-order="false"/)
  assert.equal(view.back(), false)
})
test('Back from unresolved status never enables payment or replacement-order preparation', () => {
  const view = fixture({ status: 'PENDING', attemptId: 'fixture-attempt', canResumeCheckout: false })
  assert.match(view.render(), /Do not pay again/)
  assert.equal(view.back(), true)
  assert.match(view.render(), /data-method-list="true" data-read-only="true" data-prepares-order="false" data-recovery-required="true"/)
})
test('Back from terminal failure permits methods only under the server resumability gate', () => {
  const view = fixture({ status: 'FAILED', attemptId: 'fixture-attempt', canResumeCheckout: true })
  assert.match(view.render(), /Payment failed/)
  assert.equal(view.back(), true)
  assert.match(view.render(), /data-method-list="true" data-read-only="false" data-prepares-order="true" data-recovery-required="false"/)
})

test('a failed payment with unavailable provider lookup exposes no retry or order preparation', () => {
  const html = fixture({ status: 'FAILED', attemptId: 'fixture-attempt', providerLookupUnavailable: true,
    providerError: { description: 'Returned provider failure' }, canResumeCheckout: true }).render()
  assert.match(html, /Payment failed/)
  assert.match(html, /Returned provider failure/)
  assert.match(html, /Check payment status before trying again/)
  assert.doesNotMatch(html, /Retry INR|Choose another method|data-prepares-order="true"|no money/)
})

test('create failure uses not-completed presentation and does not auto-prepare while viewing the result', () => {
  const html = fixture({ status: 'CREATE_FAILED', attemptId: 'fixture-create' }).render()
  assert.match(html, /Payment not completed/)
  assert.match(html, /Check status and try again/)
  assert.match(html, /data-read-only="true" data-prepares-order="false"/)
  assert.doesNotMatch(html, /Payment received|no money/)
})

test('captured receipt omits invalid timestamps and nonexistent split data', () => {
  const html = fixture({ status: 'CAPTURED', capturedAmountPaise: 1000, currency: 'INR', capturedAt: 'invalid',
    razorpayPaymentId: 'pay_fixture' }).render()
  assert.match(html, /Payment reference/)
  assert.match(html, /pay_fixture/)
  assert.doesNotMatch(html, /Invalid Date|Paid invoice split|Captured /)
})
