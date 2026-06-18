'use client'
// ─────────────────────────────────────────────────────────────────────────────
// PRINT CENTER — v3
//   ✅ Portrait orientation, one tag per page
//   ✅ Custom taffeta label size (presets + custom mm)
//   ✅ Field toggles — tick/untick exactly what prints on each tag
//   ✅ QR codes offline via qrcode npm package
//   ✅ window.open() isolated — sidebar never prints
// ─────────────────────────────────────────────────────────────────────────────
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { ordersAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { Check, FileText, Printer, Receipt, ScrollText, Tag } from 'lucide-react'
import { LOGO_BLUE_URL } from '@/lib/branding'

type PrintType = 'garment' | 'bag' | 'receipt' | 'thermal'

interface LabelSize { w: number; h: number }   // in mm
interface TagFields {
  shopName:     boolean
  orderNumber:  boolean
  itemName:     boolean
  category:     boolean
  quantity:     boolean
  price:        boolean
  customerName: boolean
  customerPhone:boolean
  tagIndex:     boolean
  notes:        boolean
  qrCode:       boolean
}

const SIZE_PRESETS = [
  { label: 'Small  25×40mm',  w: 25,  h: 40  },
  { label: 'Medium 40×60mm',  w: 40,  h: 60  },
  { label: 'Large  50×80mm',  w: 50,  h: 80  },
  { label: 'Wide   60×40mm',  w: 60,  h: 40  },
  { label: 'Custom',          w: 0,   h: 0   },
]

const DEFAULT_FIELDS: TagFields = {
  shopName:     true,
  orderNumber:  true,
  itemName:     true,
  category:     true,
  quantity:     true,
  price:        false,
  customerName: true,
  customerPhone:false,
  tagIndex:     true,
  notes:        true,
  qrCode:       true,
}

const FIELD_LABELS: Record<keyof TagFields, string> = {
  shopName:     'Brand logo',
  orderNumber:  'Order number',
  itemName:     'Item / service name',
  category:     'Category (Dry Clean, Ironing…)',
  quantity:     'Quantity',
  price:        'Unit price',
  customerName: 'Customer name',
  customerPhone:'Customer phone number',
  tagIndex:     'Tag number (Tag 1/5)',
  notes:        'Order notes / instructions',
  qrCode:       'QR code',
}

async function makeQR(text: string, size = 80): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size, margin: 1,
    color: { dark: '#023c62', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
}

async function buildPrintHTML(
  order: any,
  type: PrintType,
  bagTotal: number,
  size: LabelSize,
  fields: TagFields
): Promise<string> {
  const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const fmtDate = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
  const rupee   = (v: number) => `₹${(v || 0).toLocaleString('en-IN')}`
  const custName  = order.customer?.name  || ''
  const custPhone = order.customer?.phone ? `+91 ${order.customer.phone}` : ''

  // ── QR size: scale relative to label height, max 40% of width ────────────
  const qrMm  = Math.min(Math.floor(size.w * 0.38), Math.floor(size.h * 0.55), 30)
  const qrPx  = qrMm * 3.78  // 1mm ≈ 3.78px at 96dpi

  // ── Font sizes scale with label ───────────────────────────────────────────
  const fShopName  = Math.max(6,  Math.min(9,  Math.floor(size.w / 8)))
  const fOrderNum  = Math.max(7,  Math.min(11, Math.floor(size.w / 6)))
  const fItemName  = Math.max(8,  Math.min(13, Math.floor(size.w / 5)))
  const fSmall     = Math.max(6,  Math.min(9,  Math.floor(size.w / 8)))
  const padding    = Math.max(3,  Math.min(8,  Math.floor(size.w / 10)))

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Space+Mono:wght@400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; font-family: 'Inter', sans-serif; }

    /* Each tag fills one page exactly */
    @page {
      size: ${size.w}mm ${size.h}mm portrait;
      margin: 0;
    }
    .tag-page {
      width:  ${size.w}mm;
      height: ${size.h}mm;
      padding: ${padding}px;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      overflow: hidden;
    }
    .tag-page:last-child { page-break-after: auto; }

    .tag-border {
      width: 100%; height: 100%;
      border: 1px solid #023c62;
      border-radius: 2px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .tag-header {
      background: #023c62;
      text-align: center;
      padding: 4px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: ${Math.max(18, fShopName * 2)}px;
    }
    .tag-header img {
      max-width: 72%;
      max-height: ${Math.max(12, fShopName * 2)}px;
      object-fit: contain;
      display: block;
    }
    .tag-body {
      flex: 1; display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: ${padding}px;
      gap: ${Math.max(3, padding - 2)}px;
      overflow: hidden;
    }
    .tag-info  { flex: 1; overflow: hidden; }
    .f-num     { font-family: 'Space Mono', monospace; font-weight: 700; font-size: ${fOrderNum}px; color: #023c62; }
    .f-item    { font-family: 'Space Grotesk', sans-serif; font-size: ${fItemName}px; font-weight: 700; color: #000; margin: 2px 0 1px; line-height: 1.2; letter-spacing: -0.02em; }
    .f-small   { font-size: ${fSmall}px; color: #444; line-height: 1.5; }
    .f-note    { font-size: ${fSmall}px; color: #777; font-style: italic; margin-top: 2px; }
    .tag-qr    { width: ${qrPx}px; height: ${qrPx}px; flex-shrink: 0; }
    .tag-footer {
      display: flex; justify-content: space-between;
      font-size: ${fSmall}px; color: #777;
      padding: 2px ${padding}px ${padding}px;
      border-top: 1px dashed #ccc; flex-shrink: 0;
    }
    .bag-big   { font-family: 'Space Grotesk', sans-serif; font-size: ${fItemName + 2}px; font-weight: 800; color: #023c62; margin: 3px 0 1px; letter-spacing: -0.02em; }

    /* Receipt uses A4 */
    .receipt-page { padding: 12mm; }
    @media print {
      .receipt-page { padding: 8mm; }
    }
    .r-header   { text-align: center; border-bottom: 2px solid #023c62; padding-bottom: 10px; margin-bottom: 12px; }
    .r-logo-wrap { display:flex; justify-content:center; margin-bottom:8px; }
    .r-logo { max-width: 240px; max-height: 74px; object-fit: contain; display:block; }
    .r-title    { font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 800; color: #023c62; letter-spacing: -0.02em; }
    .r-sub      { font-size: 11px; color: #666; margin-top: 3px; }
    table       { width: 100%; border-collapse: collapse; font-size: 12px; }
    th          { background: #f0f4f8; padding: 6px 10px; text-align: left; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 11px; letter-spacing: 0.01em; }
    td          { padding: 6px 10px; border-bottom: 1px dashed #e0e0e0; }
    .t-row      { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px; }
    .grand      { font-family: 'Space Grotesk', sans-serif; font-weight: 800; font-size: 16px; color: #023c62; letter-spacing: -0.02em; }
    .pay-badge  { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .PAID       { background: #d1fae5; color: #065f46; }
    .UNPAID     { background: #fee2e2; color: #991b1b; }
    .PARTIAL    { background: #fef3c7; color: #92400e; }
    .r-footer   { border-top: 1px dashed #ccc; margin-top: 14px; padding-top: 8px; font-size: 10px; color: #888; text-align: center; }

    /* 80mm thermal receipt */
    @page thermal {
      size: 80mm auto;
      margin: 0;
    }
    .thermal-page {
      width: 80mm;
      padding: 7mm 5mm 8mm;
      font-family: 'Manrope', sans-serif;
      color: #111827;
      page: thermal;
    }
    .thermal-logo-wrap {
      display:flex;
      justify-content:center;
      margin-bottom: 5mm;
    }
    .thermal-logo {
      max-width: 42mm;
      max-height: 14mm;
      object-fit: contain;
      display:block;
    }
    .thermal-center { text-align:center; }
    .thermal-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 2mm;
    }
    .thermal-meta, .thermal-muted {
      font-size: 10px;
      color: #4b5563;
      line-height: 1.45;
    }
    .thermal-divider {
      border-top: 1px dashed #9ca3af;
      margin: 4mm 0 3mm;
    }
    .thermal-row {
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:8px;
      font-size: 11px;
      line-height: 1.45;
      margin-bottom: 2mm;
    }
    .thermal-item-row {
      display:grid;
      grid-template-columns: 1fr auto;
      gap:8px;
      padding: 2.5mm 0;
      border-bottom: 1px dashed #e5e7eb;
    }
    .thermal-item-name {
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 1mm;
    }
    .thermal-item-meta {
      font-size: 10px;
      color:#6b7280;
    }
    .thermal-amount {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .thermal-total {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 14px;
      font-weight: 800;
      color: #023c62;
    }
    .thermal-status {
      display:inline-block;
      padding: 1.5mm 3mm;
      border-radius: 99px;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
  `

  let body = ''

  // ── GARMENT TAGS ──────────────────────────────────────────────────────────
  if (type === 'garment') {
    const tags = await Promise.all(
      (order.items || []).map(async (item: any, i: number) => {
        const qrData = fields.qrCode ? await makeQR(`${order.orderNumber}-${i + 1}`, Math.round(qrPx)) : null
        return `
        <div class="tag-page">
          <div class="tag-border">
        ${fields.shopName ? `<div class="tag-header"><img src="${LOGO_BLUE_URL}" alt="Hangers logo" /></div>` : ''}
            <div class="tag-body">
              <div class="tag-info">
                ${fields.orderNumber  ? `<div class="f-num">${order.orderNumber}</div>`                          : ''}
                ${fields.itemName     ? `<div class="f-item">${item.serviceName}</div>`                          : ''}
                ${fields.category     ? `<div class="f-small">${item.garmentType || ''}</div>`                  : ''}
                ${fields.quantity     ? `<div class="f-small">Qty: ${item.quantity}</div>`                      : ''}
                ${fields.price        ? `<div class="f-small">₹${item.unitPrice} each</div>`                    : ''}
                ${fields.customerName ? `<div class="f-small">${custName}</div>`                                : ''}
                ${fields.customerPhone? `<div class="f-small">${custPhone}</div>`                               : ''}
                ${fields.notes && order.notes ? `<div class="f-note">${order.notes}</div>`                      : ''}
              </div>
              ${fields.qrCode && qrData ? `<img class="tag-qr" src="${qrData}" alt="QR"/>` : ''}
            </div>
            ${fields.tagIndex ? `
            <div class="tag-footer">
              <span>${custName || custPhone}</span>
              <span>Tag ${i + 1}/${order.items.length}</span>
            </div>` : ''}
          </div>
        </div>`
      })
    )
    body = tags.join('')
  }

  // ── BAG TAGS ──────────────────────────────────────────────────────────────
  if (type === 'bag') {
    const tags = await Promise.all(
      Array.from({ length: bagTotal }, async (_, i) => {
        const qrData = fields.qrCode ? await makeQR(`${order.orderNumber}-BAG-${i + 1}`, Math.round(qrPx)) : null
        return `
        <div class="tag-page">
          <div class="tag-border">
            ${fields.shopName ? `<div class="tag-header"><img src="${LOGO_BLUE_URL}" alt="Hangers logo" /></div>` : ''}
            <div class="tag-body">
              <div class="tag-info">
                ${fields.orderNumber  ? `<div class="f-num">${order.orderNumber}</div>`                          : ''}
                ${fields.customerName ? `<div class="f-item">${custName || 'Customer'}</div>`                   : ''}
                ${fields.customerPhone? `<div class="f-small">${custPhone}</div>`                               : ''}
                <div class="bag-big">BAG ${i + 1} of ${bagTotal}</div>
                ${(order.items||[]).length > 0 ? `<div class="f-small">${order.items.length} garment${order.items.length !== 1 ? 's' : ''}</div>` : ''}
              </div>
              ${fields.qrCode && qrData ? `<img class="tag-qr" src="${qrData}" alt="QR"/>` : ''}
            </div>
            <div class="tag-footer">
              <span>+91 7977417014</span>
              <span>Care in Every Clean</span>
            </div>
          </div>
        </div>`
      })
    )
    body = tags.join('')
  }

  // ── CUSTOMER RECEIPT ──────────────────────────────────────────────────────
  if (type === 'receipt') {
    const items     = order.items || []
    const payStatus = order.paymentStatus || 'UNPAID'
    const balance   = (order.totalAmount || 0) - (order.paidAmount || 0)
    const qrData    = await makeQR(order.orderNumber, 80)
    body = `
    <div class="receipt-page">
      <div class="r-header">
        <div class="r-logo-wrap"><img class="r-logo" src="${LOGO_BLUE_URL}" alt="Hangers logo" /></div>
        <div class="r-sub">Care in Every Clean &nbsp;·&nbsp; +91 7977417014</div>
      </div>
      <table style="margin-bottom:12px">
        <tr>
          <td style="color:#888;width:75px;font-size:11px">Order No.</td>
          <td><strong style="font-family:'Space Mono',monospace;font-size:13px">${order.orderNumber}</strong></td>
          <td style="color:#888;width:50px;font-size:11px">Date</td>
          <td style="font-size:12px">${fmtDate(order.createdAt)}</td>
        </tr>
        <tr>
          <td style="color:#888;font-size:11px">Customer</td>
          <td colspan="3" style="font-size:12px">${custName || '—'} &nbsp; ${custPhone}</td>
        </tr>
      </table>
      <table>
        <thead>
          <tr>
            <th>Item / Service</th>
            <th style="text-align:center;width:36px">Qty</th>
            <th style="text-align:right;width:58px">Rate</th>
            <th style="text-align:right;width:68px">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it: any) => `
          <tr>
            <td>${it.serviceName}</td>
            <td style="text-align:center">${it.quantity}</td>
            <td style="text-align:right">${rupee(it.unitPrice)}</td>
            <td style="text-align:right">${rupee(it.subtotal ?? it.unitPrice * it.quantity)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:12px;border-top:1.5px solid #023c62;padding-top:10px">
        <div class="t-row"><span style="color:#888">Subtotal</span><span>${rupee(order.subtotal)}</span></div>
        ${order.discount > 0 ? `<div class="t-row" style="color:#16a34a"><span>Discount</span><span>− ${rupee(order.discount)}</span></div>` : ''}
        <div class="t-row grand"><span>TOTAL</span><span>${rupee(order.totalAmount)}</span></div>
        <div style="margin-top:8px;font-size:13px">
          Payment: <span class="pay-badge ${payStatus}">${payStatus}</span>
          ${order.paidAmount > 0 ? `&nbsp;&nbsp;Paid: <strong>${rupee(order.paidAmount)}</strong>` : ''}
          ${balance > 0 && payStatus !== 'PAID' ? `&nbsp;&nbsp;Balance due: <strong>${rupee(balance)}</strong>` : ''}
        </div>
      </div>
      <div style="text-align:center;margin-top:14px">
        <img src="${qrData}" width="64" height="64" alt="QR"/>
        <div style="font-size:10px;color:#888;margin-top:3px">Scan to track your order</div>
      </div>
      <div class="r-footer">
        Thank you for choosing us! &nbsp; Ready in 48–72 hrs &nbsp;·&nbsp; Retain this receipt.
      </div>
    </div>`
  }

  if (type === 'thermal') {
    const items = order.items || []
    const payStatus = order.paymentStatus || 'UNPAID'
    const balance = (order.totalAmount || 0) - (order.paidAmount || 0)
    body = `
    <div class="thermal-page">
      <div class="thermal-logo-wrap"><img class="thermal-logo" src="${LOGO_BLUE_URL}" alt="Hangers logo" /></div>
      <div class="thermal-center">
        <div class="thermal-title">Customer Copy</div>
        <div class="thermal-meta">Care in Every Clean</div>
        <div class="thermal-meta">+91 7977417014</div>
      </div>
      <div class="thermal-divider"></div>
      <div class="thermal-row"><span>Order No.</span><strong style="font-family:'Space Mono',monospace">${order.orderNumber}</strong></div>
      <div class="thermal-row"><span>Date</span><span>${fmtDate(order.createdAt)}</span></div>
      <div class="thermal-row"><span>Customer</span><span style="text-align:right">${custName || '—'}${custPhone ? `<br/>${custPhone}` : ''}</span></div>
      <div class="thermal-divider"></div>
      ${items.map((it: any) => `
        <div class="thermal-item-row">
          <div>
            <div class="thermal-item-name">${it.serviceName}</div>
            <div class="thermal-item-meta">${it.quantity} × ${rupee(it.unitPrice)}</div>
          </div>
          <div class="thermal-amount">${rupee(it.subtotal ?? it.unitPrice * it.quantity)}</div>
        </div>
      `).join('')}
      <div class="thermal-divider"></div>
      <div class="thermal-row"><span>Subtotal</span><span>${rupee(order.subtotal || order.totalAmount || 0)}</span></div>
      ${order.discount > 0 ? `<div class="thermal-row" style="color:#166534"><span>Discount</span><span>- ${rupee(order.discount)}</span></div>` : ''}
      <div class="thermal-row thermal-total"><span>Total</span><span>${rupee(order.totalAmount || 0)}</span></div>
      <div class="thermal-row"><span>Status</span><span class="thermal-status ${payStatus}" style="background:${payStatus === 'PAID' ? '#dcfce7' : payStatus === 'PARTIAL' ? '#fef3c7' : '#fee2e2'};color:${payStatus === 'PAID' ? '#166534' : payStatus === 'PARTIAL' ? '#92400e' : '#991b1b'}">${payStatus}</span></div>
      ${order.paidAmount > 0 ? `<div class="thermal-row"><span>Paid</span><span>${rupee(order.paidAmount)}</span></div>` : ''}
      ${balance > 0 && payStatus !== 'PAID' ? `<div class="thermal-row"><span>Balance</span><span>${rupee(balance)}</span></div>` : ''}
      ${order.notes ? `<div class="thermal-divider"></div><div class="thermal-muted"><strong>Notes:</strong> ${order.notes}</div>` : ''}
      <div class="thermal-divider"></div>
      <div class="thermal-center thermal-muted">
        Retain this slip for pickup and delivery queries.
      </div>
    </div>`
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Hangers Print — ${order.orderNumber}</title>
  <style>${css}</style>
</head>
<body>${body}</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────────────────
function PrintCenterPageContent() {
  const searchParams = useSearchParams()
  const [orderNum,    setOrderNum]    = useState('')
  const [order,       setOrder]       = useState<any>(null)
  const [loading,     setLoading]     = useState(false)
  const [printing,    setPrinting]    = useState(false)
  const [type,        setType]        = useState<PrintType>('garment')
  const [bagTotal,    setBagTotal]    = useState(1)
  const [sizePreset,  setSizePreset]  = useState(1)         // index into SIZE_PRESETS (default Medium)
  const [customSize,  setCustomSize]  = useState<LabelSize>({ w: 40, h: 60 })
  const [fields,      setFields]      = useState<TagFields>({ ...DEFAULT_FIELDS })
  const [fieldsOpen,  setFieldsOpen]  = useState(false)

  useEffect(() => {
    const orderId = searchParams.get('orderId')
    const queryType = searchParams.get('type')
    if (queryType === 'garment' || queryType === 'bag' || queryType === 'receipt' || queryType === 'thermal') {
      setType(queryType)
    }
    if (!orderId) return
    setLoading(true)
    ordersAPI.get(orderId)
      .then((detail: any) => {
        const loaded = detail.data?.order || detail.data
        setOrder(loaded)
        setOrderNum(loaded?.orderNumber || '')
      })
      .catch(() => toast.error('Could not load print order'))
      .finally(() => setLoading(false))
  }, [searchParams])

  const labelSize: LabelSize = sizePreset === SIZE_PRESETS.length - 1
    ? customSize
    : { w: SIZE_PRESETS[sizePreset].w, h: SIZE_PRESETS[sizePreset].h }

  const toggleField = (k: keyof TagFields) =>
    setFields(prev => ({ ...prev, [k]: !prev[k] }))

  const findOrder = async () => {
    if (!orderNum.trim()) { toast.error('Enter an order number'); return }
    setLoading(true)
    try {
      const r: any    = await ordersAPI.list({ search: orderNum.trim(), limit: 1 })
      const found     = r.data?.orders?.[0]
      if (!found)     { toast.error('Order not found'); setOrder(null); return }
      const detail: any = await ordersAPI.get(found.id)
      setOrder(detail.data?.order || detail.data)
      toast.success('Order loaded!')
    } catch { toast.error('Could not find order') }
    finally { setLoading(false) }
  }

  const doPrint = async () => {
    if (!order) return
    setPrinting(true)
    try {
      const html = await buildPrintHTML(order, type, bagTotal, labelSize, fields)
      const win  = window.open('', '_blank', 'width=720,height=600,menubar=no,toolbar=no')
      if (!win) { toast.error('Pop-up blocked — allow pop-ups for localhost'); return }
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => { win.print(); setPrinting(false) }, 350)
    } catch {
      toast.error('Failed to generate print preview')
      setPrinting(false)
    }
  }

  const S = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`
  const isTagType = type === 'garment' || type === 'bag'
  const enabledFieldCount = Object.values(fields).filter(Boolean).length

  // ── Shared card style ──
  const card = (extra?: any) => ({ background: '#fff', borderRadius: 16, padding: 22, border: '1px solid #e8f0f7', marginBottom: 20, ...extra })

  return (
    <div style={{ padding: '32px 36px', maxWidth: 920, margin: '0 auto', fontFamily: "var(--crm-font-ui)" }}>

      {/* Title */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 28, color: '#023c62', margin: '0 0 4px', display:'flex', alignItems:'center', gap:10 }}><Printer size={28} />Print Center</h1>
        <p style={{ fontSize: 14, color: '#6b7fa3', margin: 0 }}>Portrait labels · Custom taffeta size · Choose exactly what prints on each tag</p>
      </div>

      {/* Search */}
      <div style={card()}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7fa3', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10 }}>Find Order</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={orderNum} onChange={e => setOrderNum(e.target.value)} onKeyDown={e => e.key === 'Enter' && findOrder()}
            placeholder="Order number, e.g. HNG2403001"
            style={{ flex: 1, border: '1.5px solid #dce8f0', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none' }} />
          <button onClick={findOrder} disabled={loading}
            style={{ background: '#023c62', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            {loading ? 'Finding…' : 'Find'}
          </button>
        </div>
      </div>

      {order && (<>

        {/* Order found */}
        <div style={{ background: '#e8f7ef', borderRadius: 14, padding: '14px 18px', border: '1px solid #86efac', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: '#023c62' }}>{order.orderNumber}</span>
            <span style={{ color: '#9dafc8' }}>·</span>
            <span style={{ fontWeight: 500 }}>{order.customer?.name || `+91 ${order.customer?.phone}`}</span>
            <span style={{ color: '#9dafc8' }}>·</span>
            <span style={{ color: '#6b7fa3' }}>{order.items?.length || 0} items · {S(order.totalAmount)}</span>
          </div>
          <span style={{ color: '#22c55e', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:6 }}><Check size={14} />Loaded</span>
        </div>

        {/* Print type */}
        <div style={card()}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7fa3', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 14 }}>What to Print</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[
              { k: 'garment', icon: <Tag size={26} />, label: 'Garment Tags',    desc: `${order.items?.length || 0} tags · 1 per page` },
              { k: 'bag',     icon: <FileText size={26} />, label: 'Bag Tags',         desc: 'One per bag · 1 per page'                      },
              { k: 'receipt', icon: <Receipt size={26} />, label: 'Customer Receipt', desc: 'Full A4 receipt with totals'                    },
              { k: 'thermal', icon: <ScrollText size={26} />, label: '80mm Thermal', desc: 'Counter thermal receipt format'                 },
            ].map(t => (
              <button key={t.k} onClick={() => setType(t.k as PrintType)}
                style={{ padding: 18, borderRadius: 14, border: `2px solid ${type === t.k ? '#023c62' : '#dce8f0'}`, background: type === t.k ? '#f0f5fa' : '#fff', textAlign: 'left' as const, cursor: 'pointer' }}>
                <div style={{ marginBottom: 8, color:'#023c62' }}>{t.icon}</div>
                <div style={{ fontWeight: 700, color: '#023c62', fontSize: 14, marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: '#6b7fa3' }}>{t.desc}</div>
              </button>
            ))}
          </div>
          {type === 'bag' && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 13, color: '#6b7fa3', fontWeight: 500 }}>Number of bags:</label>
              <input type="number" value={bagTotal} min={1} max={20} onChange={e => setBagTotal(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 70, border: '1.5px solid #dce8f0', borderRadius: 8, padding: '7px 10px', fontSize: 14, textAlign: 'center' as const, outline: 'none' }} />
            </div>
          )}
        </div>

        {/* Label size — only for tags */}
        {isTagType && (
          <div style={card()}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7fa3', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 14 }}>
              Label Size <span style={{ color: '#9dafc8', textTransform: 'none' as const, fontWeight: 400 }}>— choose your taffeta label dimensions</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: sizePreset === SIZE_PRESETS.length - 1 ? 14 : 0 }}>
              {SIZE_PRESETS.map((p, i) => (
                <button key={i} onClick={() => setSizePreset(i)}
                  style={{ padding: '8px 16px', borderRadius: 20, border: `1.5px solid ${sizePreset === i ? '#023c62' : '#dce8f0'}`, background: sizePreset === i ? '#023c62' : '#fff', color: sizePreset === i ? '#fff' : '#6b7fa3', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {p.label}
                </button>
              ))}
            </div>
            {sizePreset === SIZE_PRESETS.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <label style={{ fontSize: 13, color: '#6b7fa3' }}>Width (mm):</label>
                <input type="number" value={customSize.w} min={15} max={200} onChange={e => setCustomSize(prev => ({ ...prev, w: parseInt(e.target.value) || prev.w }))}
                  style={{ width: 70, border: '1.5px solid #dce8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, textAlign: 'center' as const, outline: 'none' }} />
                <label style={{ fontSize: 13, color: '#6b7fa3' }}>Height (mm):</label>
                <input type="number" value={customSize.h} min={15} max={300} onChange={e => setCustomSize(prev => ({ ...prev, h: parseInt(e.target.value) || prev.h }))}
                  style={{ width: 70, border: '1.5px solid #dce8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, textAlign: 'center' as const, outline: 'none' }} />
                <span style={{ fontSize: 12, color: '#9dafc8' }}>= {labelSize.w}×{labelSize.h}mm</span>
              </div>
            )}
            {sizePreset !== SIZE_PRESETS.length - 1 && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#9dafc8' }}>
                Selected: <strong style={{ color: '#023c62' }}>{labelSize.w}mm wide × {labelSize.h}mm tall</strong> · Portrait · 1 tag per page
              </div>
            )}
          </div>
        )}

        {/* Tag field toggles — only for tags */}
        {isTagType && (
          <div style={card()}>
            <button onClick={() => setFieldsOpen(v => !v)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7fa3', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                  Tag Fields
                </span>
                <span style={{ fontSize: 12, color: '#9dafc8', marginLeft: 10 }}>
                  {enabledFieldCount} of {Object.keys(fields).length} fields enabled
                </span>
              </div>
              <span style={{ fontSize: 13, color: '#6b7fa3' }}>{fieldsOpen ? '▲ Hide' : '▼ Customise'}</span>
            </button>

            {fieldsOpen && (
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                {(Object.keys(fields) as (keyof TagFields)[]).map(key => (
                  <label key={key} onClick={() => toggleField(key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${fields[key] ? '#023c62' : '#e8f0f7'}`, background: fields[key] ? '#f0f5fa' : '#fafbfc', cursor: 'pointer', userSelect: 'none' as const }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${fields[key] ? '#023c62' : '#dce8f0'}`, background: fields[key] ? '#023c62' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {fields[key] && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1, display:'inline-flex' }}><Check size={11} /></span>}
                    </div>
                    <span style={{ fontSize: 12, color: fields[key] ? '#023c62' : '#6b7fa3', fontWeight: fields[key] ? 600 : 400 }}>
                      {FIELD_LABELS[key]}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {!fieldsOpen && (
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {(Object.keys(fields) as (keyof TagFields)[]).filter(k => fields[k]).map(k => (
                  <span key={k} style={{ fontSize: 11, background: '#e8f0f7', color: '#023c62', borderRadius: 20, padding: '3px 10px', fontWeight: 500 }}>
                    {FIELD_LABELS[k].split(' (')[0]}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary + Print button */}
        <div style={{ background: '#f7f9fc', borderRadius: 12, padding: '13px 16px', border: '1px solid #e8f0f7', marginBottom: 20, fontSize: 13, color: '#6b7fa3', lineHeight: 1.8 }}>
          {type === 'garment' && <span>Will print <strong style={{ color: '#023c62' }}>{order.items?.length || 0} garment tags</strong> — one per page, {labelSize.w}×{labelSize.h}mm portrait, {enabledFieldCount} fields</span>}
          {type === 'bag'     && <span>Will print <strong style={{ color: '#023c62' }}>{bagTotal} bag tags</strong> — one per page, {labelSize.w}×{labelSize.h}mm portrait</span>}
          {type === 'receipt' && <span>Will print <strong style={{ color: '#023c62' }}>1 customer receipt</strong> — {order.items?.length || 0} items · Total {S(order.totalAmount)}</span>}
          <span style={{ display: 'block', fontSize: 11, color: '#b8d0e8', marginTop: 2 }}>
            QR codes generated offline · Allow pop-ups for localhost if prompted
          </span>
        </div>

        <button onClick={doPrint} disabled={printing}
          style={{ background: printing ? '#6b7fa3' : '#023c62', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 40px', fontWeight: 700, cursor: printing ? 'wait' : 'pointer', fontSize: 16, fontFamily: "var(--crm-font-ui)" }}>
          {printing ? 'Generating…' : 'Open Print Window'}
        </button>

      </>)}

      {!order && !loading && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 52, border: '1px solid #e8f0f7', textAlign: 'center' as const, color: '#9dafc8' }}>
          <div style={{ marginBottom: 14, display:'flex', justifyContent:'center', color:'#9dafc8' }}><Printer size={52} /></div>
          <div style={{ fontSize: 15, color: '#6b7fa3', fontWeight: 600, marginBottom: 6 }}>Enter an order number above</div>
          <div style={{ fontSize: 13 }}>e.g. HNG2403001 — press Enter or click Find</div>
        </div>
      )}
    </div>
  )
}

function PrintCenterPageFallback() {
  return (
    <div style={{ padding: '32px 36px', maxWidth: 920, margin: '0 auto', fontFamily: "var(--crm-font-ui)" }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e8f0f7', color: '#6b7fa3' }}>
        Loading print center...
      </div>
    </div>
  )
}

export default function PrintCenterPage() {
  return (
    <Suspense fallback={<PrintCenterPageFallback />}>
      <PrintCenterPageContent />
    </Suspense>
  )
}
