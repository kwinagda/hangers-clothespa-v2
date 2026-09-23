'use client'

import { useState } from 'react'

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, any>) => { open: () => void; on: (event: string, handler: (payload: any) => void) => void }
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'

export default function InvoicePaymentButton({ slug, balanceDue, customerName, customerPhone, enabled = true }: { slug: string; balanceDue: number; customerName?: string; customerPhone?: string; enabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)

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
    if (busy || success || !enabled || balanceDue < 1) return
    setBusy(true)
    setMessage('Preparing secure payment…')
    try {
      await loadCheckout()
      const createResponse = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/create-order`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store' })
      const created = await createResponse.json()
      if (!createResponse.ok) throw new Error(created?.message || 'Could not start payment')
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
          ...(customerPhone ? { contact: `+91${String(customerPhone).replace(/\D/g, '').replace(/^91/, '')}` } : {}),
        },
        theme: { color: '#023c62' },
        modal: { ondismiss: () => { setBusy(false); setMessage('Payment cancelled. You can try again.') } },
        handler: async (response: any) => {
          setMessage('Confirming payment…')
          try {
            const verifyResponse = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(response), cache: 'no-store' })
            const verified = await verifyResponse.json()
            if (!verifyResponse.ok) throw new Error(verified?.message || 'Payment could not be confirmed')
            setSuccess(true)
            setMessage('Payment received successfully. This invoice will refresh shortly.')
          } catch (error: any) {
            setMessage(error?.message || 'Payment was received but confirmation is pending. Please refresh this invoice.')
          } finally {
            setBusy(false)
          }
        },
      })
      checkout.on('payment.failed', (payload: any) => { setBusy(false); setMessage(payload?.error?.description || 'Payment failed. Please try again.') })
      checkout.open()
    } catch (error: any) {
      setBusy(false)
      setMessage(error?.message || 'Could not start payment')
    }
  }

  if (!enabled || balanceDue < 1) return null
  return (
    <div style={{ margin: '0 26px 22px', padding: 16, border: '1px solid #cfe2ef', borderRadius: 12, background: '#f7fbfe' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#023c62', display: 'block', fontSize: 15 }}>Pay online</strong>
          <span style={{ color: '#6b7fa3', fontSize: 12 }}>Secure checkout via Razorpay</span>
        </div>
        <button type="button" onClick={pay} disabled={busy || success} style={{ border: 0, borderRadius: 8, padding: '11px 16px', background: success ? '#167b4b' : '#023c62', color: '#fff', fontWeight: 800, cursor: busy || success ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {success ? 'Payment received' : busy ? 'Processing…' : `Pay ₹${balanceDue.toLocaleString('en-IN')}`}
        </button>
      </div>
      {message && <div role="status" style={{ marginTop: 10, color: success ? '#167b4b' : '#6b7fa3', fontSize: 12, lineHeight: 1.45 }}>{message}</div>}
    </div>
  )
}
