'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, any>) => { open: () => void; on: (event: string, handler: (payload: any) => void) => void }
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'
const newExperimentId = () => {
  const secureCrypto = typeof window !== 'undefined' ? window.crypto : undefined
  if (!secureCrypto) throw new Error('Secure browser randomness is unavailable')
  if (typeof secureCrypto.randomUUID === 'function') return secureCrypto.randomUUID()
  const bytes = secureCrypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value: number) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export default function InvoicePaymentButton({ slug, balanceDue, customerName, customerPhone, enabled = true }: { slug: string; balanceDue: number; customerName?: string; customerPhone?: string; enabled?: boolean }) {
  const router = useRouter()
  const experimentEnabled = process.env.NEXT_PUBLIC_RAZORPAY_CHECKOUT_AB_ENABLED === 'true'
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [verificationPending, setVerificationPending] = useState(false)
  const [resumeAvailable, setResumeAvailable] = useState(false)
  const [experimentReady, setExperimentReady] = useState(!experimentEnabled)
  const [experimentVariant, setExperimentVariant] = useState<'A' | 'B' | null>(null)
  const activeIdempotencyKey = useRef('')
  const activeAttemptId = useRef('')
  const experimentAssignment = useRef<{ visitorId: string; exposureEventId: string; variant: 'A' | 'B' } | null>(null)

  useEffect(() => {
    if (!experimentEnabled) return
    let cancelled = false
    const assign = async () => {
      try {
        const storageKey = 'hangers:rzp-checkout-experiment:visitor'
        let visitorId = window.localStorage.getItem(storageKey) || ''
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId)) {
          visitorId = newExperimentId()
          window.localStorage.setItem(storageKey, visitorId)
        }
        const exposureEventId = newExperimentId()
        const response = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/experiment/assign`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitorId, eventId: exposureEventId }), cache: 'no-store',
        })
        const result = await response.json()
        if (!response.ok || !['A', 'B'].includes(result.data?.variant)) throw new Error('Experiment assignment unavailable')
        if (cancelled) return
        const variant = result.data.variant as 'A' | 'B'
        experimentAssignment.current = { visitorId, exposureEventId, variant }
        setExperimentVariant(variant)
      } catch {
        // Experiment telemetry is optional and must never block invoice payment.
        experimentAssignment.current = null
      } finally {
        if (!cancelled) setExperimentReady(true)
      }
    }
    void assign()
    return () => { cancelled = true }
  }, [experimentEnabled, slug])

  const trackExperimentEvent = (eventType: string, attemptId?: string) => {
    const assignment = experimentAssignment.current
    if (!assignment) return
    const eventId = newExperimentId()
    void fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/experiment/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: assignment.visitorId, eventId, variant: assignment.variant, eventType, ...(attemptId ? { attemptId } : {}) }),
      cache: 'no-store',
    }).catch(() => undefined)
  }

  const loadCheckout = () => new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve()
    const existing = document.querySelector('script[data-razorpay-checkout]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Razorpay checkout could not load')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.dataset.razorpayCheckout = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Razorpay checkout could not load'))
    document.body.appendChild(script)
  })

  const pay = async () => {
    if (busy || success || verificationPending || !enabled || balanceDue < 1 || !experimentReady) return
    setBusy(true)
    trackExperimentEvent('CTA_CLICK')
    setResumeAvailable(false)
    setMessage('Preparing secure payment…')
    try {
      await loadCheckout()
      if (!activeIdempotencyKey.current) {
        activeIdempotencyKey.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
      const createResponse = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': activeIdempotencyKey.current },
        ...(experimentAssignment.current ? { body: JSON.stringify({ experiment: { visitorId: experimentAssignment.current.visitorId, eventId: experimentAssignment.current.exposureEventId, variant: experimentAssignment.current.variant } }) } : {}),
        cache: 'no-store',
      })
      const created = await createResponse.json()
      if (!createResponse.ok) {
        if (created?.checkoutAttemptId) activeAttemptId.current = created.checkoutAttemptId
        if (created?.checkoutAttemptId && ['CHECKOUT_ALREADY_IN_PROGRESS', 'CHECKOUT_ATTEMPT_UNRESOLVED', 'CHECKOUT_RESULT_UNKNOWN'].includes(created?.code)) {
          setVerificationPending(true)
          setMessage('A payment attempt is already in progress. Check its status before trying again.')
        }
        activeIdempotencyKey.current = ''
        throw new Error(created?.message || 'Could not start payment')
      }
      const checkoutData = created.data || created
      if (checkoutData.mode === 'TEST' && !checkoutData.testContact) {
        throw new Error('Test checkout is blocked until the approved test phone is configured.')
      }
      activeAttemptId.current = created.data?.checkoutAttemptId || created.checkoutAttemptId || ''
      if (!window.Razorpay) throw new Error('Razorpay checkout is unavailable')
      const checkout = new window.Razorpay({
        key: created.data?.key || created.key,
        amount: created.data?.amount || created.amount,
        currency: created.data?.currency || created.currency || 'INR',
        name: 'Hangers Clothes Spa',
        description: `Invoice ${created.data?.invoiceNumber || created.invoiceNumber || ''}`,
        order_id: created.data?.razorpayOrderId || created.razorpayOrderId,
        // Explicitly bind Checkout to this invoice customer so a saved Razorpay
        // contact from another browser session cannot be reused.
        prefill: {
          ...(customerName ? { name: customerName } : {}),
          ...(checkoutData.testContact
            ? { contact: checkoutData.testContact }
            : customerPhone
              ? { contact: `+91${String(customerPhone).replace(/\D/g, '').replace(/^91/, '')}` }
              : {}),
        },
        theme: { color: '#023c62' },
        modal: { ondismiss: () => {
          setBusy(false)
          trackExperimentEvent('CHECKOUT_DISMISSED', activeAttemptId.current || undefined)
          activeIdempotencyKey.current = ''
          if (activeAttemptId.current) {
            setVerificationPending(true)
            setMessage('Checkout closed. Confirm whether Razorpay recorded a payment before starting another attempt.')
          } else {
            setMessage('Checkout closed. You can try again.')
          }
        } },
        handler: async (response: any) => {
          trackExperimentEvent('CHECKOUT_HANDLER_RETURNED', activeAttemptId.current || undefined)
          setMessage('Confirming payment…')
          try {
            const verifyPayload = {
              razorpayOrderId: response?.razorpay_order_id,
              razorpayPaymentId: response?.razorpay_payment_id,
              razorpaySignature: response?.razorpay_signature,
            }
            if (!verifyPayload.razorpayOrderId || !verifyPayload.razorpayPaymentId || !verifyPayload.razorpaySignature) {
              throw new Error('Razorpay returned an incomplete payment confirmation. Please retry; no CRM payment was posted.')
            }
            const verifyResponse = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(verifyPayload), cache: 'no-store' })
            const verified = await verifyResponse.json()
            if (!verifyResponse.ok) throw new Error(verified?.message || 'Payment could not be confirmed')
            if (verified.data?.status === 'PENDING') {
              setVerificationPending(true)
              setMessage('Razorpay is still processing this payment. Check its status before trying again.')
            } else {
              setSuccess(true)
              setResumeAvailable(false)
              setMessage('Payment received successfully. Updating this invoice…')
              activeIdempotencyKey.current = ''
              activeAttemptId.current = ''
              router.refresh()
            }
          } catch (error: any) {
            setVerificationPending(true)
            setMessage(`${error?.message || 'Payment confirmation is pending.'} Do not start another payment while we verify this attempt.`)
          } finally {
            setBusy(false)
          }
        },
      })
      checkout.on('payment.failed', (payload: any) => {
        trackExperimentEvent('PAYMENT_FAILED_CALLBACK', activeAttemptId.current || undefined)
        setBusy(false)
        setVerificationPending(Boolean(activeAttemptId.current))
        setMessage(payload?.error?.description || 'Razorpay reported a payment failure. Confirm the final status before trying again.')
      })
      checkout.open()
      trackExperimentEvent('CHECKOUT_OPEN_REQUESTED', activeAttemptId.current || undefined)
    } catch (error: any) {
      trackExperimentEvent('CLIENT_ERROR', activeAttemptId.current || undefined)
      setBusy(false)
      if (activeAttemptId.current) setVerificationPending(true)
      setMessage(error?.message || 'Could not start payment')
    }
  }

  const checkPaymentStatus = async () => {
    const attemptId = activeAttemptId.current
    if (!attemptId || busy) return
    setBusy(true)
    setMessage('Checking Razorpay and CRM payment status…')
    try {
      const response = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/status?attemptId=${encodeURIComponent(attemptId)}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.message || 'Could not check payment status')
      const status = result.data?.status
      if (status === 'CAPTURED') {
        setSuccess(true)
        setVerificationPending(false)
        setResumeAvailable(false)
        setMessage('Payment received and recorded in the CRM.')
        activeIdempotencyKey.current = ''
        activeAttemptId.current = ''
        router.refresh()
      } else if (status === 'FAILED' || status === 'CREATE_FAILED') {
        setVerificationPending(false)
        setResumeAvailable(false)
        setMessage('This payment did not complete. You can start a new attempt.')
        activeIdempotencyKey.current = ''
        activeAttemptId.current = ''
      } else if (status === 'REVIEW') {
        setVerificationPending(true)
        setResumeAvailable(false)
        setMessage('Razorpay may have collected this payment, but CRM needs finance review. Do not make another payment.')
      } else if (result.data?.canResumeCheckout === true) {
        setVerificationPending(false)
        setResumeAvailable(true)
        setMessage('Razorpay confirms no payment was attempted. You can safely reopen the same checkout order.')
      } else {
        setVerificationPending(true)
        setResumeAvailable(false)
        setMessage('No captured payment is confirmed yet. Please wait before trying again.')
      }
    } catch (error: any) {
      setMessage(error?.message || 'Could not check payment status. Please try again shortly.')
    } finally {
      setBusy(false)
    }
  }

  if (!enabled || balanceDue < 1) return null
  return (
    <div style={{ margin: '0 26px 22px', padding: 16, border: '1px solid #cfe2ef', borderRadius: 12, background: '#f7fbfe' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#023c62', display: 'block', fontSize: 15 }}>{experimentVariant === 'B' ? 'Pay this invoice online' : 'Pay online'}</strong>
          <span style={{ color: '#6b7fa3', fontSize: 12 }}>{experimentVariant === 'B' ? 'Continue to Razorpay’s secure checkout' : 'Secure checkout via Razorpay'}</span>
        </div>
        <button type="button" onClick={pay} disabled={busy || success || verificationPending || !experimentReady} style={{ border: 0, borderRadius: 8, padding: '11px 16px', background: success ? '#167b4b' : '#023c62', color: '#fff', fontWeight: 800, cursor: busy || success || verificationPending || !experimentReady ? 'default' : 'pointer', opacity: busy || !experimentReady ? 0.7 : 1 }}>
          {success ? 'Payment received' : busy ? 'Processing…' : verificationPending ? 'Payment checking' : !experimentReady ? 'Preparing secure checkout…' : resumeAvailable ? 'Resume secure checkout' : experimentVariant === 'B' ? `Pay invoice · ₹${balanceDue.toLocaleString('en-IN')}` : `Pay ₹${balanceDue.toLocaleString('en-IN')}`}
        </button>
      </div>
      {message && <div role="status" style={{ marginTop: 10, color: success ? '#167b4b' : '#6b7fa3', fontSize: 12, lineHeight: 1.45 }}>{message}</div>}
      {verificationPending && <button type="button" onClick={checkPaymentStatus} disabled={busy} style={{ marginTop: 10, border: '1px solid #cfe2ef', borderRadius: 8, padding: '9px 12px', background: '#fff', color: '#023c62', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Checking…' : 'Check payment status'}</button>}
    </div>
  )
}
