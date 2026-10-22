'use client'

import { useEffect, useState } from 'react'
import { ProviderError, providerError } from './checkout/razorpay-sdk'

export default function CallbackDiagnostic() {
  const [diagnostic, setDiagnostic] = useState<ProviderError | null>(null)
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const encoded = fragment.get('razorpayCallback')
    if (!encoded || encoded.length > 8192) return
    try {
      const value = JSON.parse(encoded)
      if (value.provenance !== 'UNSIGNED_CALLBACK' || value.requiresStatusCheck !== true) return
      setDiagnostic(providerError({ error: value.providerError }))
    } catch {
      // Malformed callback details cannot determine payment state.
    } finally {
      fragment.delete('razorpayCallback')
      const hash = fragment.size ? `#${fragment}` : ''
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`)
    }
  }, [])
  if (!diagnostic) return null
  return <section aria-label="Returned payment details" role="status">
    <p>Returned payment details are unverified. Check payment status before trying again.</p>
    {diagnostic.description && <p>{diagnostic.description}</p>}
    <details><summary>Returned payment references</summary>
      {diagnostic.metadata?.order_id && <p>Razorpay order: {diagnostic.metadata.order_id}</p>}
      {diagnostic.metadata?.payment_id && <p>Payment reference: {diagnostic.metadata.payment_id}</p>}
      {diagnostic.code && <p>Code: {diagnostic.code}</p>}
      {diagnostic.source && <p>Source: {diagnostic.source}</p>}
      {diagnostic.step && <p>Step: {diagnostic.step}</p>}
      {diagnostic.reason && <p>Reason: {diagnostic.reason}</p>}
      {diagnostic.field && <p>Field: {diagnostic.field}</p>}
    </details>
  </section>
}
