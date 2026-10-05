import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../../src/app/invoice/[slug]/checkout/PaymentReceivedVisual.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled)((name) => name.endsWith('.module.css')
  ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } : require(name), module, module.exports)

test('amount reveal preserves the exact formatted value for assistive technology', () => {
  const html = renderToStaticMarkup(React.createElement(module.exports.PaidAmount, { label: 'INR 1,234.50' }))
  assert.match(html, /class="amountAccessible">INR 1,234\.50/)
  assert.match(html, /aria-hidden="true" class="amountReel"/)
  assert.equal((html.match(/class="amountDigit"/g) || []).length, 6)
  assert.doesNotMatch(source, /requestAnimationFrame|createPayment|checkoutRequest/)
})

test('success artwork contains eight decorative dots without a payment transition', () => {
  const html = renderToStaticMarkup(React.createElement(module.exports.PaymentReceivedMark))
  assert.equal((html.match(/class="confetti"/g) || []).length, 8)
  assert.match(html, /aria-hidden="true"/)
  const css = readFileSync(new URL('../../src/app/invoice/[slug]/RazorpayCustomCheckout.module.css', import.meta.url), 'utf8')
  assert.match(css, /amountCount 900ms ease-out/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /\.successRipple, \.confetti \{ display: none; \}/)
})
