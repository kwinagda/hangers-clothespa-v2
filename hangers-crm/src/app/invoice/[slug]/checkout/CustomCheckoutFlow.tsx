'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import RazorpayCustomCheckout from '../RazorpayCustomCheckout'
import { customCheckoutModeAllowed } from './checkout-mode'
import { CheckoutOrder, Configuration, Methods, ProviderError, checkoutRequest, money, providerError } from './razorpay-sdk'
import { SITE_URL } from '@/lib/seo'
import styles from '../RazorpayCustomCheckout.module.css'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'
type Status = {
  status: string; attemptId?: string | null; razorpayOrderId?: string | null; razorpayPaymentId?: string | null
  canResumeCheckout?: boolean; providerLookupUnavailable?: boolean; observedAt?: string | null
  capturedAmountPaise?: number | string | null; currency?: string | null
  capturedAt?: string | null; providerError?: ProviderError | null; retryPolicyGate?: string | null
  allocations?: Array<{ invoiceId: string; invoiceNumber: string; amountPaise: string }>
  invoice?: { balanceDue?: number; status?: string }
}
type Capabilities = { key: string; mode: string; methods: Methods; configuration: Configuration }
const observationTime = (value?: string | null) => {
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? `${new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST (Asia/Kolkata)` : ''
}

