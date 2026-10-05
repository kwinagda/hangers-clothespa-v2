import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../../src/app/invoice/[slug]/checkout/CheckoutHandoff.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled)((name) => name.endsWith('.module.css')
  ? { __esModule: true, default: {} } : require(name), module, module.exports)
const render = (handoff) => renderToStaticMarkup(React.createElement(module.exports.default, { handoff }))

test('UPI waits without an invented QR, countdown, app link or successful status', () => {
  const html = render({ method: 'upi', label: 'Returned app', upiMode: 'intent', stage: 'waiting' })
  assert.match(html, /Complete your payment in Returned app/)
  assert.match(html, /Enter your UPI PIN only inside your UPI app/)
  assert.match(html, /Do not pay again/)
  assert.doesNotMatch(html, /upi:\/\/|<img|countdown|Payment received|[0-9]+:[0-9]+/)
})

test('desktop QR guidance points to the provider payment window, not synthetic imagery', () => {
  const html = render({ method: 'upi', label: 'UPI', upiMode: 'qr', stage: 'waiting' })
  assert.match(html, /Scan the QR in the Razorpay payment window/)
  assert.doesNotMatch(html, /<img|<input|Payment received/)
})

test('bank handoff uses the selected returned label and never collects bank credentials', () => {
  assert.match(render({ method: 'netbanking', label: 'Returned Bank', stage: 'opening' }), /Redirecting to Returned Bank/)
  const html = render({ method: 'netbanking', label: 'Returned Bank', stage: 'waiting' })
  assert.match(html, /Waiting for Returned Bank to confirm/)
  assert.match(html, /Complete bank authentication outside Hangers/)
  assert.doesNotMatch(html, /<input|no money|Payment received/)
})
