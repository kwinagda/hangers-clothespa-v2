'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { MessageCircle, Share2, X } from 'lucide-react'
import { quotationsAPI } from '@/lib/api'

type Quotation = {
  id: string
  orderNumber?: string
  totalAmount?: number
  validUntil?: string | null
  quotationStatus?: string | null
  customer?: { name?: string | null; phone?: string | null; notifWhatsApp?: boolean | null }
}

export function QuotationShareDialog({ quotation, onClose }: { quotation: Quotation; onClose: () => void }) {
  const [busy, setBusy] = useState<'whatsapp' | 'share' | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const canResend = ['SENT', 'APPROVED'].includes(quotation.quotationStatus || '')
    && !!quotation.customer?.phone
    && quotation.customer?.notifWhatsApp !== false

  useEffect(() => {
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const resendWhatsApp = async () => {
    setBusy('whatsapp')
    try {
      await quotationsAPI.sendWhatsApp(quotation.id)
      toast.success('Quotation resent on WhatsApp')
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to resend quotation on WhatsApp')
    } finally {
      setBusy(null)
    }
  }

  const sharePdfLink = async () => {
    setBusy('share')
    try {
      const response = await quotationsAPI.share(quotation.id)
      const shareUrl = response?.data?.shareUrl || response?.shareUrl
      if (!shareUrl) throw new Error('Failed to create quotation PDF link')
      const validUntil = quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('en-IN') : 'Open'
      const shareText = [
        `Quotation ${quotation.orderNumber || ''}`.trim(),
        `Customer: ${quotation.customer?.name || quotation.customer?.phone || 'Customer'}`,
        `Amount: ₹${(quotation.totalAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
        `Valid Until: ${validUntil}`,
      ].join('\n')

      if (navigator.share) {
        await navigator.share({ title: `Quotation ${quotation.orderNumber || ''}`.trim(), text: shareText, url: shareUrl })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
        toast.success('Quotation PDF link copied')
      } else {
        throw new Error('Sharing is not available in this browser')
      }
      onClose()
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e?.message || 'Failed to share quotation PDF')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(10, 27, 44, 0.52)' }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="quotation-share-title" style={{ width: 'min(420px, 100%)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 20px 60px rgba(10, 27, 44, 0.22)', padding: 20, fontFamily: 'var(--crm-font-ui)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <div>
            <h2 id="quotation-share-title" style={{ margin: 0, color: '#023c62', fontSize: 20, fontWeight: 700 }}>Share quotation</h2>
            <p style={{ margin: '4px 0 0', color: '#60758d', fontSize: 13 }}>{quotation.orderNumber}</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={!!busy} aria-label="Close share options" style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, flexShrink: 0, border: '1px solid #dce8f0', borderRadius: 8, background: '#fff', color: '#023c62', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <button type="button" onClick={resendWhatsApp} disabled={!canResend || !!busy} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px', marginBottom: 10, border: '1px solid #b8e2c7', borderRadius: 8, background: '#f1fbf4', color: '#146a35', textAlign: 'left', cursor: canResend && !busy ? 'pointer' : 'not-allowed', opacity: canResend ? 1 : 0.55 }}>
          <MessageCircle size={20} style={{ flexShrink: 0 }} />
          <span>
            <strong style={{ display: 'block', fontSize: 14 }}>{busy === 'whatsapp' ? 'Sending...' : 'Resend on WhatsApp'}</strong>
            <span style={{ display: 'block', marginTop: 2, fontSize: 12 }}>Send to {quotation.customer?.name || quotation.customer?.phone || 'the customer'} using the Hangers template</span>
          </span>
        </button>
        {!canResend && <p style={{ margin: '0 0 12px', color: '#60758d', fontSize: 12 }}>{quotation.customer?.notifWhatsApp === false ? 'This customer has WhatsApp notifications turned off.' : !quotation.customer?.phone ? 'Add a customer mobile number before sending on WhatsApp.' : 'Mark the quotation as Sent to enable WhatsApp resend.'}</p>}

        <button type="button" onClick={sharePdfLink} disabled={!!busy} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px', border: '1px solid #dce8f0', borderRadius: 8, background: '#fff', color: '#023c62', textAlign: 'left', cursor: busy ? 'wait' : 'pointer' }}>
          <Share2 size={20} style={{ flexShrink: 0 }} />
          <span>
            <strong style={{ display: 'block', fontSize: 14 }}>{busy === 'share' ? 'Preparing link...' : 'Share PDF link'}</strong>
            <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: '#60758d' }}>Open the phone share menu or copy the link</span>
          </span>
        </button>
      </div>
    </div>
  )
}