export default function CustomCheckoutFlow({ slug, invoiceId, invoiceNumber, orderNumber, amountPaise, customerName, customerPhone, outstanding = false, paymentAllowed = true, initialStatus }: {
  slug: string; invoiceId?: string; invoiceNumber?: string; orderNumber?: string; amountPaise: number
  customerName?: string; customerPhone?: string; outstanding?: boolean
  paymentAllowed?: boolean
  initialStatus?: Status
}) {
  const router = useRouter()
  const base = `${API}/public/invoices/${encodeURIComponent(slug)}/payment`
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [status, setStatus] = useState<Status | null>(initialStatus || null)
  const [order, setOrder] = useState<CheckoutOrder | null>(null)
  const [message, setMessage] = useState('')
  const [diagnostic, setDiagnostic] = useState<ProviderError | null>(null)
  const [successReferences, setSuccessReferences] = useState<Array<{ order_id?: string; payment_id?: string }>>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(!initialStatus)
  const [loadError, setLoadError] = useState('')
  const [methodsError, setMethodsError] = useState('')
  const [checkedAt, setCheckedAt] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [offline, setOffline] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const backoffUntil = useRef(0)
  const methodsRequest = useRef<Promise<Methods> | null>(null)
  const alive = useRef(true)
  const requestKey = useRef('')
  const attemptId = useRef('')
  const preparing = useRef<Promise<CheckoutOrder> | null>(null)
  const checking = useRef<Promise<void> | null>(null)
  const lastCheck = useRef(0)
  const confirmed = useRef(initialStatus?.status === 'CAPTURED')
  const query = invoiceId ? `?invoiceId=${encodeURIComponent(invoiceId)}` : ''

  const rememberBackoff = useCallback((error: any) => {
    if (typeof error?.retryAt === 'number' && error.retryAt > Date.now()) {
      backoffUntil.current = Math.max(backoffUntil.current, error.retryAt)
      if (alive.current) setRetryAt(backoffUntil.current)
    }
  }, [])

  const acceptStatus = useCallback((next: Status) => {
    if (!alive.current) return
    if (confirmed.current && next.status !== 'CAPTURED') return
    setStatus(next)
    if (next.providerError) setDiagnostic(next.providerError)
    if (next.attemptId) attemptId.current = next.attemptId
    setCheckedAt(observationTime(new Date().toISOString()))
    if (next.providerLookupUnavailable) setOrder(null)
    if (next.status === 'CAPTURED' && !confirmed.current) {
      confirmed.current = true
      setSubmitted(false)
      setMessage('Payment received. Your invoice balance has been updated.')
      setOrder(null)
      if (outstanding && invoiceId) router.replace(`/invoice/${encodeURIComponent(slug)}/checkout?invoiceId=${encodeURIComponent(invoiceId)}`)
      else router.refresh()
    }
  }, [router, outstanding, invoiceId, slug])

  const recover = useCallback((): Promise<void> => {
    if (checking.current) return checking.current
    if (Date.now() < backoffUntil.current) return Promise.resolve()
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (alive.current) { setLoading(false); setLoadError('You are offline. Reconnect to check payment status before paying.') }
      return Promise.resolve()
    }
    if (Date.now() - lastCheck.current < 1500) return Promise.resolve()
    lastCheck.current = Date.now()
    const run = async () => {
      if (alive.current) setBusy(true)
      try {
        const params = new URLSearchParams()
        if (invoiceId) params.set('invoiceId', invoiceId)
        if (attemptId.current) params.set('attemptId', attemptId.current)
        params.set('checkoutIntegration', 'CUSTOM')
        let next = await checkoutRequest<Status>(`${base}/status?${params}`)
        if (next.status === 'REVIEW' && next.attemptId && !next.razorpayPaymentId) {
          await checkoutRequest(`${base}/reconcile`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attemptId: next.attemptId, invoiceId }),
          })
          next = await checkoutRequest<Status>(`${base}/status?${params}`)
        }
        acceptStatus(next)
        if (alive.current) setLoadError('')
      } catch (error: any) {
        rememberBackoff(error)
        if (alive.current) {
          setOrder(null)
          setStatus((prior) => prior ? { ...prior, providerLookupUnavailable: true } : prior)
          setLoadError(error?.message || 'Payment status is unavailable. Do not make another payment while we check.')
        }
      } finally {
        checking.current = null
        if (alive.current) { setBusy(false); setLoading(false) }
      }
    }
    checking.current = run()
    return checking.current
  }, [acceptStatus, base, invoiceId, rememberBackoff])

  const loadMethods = useCallback(async () => {
    if (!paymentAllowed) return
    if (methodsRequest.current) return methodsRequest.current
    const run = async (): Promise<Methods> => {
      try {
        if (!navigator.onLine) throw new Error('You are offline. Reconnect before refreshing payment methods.')
        const result = await checkoutRequest<Capabilities>(`${base}/custom/capabilities${query}`)
        if (!customCheckoutModeAllowed({
          mode: result.mode,
          key: result.key,
          hostname: window.location.hostname,
          protocol: window.location.protocol,
          liveEnabled: process.env.NEXT_PUBLIC_RAZORPAY_CUSTOM_CHECKOUT_LIVE_ENABLED === 'true',
          siteUrl: SITE_URL,
        })) throw new Error('Custom Checkout is not enabled for this site and payment mode.')
        if (alive.current) { setCapabilities(result); setMethodsError('') }
        return result.methods
      } catch (error: any) {
        rememberBackoff(error)
        if (alive.current) setMethodsError(error?.message || 'Payment methods are temporarily unavailable.')
        throw error
      }
    }
    methodsRequest.current = run().finally(() => { methodsRequest.current = null })
    return methodsRequest.current
  }, [base, query, paymentAllowed, rememberBackoff])

  const reloadMethods = useCallback(() => { void loadMethods().catch(() => {}) }, [loadMethods])

  useEffect(() => {
    alive.current = true
    setOffline(!navigator.onLine)
    reloadMethods()
    void recover()
    const onReturn = () => { setOffline(!navigator.onLine); if (document.visibilityState === 'visible') void recover() }
    const onOffline = () => {
      setOffline(true)
      setLoadError('You are offline. Reconnect to check payment status before paying.')
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onReturn)
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      alive.current = false
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onReturn)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [reloadMethods, recover])

  useEffect(() => {
    if (!retryAt) return
    let timer: ReturnType<typeof setTimeout>
    const releaseBackoff = () => {
      const remaining = backoffUntil.current - Date.now()
      if (remaining > 0) timer = setTimeout(releaseBackoff, Math.min(2147483647, remaining))
      else setRetryAt(0)
    }
    timer = setTimeout(releaseBackoff, Math.min(2147483647, Math.max(0, retryAt - Date.now())))
    return () => clearTimeout(timer)
  }, [retryAt])

  const needsRecovery = submitted || Boolean(status && !['NONE', 'CAPTURED', 'CREATE_FAILED'].includes(status.status) && !status.canResumeCheckout)
  useEffect(() => {
    if (!needsRecovery) return
    const timers = [2, 5, 10, 20, 30].map((seconds) => setTimeout(() => {
      if (document.visibilityState === 'visible') void recover()
    }, seconds * 1000))
    return () => timers.forEach(clearTimeout)
  }, [needsRecovery, recover])

  const prepare = useCallback(() => {
    if (preparing.current) return preparing.current
    const run = async () => {
      if (!navigator.onLine || Date.now() < backoffUntil.current) throw new Error('Reconnect or wait for the request limit to clear, then check payment status before paying.')
      if (!requestKey.current) requestKey.current = crypto.randomUUID()
      const result = await checkoutRequest<CheckoutOrder & { mode: string }>(`${base}/create-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey.current },
        body: JSON.stringify({ invoiceId, checkoutIntegration: 'CUSTOM', ...(outstanding ? { paymentScope: 'CUSTOMER_OUTSTANDING' } : {}) }),
      })
      const modeAllowed = customCheckoutModeAllowed({
        mode: result.mode,
        key: result.key,
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        liveEnabled: process.env.NEXT_PUBLIC_RAZORPAY_CUSTOM_CHECKOUT_LIVE_ENABLED === 'true',
        siteUrl: SITE_URL,
      })
      if (!modeAllowed || (result.mode === 'TEST' && !result.testContact) || (result.mode === 'LIVE' && result.testContact)
        || !result.razorpayOrderId || !Number.isSafeInteger(result.amount) || result.amount !== amountPaise || result.currency !== 'INR') {
        throw new Error('The payment details changed or could not be verified. Check the invoice before paying.')
      }
      if (result.checkoutAttemptId) attemptId.current = result.checkoutAttemptId
      if (alive.current) { setOrder(result); setMessage('') }
      return result
    }
    preparing.current = run().catch((error) => {
      rememberBackoff(error)
      if (alive.current) {
        setDiagnostic(providerError(error))
        setMessage(error?.message || 'Payment preparation is unconfirmed. Check payment status.')
        setStatus((prior) => ({ ...prior, status: 'REVIEW' }))
        void recover()
      }
      throw error
    }).finally(() => { preparing.current = null })
    return preparing.current
  }, [base, invoiceId, outstanding, amountPaise, recover, rememberBackoff])

  const verify = async (value: any) => {
    if (!alive.current) return
    // Retain only sanitized references, never the signature or raw SDK response.
    const references = providerError({ error: { metadata: {
      order_id: value?.razorpay_order_id, payment_id: value?.razorpay_payment_id,
    } } })?.metadata
    if (references?.order_id || references?.payment_id) {
      setSuccessReferences((prior) => prior.some((item) => item.order_id === references.order_id && item.payment_id === references.payment_id)
        ? prior : [...prior, references])
    }
    setSubmitted(true)
    setMessage('Confirming your payment...')
    try {
      if (!value?.razorpay_order_id || !value?.razorpay_payment_id || !value?.razorpay_signature) throw new Error('The payment confirmation is incomplete. Checking its status.')
      await checkoutRequest(`${base}/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, razorpayOrderId: value.razorpay_order_id, razorpayPaymentId: value.razorpay_payment_id, razorpaySignature: value.razorpay_signature }),
      })
    } catch (error: any) {
      rememberBackoff(error)
      if (alive.current) { setDiagnostic(providerError(error)); setMessage(error?.message || 'Payment confirmation is pending.') }
    } finally {
      lastCheck.current = 0
      void recover()
    }
  }

  if (status?.status === 'CAPTURED') return <section className={styles.result} role="status">
    <h2>Payment received</h2><p>{status.capturedAmountPaise != null && Number.isSafeInteger(Number(status.capturedAmountPaise)) && status.currency
      ? `${money(Number(status.capturedAmountPaise), status.currency)} paid to Hangers Clothes Spa.` : 'Your payment has been confirmed by Hangers.'}</p>
    {invoiceNumber && <p>Invoice {invoiceNumber}</p>}
    {status.razorpayOrderId && <p>Razorpay order: <b>{status.razorpayOrderId}</b></p>}
    {status.capturedAt && <p>{new Date(status.capturedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>}
    {!!status.allocations?.length && <details className={styles.details}><summary>Paid invoice split</summary><ul>
      {status.allocations.map((item) => <li key={item.invoiceId}>{item.invoiceNumber}: {money(Number(item.amountPaise), status.currency || 'INR')}</li>)}
    </ul></details>}
    {(status.razorpayOrderId || status.razorpayPaymentId) && <details className={styles.details}><summary>Payment references</summary>
      {status.razorpayOrderId && <p>Razorpay order: {status.razorpayOrderId}</p>}
      {status.razorpayPaymentId && <p>Razorpay payment: {status.razorpayPaymentId}</p>}
    </details>}
    <Link href={`/invoice/${encodeURIComponent(slug)}`}>View invoice and receipt details</Link>
  </section>

  const canPrepare = Boolean(paymentAllowed && status && !status.providerLookupUnavailable && (['NONE', 'CREATE_FAILED'].includes(status.status) || status.canResumeCheckout))
  const showForm = Boolean(capabilities && (canPrepare || order))
  const showPaymentReview = Boolean(paymentAllowed && !loading && status && !status.canResumeCheckout
    && (status.providerLookupUnavailable || ['CREATING', 'CREATED', 'AUTHORIZED', 'PENDING', 'REVIEW'].includes(status.status)))
  const provisional: CheckoutOrder | null = capabilities ? { key: capabilities.key, amount: amountPaise, currency: 'INR', razorpayOrderId: '' } : null
  return <section aria-label="Invoice payment" aria-busy={loading}>
    {loading && <p role="status">Loading secure payment details...</p>}
    {(loadError || methodsError) && <div className={styles.notice} role="alert">
      <p>{loadError || methodsError}</p>
      {loadError
        ? <button type="button" className={styles.retry} disabled={busy || offline || retryAt > 0} onClick={() => { reloadMethods(); void recover() }}>Retry loading payment details</button>
        : <button type="button" className={styles.retry} disabled={offline || retryAt > 0} onClick={reloadMethods}>Reload payment methods</button>}
    </div>}
    {status?.status === 'FAILED' && status.canResumeCheckout && !status.providerLookupUnavailable && <p role="status">
      Razorpay reports the previous attempt failed. You can retry using the same checkout order.
    </p>}
    {showForm && provisional && <RazorpayCustomCheckout order={order || provisional} invoiceNumber={invoiceNumber} orderNumber={orderNumber}
      customerName={customerName} customerPhone={customerPhone} apiBase={base} invoiceId={invoiceId}
      discoveredMethods={capabilities!.methods} configuration={capabilities!.configuration} onPrepare={prepare}
      onSubmitted={() => { setSubmitted(true); setMessage('Complete the payment in your selected app or bank window.') }}
      recoveryRequired={Boolean(offline || retryAt > 0 || methodsError || loadError || status?.providerLookupUnavailable || (status && !['NONE', 'CREATE_FAILED'].includes(status.status) && !status.canResumeCheckout))}
      onSuccess={(value) => void verify(value)} onError={(value) => {
        setDiagnostic(providerError(value)); setOrder(null); setSubmitted(true)
        setStatus((prior) => ({ ...prior, status: 'PENDING' }))
        setMessage(value?.error?.description || 'The payment result is unconfirmed. Check its status before retrying.')
        lastCheck.current = 0; void recover()
      }} onCheckStatus={() => void recover()} onCancel={() => { setOrder(null); setSubmitted(true); void recover() }} />}
    {showPaymentReview && <div className={styles.notice} role="status">
      <h2>Payment status under review</h2><p>We are checking the existing payment. Do not pay again until its status is confirmed.</p>
    </div>}
    {message && <p role="status" aria-live="polite">{message}</p>}
    {!!successReferences.length && <details className={styles.details}><summary>Unverified SDK success references</summary>
      <p>Received from the payment window, not proof of capture. Check payment status before paying again.</p>
      {successReferences.map((item, index) => <div key={index}>
        {item.order_id && <p>Razorpay order: {item.order_id}</p>}
        {item.payment_id && <p>Razorpay payment: {item.payment_id}</p>}
      </div>)}
    </details>}
    {(status?.razorpayOrderId || status?.razorpayPaymentId) && <details className={styles.details}><summary>Payment references</summary>
      {status.razorpayOrderId && <p>Razorpay order: {status.razorpayOrderId}</p>}
      {status.razorpayPaymentId && <p>Razorpay payment: {status.razorpayPaymentId}</p>}
    </details>}
    {diagnostic && <details className={styles.details}><summary>Razorpay response details</summary><dl>
      {Object.entries(diagnostic).filter(([key]) => key !== 'metadata').map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}
      {diagnostic.metadata?.order_id && <div><dt>Razorpay order</dt><dd>{diagnostic.metadata.order_id}</dd></div>}
      {diagnostic.metadata?.payment_id && <div><dt>Razorpay payment</dt><dd>{diagnostic.metadata.payment_id}</dd></div>}
    </dl></details>}
    {retryAt > 0 && <p role="status">Payment requests are temporarily limited. Check again after {new Date(retryAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.</p>}
    {checkedAt && <p><small>{observationTime(status?.observedAt)
      ? `Server observation: ${observationTime(status?.observedAt)}` : 'Server observation time unavailable.'}
      {' '}Browser received status: {checkedAt}</small></p>}
    {(needsRecovery || loadError) && <div className={styles.actions}><button type="button" disabled={busy || offline || retryAt > 0} onClick={() => void recover()}>{busy ? 'Checking...' : 'Check payment status'}</button></div>}
  </section>
}
