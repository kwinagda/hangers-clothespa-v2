import { test } from 'node:test'
import assert from 'node:assert/strict'
import { customCheckoutModeAllowed } from '../../src/app/invoice/[slug]/checkout/checkout-mode.ts'

const localTest = { mode: 'TEST', key: 'rzp_test_example', hostname: 'localhost', protocol: 'http:', liveEnabled: false, siteUrl: 'https://hangers-cs.com' }
const liveSite = { mode: 'LIVE', key: 'rzp_live_example', hostname: 'hangers-cs.com', protocol: 'https:', liveEnabled: true, siteUrl: 'https://hangers-cs.com' }

test('Custom Test mode is restricted to localhost and Test keys', () => {
  assert.equal(customCheckoutModeAllowed(localTest), true)
  assert.equal(customCheckoutModeAllowed({ ...localTest, hostname: '127.0.0.1' }), false)
  assert.equal(customCheckoutModeAllowed({ ...localTest, key: 'rzp_live_example' }), false)
  assert.equal(customCheckoutModeAllowed({ ...localTest, mode: 'LIVE' }), false)
})

test('Custom Live mode requires explicit build opt-in, HTTPS, exact site host, and Live key', () => {
  assert.equal(customCheckoutModeAllowed(liveSite), true)
  assert.equal(customCheckoutModeAllowed({ ...liveSite, liveEnabled: false }), false)
  assert.equal(customCheckoutModeAllowed({ ...liveSite, protocol: 'http:' }), false)
  assert.equal(customCheckoutModeAllowed({ ...liveSite, hostname: 'www.hangers-cs.com' }), false)
  assert.equal(customCheckoutModeAllowed({ ...liveSite, key: 'rzp_test_example' }), false)
  assert.equal(customCheckoutModeAllowed({ ...liveSite, siteUrl: 'not a URL' }), false)
})
