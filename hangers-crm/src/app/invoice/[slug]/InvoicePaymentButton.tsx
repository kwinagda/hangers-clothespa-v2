'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import RazorpayCustomCheckout from './RazorpayCustomCheckout'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'
type StandardRazorpay = new (options: Record<string, any>) => { open: () => void; on: (event: string, handler: (payload: any) => void) => void }
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

export default function InvoicePaymentButton({ slug, invoiceId, invoiceNumber, orderNumber, balanceDue, customerName, customerPhone, enabled = true, paymentScope, checkoutPage = false }: { slug: string; invoiceId?: string; invoiceNumber?: string; orderNumber?: string; balanceDue: number; customerName?: string; customerPhone?: string; enabled?: boolean; paymentScope?: 'CUSTOMER_OUTSTANDING'; checkoutPage?: boolean }) {
  const router = useRouter()
  const experimentEnabled = process.env.NEXT_PUBLIC_RAZORPAY_CHECKOUT_AB_ENABLED === 'true'
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [razorpayOrderId, setRazorpayOrderId] = useState('')
  const [razorpayPaymentId, setRazorpayPaymentId] = useState('')
  const [checkoutAttemptReference, setCheckoutAttemptReference] = useState('')
  const [verificationPending, setVerificationPending] = useState(false)
  const [resumeAvailable, setResumeAvailable] = useState(false)
  const [resumeMode, setResumeMode] = useState<'UNATTEMPTED_SAME_ORDER' | null>(null)
  const [redirectCheckoutAvailable, setRedirectCheckoutAvailable] = useState(false)
  const [customCheckoutOrder, setCustomCheckoutOrder] = useState<{ key: string; amount: number; currency: string; razorpayOrderId: string; testContact?: string; email?: string; callbackUrl?: string; redirect?: boolean } | null>(null)
  const [statusReady, setStatusReady] = useState(false)
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(false)
  const [experimentReady, setExperimentReady] = useState(!experimentEnabled)
  const [experimentVariant, setExperimentVariant] = useState<'A' | 'B' | null>(null)
  const activeIdempotencyKey = useRef('')
  const activeAttemptId = useRef('')
  const recoveryInFlight = useRef(false)
  const lastRecoveryAt = useRef(0)
  const experimentAssignment = useRef<{ visitorId: string; exposureEventId: string; variant: 'A' | 'B' } | null>(null)

  const continueToCheckout = () => {
    const params = new URLSearchParams()
    if (paymentScope) params.set('scope', 'outstanding')
    if (invoiceId) params.set('invoiceId', invoiceId)
    const query = params.size ? `?${params.toString()}` : ''
    router.push(`/invoice/${encodeURIComponent(slug)}/checkout${query}`)
  }

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
          body: JSON.stringify({ visitorId, eventId: exposureEventId, ...(invoiceId ? { invoiceId } : {}) }), cache: 'no-store',
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
  }, [experimentEnabled, invoiceId, slug])

  const trackExperimentEvent = (eventType: string, attemptId?: string) => {
    const assignment = experimentAssignment.current
    if (!assignment) return
    const eventId = newExperimentId()
    void fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/experiment/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: assignment.visitorId, eventId, variant: assignment.variant, eventType, ...(invoiceId ? { invoiceId } : {}), ...(attemptId ? { attemptId } : {}) }),
      cache: 'no-store',
    }).catch(() => undefined)
  }

  const trackPaymentClientEvent = (eventType: string, attemptId?: string) => {
    try {
      void fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/client-events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, clientEventId: newExperimentId(), ...(invoiceId ? { invoiceId } : {}), ...(attemptId ? { attemptId } : {}) }),
        cache: 'no-store', keepalive: true,
      }).catch(() => undefined)
    } catch {
      // Client telemetry must never block the provider checkout flow.
    }
  }

  const loadCheckout = () => new Promise<void>((resolve, reject) => {
    if ((window as Window & { Razorpay?: StandardRazorpay }).Razorpay) return resolve()
    trackPaymentClientEvent('CHECKOUT_SCRIPT_LOAD_STARTED')
    const existing = document.querySelector('script[data-razorpay-checkout]')
    if (existing) {
      existing.addEventListener('load', () => { trackPaymentClientEvent('CHECKOUT_SCRIPT_LOAD_SUCCEEDED'); resolve() }, { once: true })
      existing.addEventListener('error', () => { trackPaymentClientEvent('CHECKOUT_SCRIPT_LOAD_FAILED'); reject(new Error('Razorpay checkout could not load')) }, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.dataset.razorpayCheckout = 'true'
    script.onload = () => { trackPaymentClientEvent('CHECKOUT_SCRIPT_LOAD_SUCCEEDED'); resolve() }
    script.onerror = () => { trackPaymentClientEvent('CHECKOUT_SCRIPT_LOAD_FAILED'); reject(new Error('Razorpay checkout could not load')) }
    document.body.appendChild(script)
  })

  const verifyPaymentResponse = async (response: any) => {
    setMessage('Confirming payment…')
    try {
      const verifyPayload = {
        razorpayOrderId: response?.razorpay_order_id,
        razorpayPaymentId: response?.razorpay_payment_id,
        razorpaySignature: response?.razorpay_signature,
        ...(invoiceId ? { invoiceId } : {}),
      }
      if (!verifyPayload.razorpayOrderId || !verifyPayload.razorpayPaymentId || !verifyPayload.razorpaySignature) {
        throw new Error('Razorpay returned an incomplete payment confirmation. Check payment status before trying again.')
      }
      trackPaymentClientEvent('VERIFY_REQUESTED', activeAttemptId.current || undefined)
      const verifyResponse = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(verifyPayload), cache: 'no-store',
      })
      const verified = await verifyResponse.json()
      if (!verifyResponse.ok && verified?.code === 'RAZORPAY_PAYMENT_FAILED') {
        setVerificationPending(false)
        setResumeAvailable(false)
        setResumeMode(null)
        setCustomCheckoutOrder(null)
        setMessage(verified?.message || 'Razorpay confirmed this payment failed. You can start a new payment attempt.')
        activeIdempotencyKey.current = ''
        activeAttemptId.current = ''
        return
      }
      if (!verifyResponse.ok) throw new Error(verified?.message || 'Payment could not be confirmed')
      if (verified.data?.status === 'PENDING') {
        trackPaymentClientEvent('VERIFY_PENDING', activeAttemptId.current || undefined)
        setVerificationPending(true)
        setCustomCheckoutOrder(null)
        setRazorpayOrderId(verifyPayload.razorpayOrderId)
        setRazorpayPaymentId(verifyPayload.razorpayPaymentId)
        setMessage('Razorpay is still processing this payment. Check its status before trying again. If it remains unresolved, contact Hangers Clothes Spa; do not pay again.')
      } else {
        trackPaymentClientEvent('VERIFY_SUCCEEDED', activeAttemptId.current || undefined)
        setSuccess(true)
        setCustomCheckoutOrder(null)
        setResumeAvailable(false)
        setMessage('Payment received successfully. Updating this invoice…')
        activeIdempotencyKey.current = ''
        activeAttemptId.current = ''
        router.refresh()
      }
    } catch (error: any) {
      trackPaymentClientEvent('VERIFY_FAILED', activeAttemptId.current || undefined)
      setVerificationPending(true)
      setCustomCheckoutOrder(null)
      setRazorpayOrderId(response?.razorpay_order_id || '')
      setRazorpayPaymentId(response?.razorpay_payment_id || '')
      setMessage(`${error?.message || 'Payment confirmation is pending.'} Do not start another payment while we verify this attempt.`)
    } finally {
      setBusy(false)
    }
  }

  const handleCustomPaymentError = (payload: any) => {
    const providerError = payload?.error || payload || {}
    const paymentId = providerError?.metadata?.payment_id || ''
    const orderId = providerError?.metadata?.order_id || customCheckoutOrder?.razorpayOrderId || ''
    const errorLabel = [providerError?.code, providerError?.source, providerError?.step, providerError?.reason].filter(Boolean).join(' / ')
    trackPaymentClientEvent('PAYMENT_FAILED_CALLBACK', activeAttemptId.current || undefined)
    setCustomCheckoutOrder(null)
    setBusy(false)
    setVerificationPending(true)
    setResumeAvailable(false)
    setRazorpayOrderId(orderId)
    setRazorpayPaymentId(paymentId)
    setMessage(`${providerError?.description || 'Payment result unavailable.'}${errorLabel ? ` (${errorLabel})` : ''} Check its status before trying again.`)
  }

  const pay = async (useRedirectCallback = false) => {
    if (busy || success || verificationPending || !statusReady || !enabled || balanceDue < 1 || !experimentReady) return
    if (useRedirectCallback && !redirectCheckoutAvailable) return
    setBusy(true)
    if (useRedirectCallback) trackPaymentClientEvent('REDIRECT_CHECKOUT_SELECTED', activeAttemptId.current || undefined)
    trackPaymentClientEvent(resumeAvailable ? 'RESUME_CHECKOUT_CLICKED' : 'PAY_BUTTON_CLICKED', activeAttemptId.current || undefined)
    trackExperimentEvent('CTA_CLICK')
    setResumeAvailable(false)
    setMessage('Preparing secure payment…')
    try {
      if (!activeIdempotencyKey.current) {
        activeIdempotencyKey.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
      trackPaymentClientEvent('CREATE_ORDER_REQUESTED', activeAttemptId.current || undefined)
      const createResponse = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': activeIdempotencyKey.current },
        body: JSON.stringify({ ...(invoiceId ? { invoiceId } : {}), ...(paymentScope ? { paymentScope } : {}), ...(experimentAssignment.current ? { experiment: { visitorId: experimentAssignment.current.visitorId, eventId: experimentAssignment.current.exposureEventId, variant: experimentAssignment.current.variant } } : {}) }),
        cache: 'no-store',
      })
      const created = await createResponse.json()
      if (!createResponse.ok) {
        const failedAttemptId = created?.checkoutAttemptId || created?.details?.checkoutAttemptId
        trackPaymentClientEvent('CREATE_ORDER_FAILED', failedAttemptId || activeAttemptId.current || undefined)
        if (failedAttemptId) activeAttemptId.current = failedAttemptId
        if (created?.code === 'CHECKOUT_ATTEMPT_TERMINAL') {
          activeIdempotencyKey.current = ''
          setVerificationPending(false)
          setResumeAvailable(false)
          setMessage(created?.message || 'This payment attempt failed. Start a new attempt to continue.')
          setBusy(false)
          return
        }
        if (created?.code === 'CHECKOUT_ORDER_REJECTED') {
          activeAttemptId.current = ''
          activeIdempotencyKey.current = ''
          setVerificationPending(false)
          setResumeAvailable(false)
          setMessage(created?.message || 'Razorpay rejected the checkout request. No payment was taken; you can try again.')
          setBusy(false)
          return
        }
        if (failedAttemptId && ['CHECKOUT_ALREADY_IN_PROGRESS', 'CHECKOUT_ATTEMPT_UNRESOLVED', 'CHECKOUT_RESULT_UNKNOWN'].includes(created?.code)) {
          setVerificationPending(true)
          setMessage('A payment attempt is already in progress. Check its status before trying again.')
        }
        activeIdempotencyKey.current = ''
        throw new Error(created?.message || 'Could not start payment')
      }
      const checkoutData = created.data || created
      setRedirectCheckoutAvailable(checkoutData.redirectCheckoutAvailable === true && typeof checkoutData.callbackUrl === 'string')
      trackPaymentClientEvent('CREATE_ORDER_SUCCEEDED', created.data?.checkoutAttemptId || created.checkoutAttemptId || undefined)
      if (checkoutData.mode === 'TEST' && !checkoutData.testContact) {
        throw new Error('Test checkout is blocked until the approved test phone is configured.')
      }
      if (useRedirectCallback && (checkoutData.redirectCheckoutAvailable !== true || !checkoutData.callbackUrl)) {
        throw new Error('Redirect checkout is unavailable. Use the standard secure checkout or contact the store.')
      }
      activeAttemptId.current = created.data?.checkoutAttemptId || created.checkoutAttemptId || ''
      const checkoutOrder = {
        key: checkoutData.key,
        amount: Number(checkoutData.amount),
        currency: checkoutData.currency || 'INR',
        razorpayOrderId: checkoutData.razorpayOrderId,
        ...(useRedirectCallback ? { callbackUrl: checkoutData.callbackUrl, redirect: true } : {}),
        ...(checkoutData.testContact ? { testContact: checkoutData.testContact } : {}),
        ...(customerPhone ? { contact: customerPhone } : {}),
      }
      if (process.env.NEXT_PUBLIC_RAZORPAY_CUSTOM_CHECKOUT === 'true'
        && window.location.hostname === 'localhost'
        && checkoutData.mode === 'TEST') {
        if (!checkoutOrder.key || !checkoutOrder.razorpayOrderId || !Number.isSafeInteger(checkoutOrder.amount) || checkoutOrder.amount < 1) {
          throw new Error('Razorpay returned incomplete Test Mode checkout details.')
        }
        setCustomCheckoutOrder(checkoutOrder)
        setResumeAvailable(false)
        setMessage('Select a payment method below. Your payment will remain in Razorpay Test Mode.')
        setBusy(false)
        trackPaymentClientEvent('CUSTOM_CHECKOUT_READY', activeAttemptId.current || undefined)
        return
      }
      await loadCheckout()
      const Razorpay = (window as Window & { Razorpay?: StandardRazorpay }).Razorpay
      if (!Razorpay) throw new Error('Razorpay checkout is unavailable')
      const checkout = new Razorpay({
        key: created.data?.key || created.key,
        amount: created.data?.amount || created.amount,
        currency: created.data?.currency || created.currency || 'INR',
        name: 'Hangers Clothes Spa',
        description: paymentScope ? 'Total outstanding invoices' : `Invoice ${created.data?.invoiceNumber || created.invoiceNumber || ''}`,
        order_id: created.data?.razorpayOrderId || created.razorpayOrderId,
        config: {
          display: {
            hide: [{ method: 'upi', flows: ['collect'] }],
          },
        },
        ...(useRedirectCallback ? { callback_url: checkoutData.callbackUrl, redirect: true } : {}),
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
          trackPaymentClientEvent('CHECKOUT_DISMISSED', activeAttemptId.current || undefined)
          trackExperimentEvent('CHECKOUT_DISMISSED', activeAttemptId.current || undefined)
          activeIdempotencyKey.current = ''
          setVerificationPending(true)
          setMessage('Checkout closed. Checking whether Razorpay recorded a payment…')
          void checkPaymentStatus()
        } },
        ...(!useRedirectCallback ? { handler: async (response: any) => {
          trackPaymentClientEvent('CHECKOUT_HANDLER_RETURNED', activeAttemptId.current || undefined)
          trackExperimentEvent('CHECKOUT_HANDLER_RETURNED', activeAttemptId.current || undefined)
          await verifyPaymentResponse(response)
        } } : {}),
      })
      checkout.on('payment.failed', (_payload: any) => {
        trackPaymentClientEvent('PAYMENT_FAILED_CALLBACK', activeAttemptId.current || undefined)
        trackExperimentEvent('PAYMENT_FAILED_CALLBACK', activeAttemptId.current || undefined)
        setBusy(false)
        setVerificationPending(true)
        setResumeAvailable(false)
        setMessage('Razorpay reported a payment status that needs confirmation. Check the final status before trying again.')
      })
      checkout.open()
      trackPaymentClientEvent('CHECKOUT_OPEN_REQUESTED', activeAttemptId.current || undefined)
      trackExperimentEvent('CHECKOUT_OPEN_REQUESTED', activeAttemptId.current || undefined)
    } catch (error: any) {
      trackPaymentClientEvent('CLIENT_ERROR', activeAttemptId.current || undefined)
      trackExperimentEvent('CLIENT_ERROR', activeAttemptId.current || undefined)
      setBusy(false)
      if (activeAttemptId.current) setVerificationPending(true)
      setMessage(error?.message || 'Could not start payment')
    }
  }

  const checkPaymentStatus = async () => {
    let attemptId = activeAttemptId.current
    if (busy) return
    setBusy(true)
    trackPaymentClientEvent('STATUS_CHECK_REQUESTED', attemptId || undefined)
    setMessage('Checking Razorpay and CRM payment status…')
    try {
      const queryParams = new URLSearchParams()
      if (attemptId) queryParams.set('attemptId', attemptId)
      if (invoiceId) queryParams.set('invoiceId', invoiceId)
      const query = queryParams.size ? `?${queryParams.toString()}` : ''
      let response = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/status${query}`, { cache: 'no-store' })
      let result = await response.json()
      if (!response.ok) throw new Error(result?.message || 'Could not check payment status')
      setRedirectCheckoutAvailable(result.data?.redirectCheckoutAvailable === true)
      if (result.data?.attemptId) {
        attemptId = result.data.attemptId
        activeAttemptId.current = attemptId
        setCheckoutAttemptReference(attemptId)
      }
      setRazorpayOrderId(result.data?.razorpayOrderId || '')
      setRazorpayPaymentId(result.data?.razorpayPaymentId || result.data?.paymentId || '')
      let status = result.data?.status
      if (status === 'REVIEW' && attemptId) {
        setMessage('Checking the existing Razorpay order. No new payment will be created…')
        const reconcileResponse = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/reconcile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId, ...(invoiceId ? { invoiceId } : {}) }),
          cache: 'no-store',
        })
        const reconcileResult = await reconcileResponse.json()
        if (!reconcileResponse.ok) throw new Error(reconcileResult?.message || 'This payment is still unconfirmed. Do not pay again; Finance review is required.')
        response = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/status${query}`, { cache: 'no-store' })
        result = await response.json()
        if (!response.ok) throw new Error(result?.message || 'Could not refresh payment status')
        setRedirectCheckoutAvailable(result.data?.redirectCheckoutAvailable === true)
        if (result.data?.attemptId) {
          attemptId = result.data.attemptId
          activeAttemptId.current = attemptId
          setCheckoutAttemptReference(attemptId)
        }
        setRazorpayOrderId(result.data?.razorpayOrderId || '')
        setRazorpayPaymentId(result.data?.razorpayPaymentId || result.data?.paymentId || '')
        status = result.data?.status
      }
      setStatusReady(true)
      setRecoveryUnavailable(false)
      trackPaymentClientEvent(status === 'CAPTURED' ? 'STATUS_CHECK_CAPTURED' : status === 'FAILED' || status === 'CREATE_FAILED' ? 'STATUS_CHECK_FAILED' : status === 'REVIEW' ? 'STATUS_CHECK_REVIEW' : 'STATUS_CHECK_PENDING', attemptId || undefined)
      if (status === 'CAPTURED') {
        setSuccess(true)
        setCustomCheckoutOrder(null)
        setVerificationPending(false)
        setResumeAvailable(false)
        setMessage('Payment received and recorded in the CRM.')
        activeIdempotencyKey.current = ''
        activeAttemptId.current = ''
        router.refresh()
      } else if (status === 'FAILED' || status === 'CREATE_FAILED') {
        setVerificationPending(false)
        setCustomCheckoutOrder(null)
        setResumeAvailable(false)
        setResumeMode(null)
        setMessage('This payment did not complete. You can start a new attempt.')
        activeIdempotencyKey.current = ''
        activeAttemptId.current = ''
      } else if (status === 'NONE') {
        setVerificationPending(false)
        setResumeAvailable(false)
        setResumeMode(null)
        setMessage('No active payment attempt was found. You can continue to checkout.')
      } else if (status === 'REVIEW') {
        setVerificationPending(true)
        setResumeAvailable(false)
        setResumeMode(null)
        setMessage('We have not confirmed whether this payment completed. Do not pay again while we check this attempt.')
      } else if (result.data?.canResumeCheckout === true) {
        setVerificationPending(false)
        setResumeAvailable(true)
        setResumeMode('UNATTEMPTED_SAME_ORDER')
        setMessage('Razorpay confirms no payment was attempted. You can reopen the same checkout order.')
      } else if (['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING'].includes(status)) {
        setVerificationPending(true)
        setResumeAvailable(false)
        setResumeMode(null)
        setMessage('Razorpay is still processing this payment. Check its status before trying again. If it remains unresolved, contact Hangers Clothes Spa; do not pay again.')
      } else {
        setVerificationPending(true)
        setResumeAvailable(false)
        setResumeMode(null)
        setMessage('No captured payment is confirmed yet. Please wait before trying again.')
      }
    } catch (error: any) {
      trackPaymentClientEvent('STATUS_CHECK_PENDING', attemptId || undefined)
      setVerificationPending(true)
      setRecoveryUnavailable(true)
      setMessage(error?.message || 'Could not check payment status. Please try again shortly.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!enabled || balanceDue < 1) return
    let mounted = true
    const recover = async (initial = false) => {
      if (!mounted || document.visibilityState === 'hidden' || (!initial && (recoveryInFlight.current || Date.now() - lastRecoveryAt.current < 1500))) return
      recoveryInFlight.current = true
      lastRecoveryAt.current = Date.now()
      try {
        const query = invoiceId ? `?invoiceId=${encodeURIComponent(invoiceId)}` : ''
        const response = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/status${query}`, { cache: 'no-store' })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.message || 'Could not recover payment status')
        const status = result.data?.status
        const attemptId = result.data?.attemptId
        if (!mounted) return
        setRedirectCheckoutAvailable(result.data?.redirectCheckoutAvailable === true)
        setStatusReady(true)
        setRecoveryUnavailable(false)
        if (status === 'NONE') return
        if (attemptId) {
          activeAttemptId.current = attemptId
          setCheckoutAttemptReference(attemptId)
        }
        setRazorpayOrderId(result.data?.razorpayOrderId || '')
        setRazorpayPaymentId(result.data?.razorpayPaymentId || result.data?.paymentId || '')
        trackPaymentClientEvent(status === 'CAPTURED' ? 'STATUS_RECOVERY_CAPTURED' : status === 'FAILED' || status === 'CREATE_FAILED' ? 'STATUS_RECOVERY_FAILED' : status === 'REVIEW' ? 'STATUS_RECOVERY_REVIEW' : 'STATUS_RECOVERY_PENDING', attemptId)
        if (status === 'CAPTURED') {
          setSuccess(true)
          setCustomCheckoutOrder(null)
          setVerificationPending(false)
          setResumeAvailable(false)
          setMessage('Payment received and recorded in the CRM.')
          activeIdempotencyKey.current = ''
          activeAttemptId.current = ''
          router.refresh()
        } else if (status === 'FAILED' || status === 'CREATE_FAILED') {
          setCustomCheckoutOrder(null)
          setVerificationPending(false)
          setResumeAvailable(false)
          setResumeMode(null)
          setMessage('This payment did not complete. You can start a new attempt.')
          activeIdempotencyKey.current = ''
          activeAttemptId.current = ''
        } else if (status === 'REVIEW') {
          setVerificationPending(true)
          setResumeAvailable(false)
          setResumeMode(null)
        setMessage('We have not confirmed whether this payment completed. Do not pay again while we check this attempt.')
        } else if (result.data?.canResumeCheckout === true) {
          setVerificationPending(false)
          setResumeAvailable(true)
          setResumeMode('UNATTEMPTED_SAME_ORDER')
          setMessage('Razorpay confirms no payment was attempted. You can reopen the same checkout order.')
        } else if (['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING'].includes(status)) {
          setVerificationPending(true)
          setResumeAvailable(false)
          setResumeMode(null)
          setMessage('Razorpay is still processing this payment. Check its status before trying again. If it remains unresolved, contact Hangers Clothes Spa; do not pay again.')
        } else {
          setVerificationPending(true)
          setResumeAvailable(false)
          setMessage('We could not confirm the payment status. Check again before starting another payment.')
        }
      } catch {
        // Server-side webhook and Finance reconciliation remain authoritative when this recovery check is unavailable.
        if (mounted) setRecoveryUnavailable(true)
      } finally {
        recoveryInFlight.current = false
      }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void recover() }
    void recover(true)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      mounted = false
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, balanceDue, slug, invoiceId, router])

  if (!enabled || balanceDue < 1) return null
  return (
    <div style={{ margin: '0 26px 22px', padding: 16, border: '1px solid #cfe2ef', borderRadius: 12, background: '#f7fbfe' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#023c62', display: 'block', fontSize: 15 }}>{experimentVariant === 'B' ? 'Pay this invoice online' : 'Pay online'}</strong>
          <span style={{ color: '#6b7fa3', fontSize: 12 }}>{experimentVariant === 'B' ? 'Continue to Razorpay’s secure checkout' : 'Secure checkout via Razorpay'}</span>
        </div>
      {verificationPending ? (
          <span role="status" style={{ borderRadius: 8, padding: '11px 16px', background: '#fff4d6', color: '#795500', fontWeight: 800 }}>Payment status under review</span>
      ) : !statusReady ? (
          <span role="status" style={{ borderRadius: 8, padding: '11px 16px', background: '#f1f5f9', color: '#475569', fontWeight: 800 }}>{recoveryUnavailable ? 'Payment status unavailable' : 'Checking payment status…'}</span>
      ) : customCheckoutOrder ? (
        <span role="status" style={{ borderRadius: 8, padding: '11px 16px', background: '#eff8fc', color: '#075985', fontWeight: 800 }}>Choose a payment method below</span>
      ) : (
          <button type="button" onClick={() => checkoutPage ? void pay() : continueToCheckout()} disabled={busy || success || !experimentReady || !statusReady} style={{ border: 0, borderRadius: 8, padding: '11px 16px', background: success ? '#167b4b' : '#023c62', color: '#fff', fontWeight: 800, cursor: busy || success || !experimentReady || !statusReady ? 'default' : 'pointer', opacity: busy || !experimentReady || !statusReady ? 0.7 : 1 }}>
            {success ? 'Payment received' : busy ? (checkoutPage ? 'Processing…' : 'Checking payment…') : !experimentReady ? 'Preparing secure checkout…' : resumeAvailable && resumeMode ? (checkoutPage ? 'Resume secure checkout' : 'Continue to secure checkout') : checkoutPage ? `Continue · ₹${balanceDue.toLocaleString('en-IN')}` : `Pay ${paymentScope ? 'total outstanding' : 'online'} · ₹${balanceDue.toLocaleString('en-IN')}`}
          </button>
        )}
      </div>
      {checkoutPage && customCheckoutOrder && <RazorpayCustomCheckout
        order={customCheckoutOrder}
        invoiceNumber={invoiceNumber}
        orderNumber={orderNumber}
        customerName={customerName}
        customerPhone={customerPhone}
        onSuccess={(response) => { trackPaymentClientEvent('CUSTOM_CHECKOUT_HANDLER_RETURNED', activeAttemptId.current || undefined); void verifyPaymentResponse(response) }}
        onError={handleCustomPaymentError}
        onCheckStatus={() => { setCustomCheckoutOrder(null); setVerificationPending(true); void checkPaymentStatus() }}
        onCancel={() => { setCustomCheckoutOrder(null); setMessage('Checkout closed. The same unattempted Razorpay order can be resumed.') }}
      />}
      {message && <div role="status" style={{ marginTop: 10, color: success ? '#167b4b' : '#6b7fa3', fontSize: 12, lineHeight: 1.45 }}>{message}</div>}
      {(verificationPending || recoveryUnavailable) && (razorpayOrderId || razorpayPaymentId || checkoutAttemptReference) && <div style={{ marginTop: 7, color: '#52677c', fontSize: 11, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        {razorpayOrderId && <div>Razorpay order reference: {razorpayOrderId}</div>}
        {razorpayPaymentId && <div>Razorpay payment reference: {razorpayPaymentId}</div>}
        {!razorpayOrderId && !razorpayPaymentId && checkoutAttemptReference && <div>CRM attempt reference: {checkoutAttemptReference}</div>}
      </div>}
      {statusReady && redirectCheckoutAvailable && !verificationPending && !success && !busy && <button type="button" onClick={() => void pay(true)} disabled={!experimentReady} style={{ display: 'block', marginTop: 9, border: 0, padding: '4px 0', background: 'transparent', color: '#315f7d', fontSize: 12, fontWeight: 700, textDecoration: 'underline', cursor: experimentReady ? 'pointer' : 'default' }}>Checkout not opening? Use redirect checkout</button>}
      {(verificationPending || recoveryUnavailable) && <button type="button" onClick={checkPaymentStatus} disabled={busy} style={{ marginTop: 10, border: '1px solid #cfe2ef', borderRadius: 8, padding: '9px 12px', background: '#fff', color: '#023c62', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Checking…' : recoveryUnavailable ? 'Retry payment status check' : 'Check Razorpay status'}</button>}
    </div>
  )
}
