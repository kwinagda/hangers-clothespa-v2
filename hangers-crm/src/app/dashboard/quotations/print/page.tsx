'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, FileDown, Share2 } from 'lucide-react'
import { quotationsAPI } from '@/lib/api'
import { LOGO_BLUE_URL, LOGO_WHITE_URL } from '@/lib/branding'

const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const roundCurrency = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2))

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const getLinePricing = (item: any) => {
  const quantity = Math.max(0, Number(item?.quantity || 0))
  const unitPrice = Number(item?.unitPrice || 0)
  const grossAmount = roundCurrency(unitPrice * quantity)
  const discountType = String(item?.lineDiscountType || '').trim().toUpperCase()
  const discountValue = Number(item?.lineDiscountValue || 0)

  let discountPerQtyLabel = '—'
  let totalDiscount = Number(item?.lineDiscountAmount || 0)

  if (discountType === 'FLAT' && discountValue > 0) {
    totalDiscount = Math.min(grossAmount, roundCurrency(discountValue * quantity))
    discountPerQtyLabel = `${fmt(discountValue)}/qty`
  } else if (discountType === 'PERCENT' && discountValue > 0) {
    totalDiscount = Math.min(grossAmount, roundCurrency((grossAmount * discountValue) / 100))
    discountPerQtyLabel = `${discountValue}%`
  } else if (totalDiscount > 0 && quantity > 0) {
    discountPerQtyLabel = `${fmt(roundCurrency(totalDiscount / quantity))}/qty`
  }

  const finalAmount = roundCurrency(Math.max(0, Number(item?.subtotal ?? (grossAmount - totalDiscount))))

  return {
    quantity,
    unitPrice,
    grossAmount,
    discountPerQtyLabel,
    totalDiscount,
    finalAmount,
  }
}

const getQuotationPricing = (quotation: any) => {
  const items = (quotation?.items || []).map((item: any) => ({
    ...item,
    pricing: getLinePricing(item),
  }))
  const grossServiceValue = roundCurrency(items.reduce((sum: number, item: any) => sum + item.pricing.grossAmount, 0))
  const serviceDiscountTotal = roundCurrency(items.reduce((sum: number, item: any) => sum + item.pricing.totalDiscount, 0))
  const netServiceValue = roundCurrency(items.reduce((sum: number, item: any) => sum + item.pricing.finalAmount, 0))
  const billDiscount = roundCurrency(Number(quotation?.discount || 0))
  const finalTotal = roundCurrency(Math.max(0, netServiceValue - billDiscount))
  const quotedItemsCount = items.reduce((sum: number, item: any) => sum + item.pricing.quantity, 0)

  return {
    items,
    grossServiceValue,
    serviceDiscountTotal,
    netServiceValue,
    billDiscount,
    finalTotal,
    quotedItemsCount,
  }
}

