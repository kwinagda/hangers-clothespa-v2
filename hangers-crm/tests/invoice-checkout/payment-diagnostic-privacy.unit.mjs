import { test } from 'node:test'
import assert from 'node:assert/strict'
import { providerError, safePaymentDiagnostic } from '../../src/app/invoice/[slug]/checkout/razorpay-sdk.ts'

test('SDK diagnostics redact sensitive values before displaying provider fields', () => {
  for (const text of ['123', 'CVV=123', 'OTP 123456', 'key_secret=AbcSecretValue', 'signature=' + 'a'.repeat(64), 'token_ABcd1234', 'card_ABcd1234', 'cust_ABcd1234', 'rzp_live_SecretValue']) {
    assert.notEqual(safePaymentDiagnostic(text), text)
    assert.ok(safePaymentDiagnostic(text).includes('[redacted-'))
  }
  const result = providerError({ error: { code: 'BAD_REQUEST_ERROR', description: 'CVV=123 token_ABcd1234', source: 'gateway', step: 'payment_authorization', reason: 'insufficient_fund', metadata: { order_id: 'order_ABC123456', payment_id: 'pay_ABC123456', cvv: '123' } } })
  assert.equal(result.code, 'BAD_REQUEST_ERROR')
  assert.equal(result.reason, 'insufficient_fund')
  assert.equal(result.description, '[redacted-credential] [redacted-instrument]')
  assert.deepEqual(result.metadata, { order_id: 'order_ABC123456', payment_id: 'pay_ABC123456' })
  assert.doesNotMatch(safePaymentDiagnostic('{"key_secret":"AbcSecretValue"}'), /AbcSecretValue/)
})
