import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../../src/app/invoice/[slug]/checkout/SavedCards.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText

// Render authenticated presentation states only; no provider lifecycle or real session is simulated.
function render({ authenticated, cards = [] }) {
  let state = 0
  const values = [authenticated ? 'customer-fixture-session' : '', '', false, cards]
  const module = { exports: {} }
  const dependencies = (name) => {
    if (name === 'react') return {
      ...React, useState(initial) { return [state < values.length ? values[state++] : (state++, initial), () => {}] },
      useEffect() {}, useRef(initial) { return { current: initial } },
    }
    if (name === './razorpay-sdk') return { checkoutRequest() { throw new Error('Presentation test cannot call payment APIs') } }
    if (name.endsWith('.module.css')) return { __esModule: true, default: {} }
    return require(name)
  }
  new Function('require', 'module', 'exports', compiled)(dependencies, module, module.exports)
  return renderToStaticMarkup(React.createElement(module.exports.default, {
    mode: 'TEST', keyId: 'rzp_test_presentation', presentation: 'list', disabled: false, onChange() {},
  }))
}

test('Recommended is absent for a guest even if stale card data exists', () => {
  assert.equal(render({ authenticated: false, cards: [{ selector: 'opaque-fixture', network: 'Visa', last4: '1007', selectable: true }] }), '')
})
test('Recommended is absent for an authenticated payer without saved cards', () => {
  assert.equal(render({ authenticated: true }), '')
})
test('Recommended displays returned masked cards only after customer authentication', () => {
  const html = render({ authenticated: true, cards: [{ selector: 'opaque-fixture', network: 'Visa', last4: '1007', selectable: true }] })
  assert.match(html, /Recommended/)
  assert.match(html, /Visa ending 1007/)
  assert.doesNotMatch(html, /customer-fixture-session|opaque-fixture|Confirm save-card choice|Your mobile number/)
})