const fetchAsDataUrl = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load asset ${response.status}`)
  const blob = await response.blob()

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read asset'))
    reader.readAsDataURL(blob)
  })
}

function QuotationPrintPageContent() {
  const searchParams = useSearchParams()
  const quotationId = searchParams.get('quotationId')
  const autoPrint = searchParams.get('autoprint') === '1'
  const [quotation, setQuotation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [brandBlueLogo, setBrandBlueLogo] = useState(LOGO_BLUE_URL)
  const [brandWhiteLogo, setBrandWhiteLogo] = useState(LOGO_WHITE_URL)
  const autoPrintDoneRef = useRef(false)

  useEffect(() => {
    if (!quotationId) {
      setLoading(false)
      toast.error('Quotation ID is required')
      return
    }

    setLoading(true)
    quotationsAPI.get(quotationId)
      .then((response: any) => {
        setQuotation(response?.data?.quotation || response?.quotation || null)
      })
      .catch((e: any) => {
        toast.error(e.message || 'Failed to load quotation')
      })
      .finally(() => setLoading(false))
  }, [quotationId])

  useEffect(() => {
    let cancelled = false

    Promise.allSettled([
      fetchAsDataUrl(LOGO_BLUE_URL),
      fetchAsDataUrl(LOGO_WHITE_URL),
    ]).then(([blueResult, whiteResult]) => {
      if (cancelled) return
      if (blueResult.status === 'fulfilled' && blueResult.value) setBrandBlueLogo(blueResult.value)
      if (whiteResult.status === 'fulfilled' && whiteResult.value) setBrandWhiteLogo(whiteResult.value)
    })

    return () => { cancelled = true }
  }, [])

  const triggerPrint = useCallback(() => {
    if (!quotation) return
    setPrinting(true)
    setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 180)
  }, [quotation])

  const openPdf = useCallback(async () => {
    if (!quotation) return
    setDownloadingPdf(true)
    try {
      const url = quotationsAPI.pdfUrl(quotation.id)
      const win = window.open(url, '_blank', 'noopener,noreferrer')
      if (!win) throw new Error('Popup blocked. Allow popups to open the quotation PDF.')
      toast.success('Quotation PDF opened')
    } catch (e: any) {
      toast.error(e.message || 'Failed to open quotation PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }, [quotation])

  const shareQuotation = useCallback(async () => {
    if (!quotation) return
    const origin = window.location.origin
    const shareUrl = `${origin}/dashboard/quotations/print?quotationId=${quotation.id}`
    const shareText = [
      `Quotation ${quotation.orderNumber}`,
      `Customer: ${quotation.customer?.name || quotation.customer?.phone || 'Customer'}`,
      `Amount: ${fmt(quotation.totalAmount || 0)}`,
      `Valid Until: ${formatDate(quotation.validUntil)}`,
      shareUrl,
    ].join('\n')

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Quotation ${quotation.orderNumber}`,
          text: shareText,
          url: shareUrl,
        })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText)
        toast.success('Quotation share text copied')
      } else {
        throw new Error('Share is not available in this browser')
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      toast.error(e.message || 'Failed to share quotation')
    }
  }, [quotation])

  useEffect(() => {
    if (!autoPrint || !quotation || autoPrintDoneRef.current || printing) return
    autoPrintDoneRef.current = true
    const timer = window.setTimeout(() => triggerPrint(), 250)
    return () => window.clearTimeout(timer)
  }, [autoPrint, printing, quotation, triggerPrint])

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#6b7fa3', fontFamily: 'var(--crm-font-ui)' }}>Loading quotation preview...</div>
  }

  if (!quotation) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#6b7fa3', fontFamily: 'var(--crm-font-ui)' }}>
        Quotation not found.
      </div>
    )
  }

  const pricing = getQuotationPricing(quotation)

  return (
    <div className="quotation-print-root" style={{ padding: '28px 32px 56px', maxWidth: 1120, margin: '0 auto', fontFamily: 'var(--crm-font-ui)' }}>
      <style jsx global>{`
        @page {
          size: A4;
          margin: 14mm;
        }

        @media print {
          html, body, .quotation-print-root, .quotation-print-root * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          html, body {
            background: #ffffff !important;
          }

          body * {
            visibility: hidden;
          }

          .quotation-print-root,
          .quotation-print-root * {
            visibility: visible;
          }

          .quotation-print-root {
            position: absolute;
            inset: 0;
            width: 100%;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .quotation-print-toolbar {
            display: none !important;
          }

          .quotation-print-card {
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="quotation-print-toolbar" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <Link href="/dashboard/quotations" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#6b7fa3', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            <ArrowLeft size={14} />
            Back to Quotations
          </Link>
          <h1 style={{ margin: 0, fontFamily: 'var(--crm-font-display)', color: '#023c62', fontSize: 28 }}>Quotation Preview</h1>
          <p style={{ margin: '6px 0 0', color: '#6b7fa3', fontSize: 13 }}>Review the customer quotation here. Use the PDF action to open the branded viewer, then download from Chrome if needed.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={shareQuotation}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid #dce8f0', background: '#fff', color: '#023c62', fontWeight: 700, cursor: 'pointer' }}
          >
            <Share2 size={15} />
            Share
          </button>
          <button
            onClick={openPdf}
            disabled={downloadingPdf}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#023c62', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: downloadingPdf ? 0.65 : 1 }}
          >
            <FileDown size={15} />
            {downloadingPdf ? 'Opening PDF...' : 'Open PDF'}
          </button>
          <button
            onClick={triggerPrint}
            disabled={printing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#023c62', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: printing ? 0.65 : 1 }}
          >
            <FileDown size={15} />
            {printing ? 'Preparing...' : 'Print'}
          </button>
        </div>
      </div>

      <div className="quotation-print-card" style={{ background: '#fff', borderRadius: 24, border: '1px solid #d7e4ee', boxShadow: '0 18px 40px rgba(2,60,98,0.08)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg, #022d4d 0%, #023c62 56%, #245f87 100%)', padding: '28px 28px 24px', position: 'relative' }}>
          <div style={{ position: 'absolute', right: -48, top: -36, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'absolute', right: 96, top: 86, width: 84, height: 84, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', position: 'relative' }}>
            <div style={{ maxWidth: 520 }}>
              <img src={brandWhiteLogo} alt="Hangers" style={{ width: 174, height: 54, objectFit: 'contain', objectPosition: 'left center', display: 'block', marginBottom: 12 }} />
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', color: '#dcecf9', fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Customer Quotation
              </div>
              <div style={{ marginTop: 12, color: '#eaf5ff', fontSize: 13, lineHeight: 1.65 }}>
                A premium service estimate prepared through the Hangers CRM workflow. Final charges may be adjusted only if item count, fabric condition, or service complexity changes at inspection.
              </div>
            </div>

            <div style={{ minWidth: 250, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 18, padding: '16px 18px', backdropFilter: 'blur(8px)' }}>
              <div style={{ fontSize: 11, color: '#c9deef', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Estimated Total</div>
              <div style={{ fontFamily: 'var(--crm-font-display)', fontSize: 34, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{fmt(pricing.finalTotal)}</div>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#b9d2e5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Quote No.</div>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>{quotation.orderNumber}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#b9d2e5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Valid Until</div>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>{formatDate(quotation.validUntil)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16, alignItems: 'stretch', marginBottom: 22 }}>
          <div style={{ border: '1px solid #dce8f0', borderRadius: 18, padding: '18px 20px', background: 'linear-gradient(180deg, #fafdff 0%, #f4f9fd 100%)' }}>
            <div style={{ fontSize: 11, color: '#6f87a1', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Customer</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--crm-font-display)', color: '#023c62', fontWeight: 700, marginBottom: 4 }}>{quotation.customer?.name || 'Customer'}</div>
            <div style={{ color: '#53657d', fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{quotation.customer?.phone || '—'}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 12px', borderRadius: 999, background: '#e9f3fb', color: '#023c62', fontSize: 12, fontWeight: 700 }}>{pricing.quotedItemsCount} item{pricing.quotedItemsCount === 1 ? '' : 's'}</div>
              <div style={{ padding: '8px 12px', borderRadius: 999, background: pricing.serviceDiscountTotal > 0 ? '#e8f7ee' : '#f2f6fa', color: pricing.serviceDiscountTotal > 0 ? '#166534' : '#5d748a', fontSize: 12, fontWeight: 700 }}>
                Included Service Discount {pricing.serviceDiscountTotal > 0 ? fmt(pricing.serviceDiscountTotal) : '—'}
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid #dce8f0', borderRadius: 18, padding: '18px 20px', background: '#fff' }}>
            <div style={{ fontSize: 11, color: '#6f87a1', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Validity</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#8ca0b5', marginBottom: 4 }}>Created On</div>
                <div style={{ fontSize: 15, color: '#182538', fontWeight: 700 }}>{formatDate(quotation.createdAt)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#8ca0b5', marginBottom: 4 }}>Valid Until</div>
                <div style={{ fontSize: 15, color: '#182538', fontWeight: 700 }}>{formatDate(quotation.validUntil)}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 22 }}>
          {[
            { label: 'Quotation Number', value: quotation.orderNumber, meta: '' },
            { label: 'Valid Until', value: formatDate(quotation.validUntil), meta: '' },
            { label: 'Gross Service Value', value: fmt(pricing.grossServiceValue), meta: '' },
            { label: 'Bill Discount', value: pricing.billDiscount ? `-${fmt(pricing.billDiscount)}` : '—', meta: '' },
          ].map((entry) => (
            <div key={entry.label} style={{ border: '1px solid #dce8f0', borderRadius: 14, padding: '14px 16px', background: '#fff' }}>
              <div style={{ fontSize: 11, color: '#7d91a7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{entry.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#162336' }}>{entry.value}</div>
              {entry.meta && <div style={{ marginTop: 4, color: '#7088a2', fontSize: 12 }}>{entry.meta}</div>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#023c62', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Quoted Services</div>
        </div>
        <div style={{ marginTop: 12, border: '1px solid #e4edf5', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#edf5fb' }}>
                {['Service', 'Qty', 'Rate', 'Gross', 'Disc/Qty', 'Disc Total', 'Final'].map((label) => (
                  <th key={label} style={{ padding: '13px 14px', textAlign: label === 'Service' ? 'left' : 'right', fontSize: 11, color: '#476581', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #dce8f0' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pricing.items.map((item: any, index: number) => (
                <tr key={item.id || `${item.serviceName}-${index}`} style={{ background: index % 2 === 0 ? '#fff' : '#fbfdff' }}>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef3f8' }}>
                    <div style={{ fontWeight: 700, color: '#182538' }}>{item.serviceName || 'Service'}</div>
                    <div style={{ fontSize: 11, color: '#8194a8', marginTop: 2 }}>{item.garmentType || '—'}{item.variant ? ` · ${item.variant}` : ''}</div>
                    {item.notes && (
                      <div style={{ fontSize: 11, color: '#53657d', marginTop: 4, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                        <strong style={{ color: '#476581' }}>Description:</strong> {item.notes}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef3f8', textAlign: 'right', color: '#182538', fontWeight: 600 }}>{item.pricing.quantity}</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef3f8', textAlign: 'right', color: '#182538', fontWeight: 600 }}>{fmt(item.pricing.unitPrice)}</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef3f8', textAlign: 'right', color: '#182538', fontWeight: 600 }}>{fmt(item.pricing.grossAmount)}</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef3f8', textAlign: 'right', color: '#53657d', fontWeight: 600 }}>{item.pricing.discountPerQtyLabel}</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef3f8', textAlign: 'right', color: item.pricing.totalDiscount ? '#166534' : '#6b7fa3', fontWeight: 600 }}>{item.pricing.totalDiscount ? `-${fmt(item.pricing.totalDiscount)}` : '—'}</td>
                  <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef3f8', textAlign: 'right', color: '#023c62', fontWeight: 700 }}>{fmt(item.pricing.finalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr minmax(280px, 340px)', gap: 16, alignItems: 'start' }}>
          <div style={{ minHeight: 1 }} />
          <div style={{ borderRadius: 18, overflow: 'hidden', boxShadow: '0 10px 26px rgba(2,60,98,0.08)' }}>
            <div style={{ background: 'linear-gradient(135deg, #023c62 0%, #0d537e 100%)', padding: '14px 18px', color: '#fff', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 12 }}>
              Estimate Summary
            </div>
            <div style={{ border: '1px solid #dce8f0', borderTop: 'none', background: '#fbfdff', padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#53657d', marginBottom: 10 }}>
                <span>Gross Service Value</span>
                <strong style={{ color: '#182538' }}>{fmt(pricing.grossServiceValue)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#53657d', marginBottom: 10 }}>
                <span>Service-Level Discounts</span>
                <strong style={{ color: pricing.serviceDiscountTotal ? '#166534' : '#182538' }}>{pricing.serviceDiscountTotal ? `-${fmt(pricing.serviceDiscountTotal)}` : '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#53657d', marginBottom: 10 }}>
                <span>Net After Service Discount</span>
                <strong style={{ color: '#182538' }}>{fmt(pricing.netServiceValue)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#53657d', marginBottom: 10 }}>
                <span>Bill Discount</span>
                <strong style={{ color: pricing.billDiscount ? '#166534' : '#182538' }}>{pricing.billDiscount ? `-${fmt(pricing.billDiscount)}` : '—'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 12, borderTop: '1px solid #dce8f0', fontSize: 18, fontWeight: 800, color: '#023c62' }}>
                <span>Total Estimate</span>
                <span>{fmt(pricing.finalTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {quotation.notes && (
          <div style={{ marginTop: 18, border: '1px solid #dce8f0', borderRadius: 18, padding: '16px 18px', background: 'linear-gradient(180deg, #fbfdff 0%, #f6fafc 100%)' }}>
            <div style={{ fontSize: 11, color: '#7d91a7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Service Notes</div>
            <div style={{ fontSize: 13, color: '#1f2c3c', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{quotation.notes}</div>
          </div>
        )}

        <div style={{ marginTop: 28, padding: '16px 18px 0', borderTop: '1px dashed #d2dce6', fontSize: 11, color: '#8194a8', textAlign: 'center' }}>
          <img src={brandBlueLogo} alt="Hangers" style={{ width: 104, height: 26, objectFit: 'contain', display: 'block', margin: '0 auto 10px' }} />
          This quotation is an estimate and may change if garment count, dimensions, fabric condition, or service requirements differ at inspection.
        </div>
        </div>
      </div>
    </div>
  )
}

export default function QuotationPrintPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#6b7fa3', fontFamily: 'var(--crm-font-ui)' }}>Loading quotation preview...</div>}>
      <QuotationPrintPageContent />
    </Suspense>
  )
}
