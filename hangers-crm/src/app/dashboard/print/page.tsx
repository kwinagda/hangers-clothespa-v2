'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { ordersAPI, settingsAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { Check, FileText, Printer, Receipt, ScrollText, Tag } from 'lucide-react'
import { LOGO_BLUE_URL } from '@/lib/branding'

type PrintType = 'garment' | 'bag' | 'receipt' | 'thermal'
type FieldState = Record<string, boolean>

interface LabelSize { w: number; h: number }
type PrintFieldConfig = Record<string, { label: string; enabled: boolean }>
type PrintTypeConfig = {
  title: string
  description?: string
  size?: LabelSize
  width?: number
  presets?: Array<{ label: string; w: number; h: number }>
  fields: PrintFieldConfig
}
type PrintLayoutSettings = Record<PrintType, PrintTypeConfig>
type PaymentQrSettings = {
  enabled?: boolean
  provider?: string
  vpa?: string
  payeeName?: string
  currency?: string
}
const PRINT_LAYOUT_SETTING_KEY = 'print_layout_settings'
const PAYMENT_QR_SETTING_KEY = 'payment_qr_settings'
const PRINT_TYPES: Array<{ k: PrintType; icon: ReactNode }> = [
  { k: 'garment', icon: <Tag size={24} /> },
  { k: 'bag', icon: <FileText size={24} /> },
  { k: 'receipt', icon: <Receipt size={24} /> },
  { k: 'thermal', icon: <ScrollText size={24} /> },
]

const STORE_PHONE = '+91 7977417014'
const STORE_LINE = 'Hangers Clothes Spa'
const STORE_NOTE = 'Thank you for your visit. Have a nice day.'

async function makeQR(text: string, size = 80): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
}

const escapeHtml = (value: any) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

function buildUpiPayload(order: any, settings?: PaymentQrSettings | null) {
  if (!settings?.enabled || !settings.vpa?.trim()) return ''
  const balance = Math.max(0, Number(order.totalAmount || 0) - Number(order.paidAmount || 0) - Number(order.writeOffAmount || 0))
  const params = new URLSearchParams({
    pa: settings.vpa.trim(),
    pn: settings.payeeName?.trim() || STORE_LINE,
    cu: settings.currency?.trim() || 'INR',
    tn: `Order ${order.orderNumber}`,
  })
  if (balance > 0) params.set('am', balance.toFixed(2))
  return `upi://pay?${params.toString()}`
}

async function buildPrintHTML(
  order: any,
  type: PrintType,
  bagTotal: number,
  size: LabelSize,
  fields: FieldState,
  paymentQrSettings?: PaymentQrSettings | null
): Promise<string> {
  const f = (key: string) => fields[key] !== false
  const items = order.items || []
  const garments = items.flatMap((item: any) => {
    const units = (item.garmentUnits || []).filter((unit: any) => unit.status !== 'VOID')
    if (units.length) return units.map((unit: any) => ({ ...item, quantity: 1, garmentUnit: unit }))
    return Array.from({ length: Number(item.quantity || 1) }, (_, index) => ({ ...item, quantity: 1, fallbackUnitIndex: index + 1 }))
  })
  const customer = order.customer || {}
  const customerName = customer.name || ''
  const customerPhone = customer.phone ? `+91 ${customer.phone}` : ''
  const payStatus = order.paymentStatus || 'UNPAID'
  const balance = Math.max(0, Number(order.totalAmount || 0) - Number(order.paidAmount || 0) - Number(order.writeOffAmount || 0))
  const rupee = (v: number) => `₹${Number(v || 0).toLocaleString('en-IN')}`
  const fmtDate = (value?: string) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const qrPx = Math.max(42, Math.min(82, Math.round(size.w * 2.2)))
  const qr = async (text: string) => makeQR(text, qrPx)

  const pageRule = type === 'receipt'
    ? '@page { size: 148mm 210mm; margin: 7mm; }'
    : type === 'thermal'
      ? '@page { size: 80mm 297mm; margin: 0; }'
      : `@page { size: ${size.w}mm ${size.h}mm portrait; margin: 0; }`
  const bodySizeRule = type === 'receipt'
    ? 'html, body { width: 148mm; min-height: 210mm; }'
    : type === 'thermal'
      ? 'html, body { width: 80mm; min-height: 100mm; }'
      : `html, body { width: ${size.w}mm; min-height: ${size.h}mm; }`

  const tagFont = {
    brand: Math.max(9, Math.min(12, Math.floor(size.w / 3.8))),
    order: Math.max(10, Math.min(14, Math.floor(size.w / 3.4))),
    main: Math.max(8, Math.min(12, Math.floor(size.w / 4.1))),
    small: Math.max(6.5, Math.min(9, Math.floor(size.w / 5.4))),
  }

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
    ${bodySizeRule}
    ${pageRule}
    @media print {
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { page-break-after: always; break-after: page; }
      .page:last-child { page-break-after: auto; break-after: auto; }
    }
    .tag-page {
      width: ${size.w}mm;
      height: ${size.h}mm;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 1.2mm;
    }
    .tag-inner {
      width: 100%;
      max-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 0.65mm;
      overflow: hidden;
    }
    .tag-brand { font-size: ${tagFont.brand}px; line-height: 1; font-weight: 900; }
    .tag-order { font-family: "Courier New", monospace; font-size: ${tagFont.order}px; line-height: 1.02; font-weight: 900; }
    .tag-main { font-size: ${tagFont.main}px; line-height: 1.04; font-weight: 900; max-width: 100%; overflow-wrap: anywhere; }
    .tag-small { font-size: ${tagFont.small}px; line-height: 1.08; font-weight: 800; max-width: 100%; overflow-wrap: anywhere; }
    .tag-note { font-size: ${Math.max(6, tagFont.small - 1)}px; line-height: 1.05; max-width: 100%; overflow-wrap: anywhere; }
    .defects { display: flex; gap: 1mm; flex-wrap: wrap; align-items: center; justify-content: center; max-width: 100%; }
    .defects span { font-size: ${Math.max(5.5, tagFont.small - 1)}px; font-weight: 800; white-space: nowrap; }
    .qr { width: ${qrPx}px; height: ${qrPx}px; object-fit: contain; }

    .receipt-page {
      width: 134mm;
      min-height: 196mm;
      margin: 0 auto;
      font-size: 10.5px;
      line-height: 1.35;
    }
    .receipt-head { text-align: center; border-bottom: 1px solid #111; padding-bottom: 4mm; margin-bottom: 4mm; }
    .receipt-logo { max-width: 48mm; max-height: 16mm; object-fit: contain; display: block; margin: 0 auto 2mm; }
    .receipt-title { font-size: 15px; font-weight: 900; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 5mm; margin-bottom: 4mm; }
    .meta-row { display: flex; justify-content: space-between; gap: 3mm; border-bottom: 1px dashed #ddd; padding-bottom: 1mm; }
    .muted { color: #555; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; border-bottom: 1px solid #111; padding: 1.6mm 1mm; font-size: 9.5px; }
    td { border-bottom: 1px dashed #ddd; padding: 1.7mm 1mm; vertical-align: top; }
    .right { text-align: right; }
    .center { text-align: center; }
    .totals { margin-left: auto; width: 62mm; margin-top: 4mm; }
    .total-line { display: flex; justify-content: space-between; padding: 1mm 0; border-bottom: 1px dashed #ddd; }
    .grand { font-size: 14px; font-weight: 900; border-bottom: 1px solid #111; }
    .receipt-footer { margin-top: 5mm; padding-top: 3mm; border-top: 1px dashed #aaa; text-align: center; font-size: 9px; }

    .thermal-page {
      width: 80mm;
      padding: 4mm 4mm 6mm;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px;
      line-height: 1.35;
    }
    .thermal-center { text-align: center; }
    .thermal-logo { max-width: 42mm; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2mm; }
    .divider { border-top: 1px dashed #111; margin: 2.5mm 0; }
    .row { display: flex; justify-content: space-between; gap: 3mm; margin-bottom: 1mm; }
    .thermal-item { display: grid; grid-template-columns: 6mm 1fr 10mm 14mm 16mm; gap: 1mm; padding: 1.5mm 0; border-bottom: 1px dashed #ddd; align-items: start; }
    .thermal-item.no-si { grid-template-columns: 1fr 10mm 14mm 16mm; }
    .bold { font-weight: 900; }
    .nowrap { white-space: nowrap; }
  `

  let body = ''

  if (type === 'garment') {
    const pages = await Promise.all(garments.map(async (item: any, index: number) => {
      const defectText = [
        f('noDefect') ? 'No defect' : '',
        f('color') ? 'Colour' : '',
        f('damage') ? 'Damage' : '',
        f('stains') ? 'Stains' : '',
        f('upcharge') && Number(item.upcharge || 0) > 0 ? `Upcharge ${rupee(item.upcharge)}` : '',
      ].filter(Boolean)
      const tagNumber = item.garmentUnit?.tagNumber || `${order.orderNumber}-LEGACY-${index + 1}`
      const qrData = f('barcode') ? await qr(tagNumber) : ''
      return `
        <section class="page tag-page">
          <div class="tag-inner">
            ${f('brand') ? `<div class="tag-brand">${escapeHtml(STORE_LINE.replace(' Clothes Spa', ''))}</div>` : ''}
            ${f('orderNumber') ? `<div class="tag-order">${escapeHtml(order.orderNumber)}</div>` : ''}
            ${f('customerName') ? `<div class="tag-small">${escapeHtml(customerName)}</div>` : ''}
            ${f('serviceName') ? `<div class="tag-main">${escapeHtml(item.serviceName)}</div>` : ''}
            ${f('garmentType') ? `<div class="tag-small">${escapeHtml(item.garmentType || '')}</div>` : ''}
            ${f('orderDate') ? `<div class="tag-small">Date ${fmtDate(order.createdAt)}</div>` : ''}
            ${f('deliveryDate') && order.deliveryDate ? `<div class="tag-small">Due ${fmtDate(order.deliveryDate)}</div>` : ''}
            ${f('quantity') ? `<div class="tag-small">Qty ${Number(item.quantity || 1)}</div>` : ''}
            ${f('price') ? `<div class="tag-small">${rupee(item.unitPrice || 0)}</div>` : ''}
            ${f('customerPhone') ? `<div class="tag-small">${escapeHtml(customerPhone)}</div>` : ''}
            ${defectText.length ? `<div class="defects">${defectText.map((entry) => `<span>${escapeHtml(entry)}</span>`).join('')}</div>` : ''}
            ${f('notes') && (item.notes || order.notes) ? `<div class="tag-note">${escapeHtml(item.notes || order.notes)}</div>` : ''}
            ${f('tagIndex') ? `<div class="tag-small">${index + 1}/${garments.length} · ${escapeHtml(tagNumber)}</div>` : ''}
            ${qrData ? `<img class="qr" src="${qrData}" alt="QR" />` : ''}
          </div>
        </section>`
    }))
    body = pages.join('')
  }

  if (type === 'bag') {
    const pages = await Promise.all(Array.from({ length: bagTotal }, async (_, index) => {
      const qrData = f('barcode') ? await qr(`${order.orderNumber}-BAG-${index + 1}`) : ''
      return `
        <section class="page tag-page">
          <div class="tag-inner">
            ${f('orderNumber') ? `<div class="tag-order">${escapeHtml(order.orderNumber)}</div>` : ''}
            ${f('customerName') ? `<div class="tag-main">${escapeHtml(customerName || 'Customer')}</div>` : ''}
            ${f('customerPhone') ? `<div class="tag-small">${escapeHtml(customerPhone)}</div>` : ''}
            ${f('bagIndex') ? `<div class="tag-main">BAG ${index + 1}/${bagTotal}</div>` : ''}
            ${f('serviceSummary') ? `<div class="tag-small">${garments.length} garment${garments.length === 1 ? '' : 's'}</div>` : ''}
            ${f('deliveryDate') && order.deliveryDate ? `<div class="tag-small">Due ${fmtDate(order.deliveryDate)}</div>` : ''}
            ${f('notes') && order.notes ? `<div class="tag-note">${escapeHtml(order.notes)}</div>` : ''}
            ${qrData ? `<img class="qr" src="${qrData}" alt="QR" />` : ''}
          </div>
        </section>`
    }))
    body = pages.join('')
  }

  if (type === 'receipt') {
    const trackingQrData = f('barcode') ? await qr(order.orderNumber) : ''
    const upiPayload = f('upiQr') ? buildUpiPayload(order, paymentQrSettings) : ''
    const upiQrData = upiPayload ? await qr(upiPayload) : ''
    body = `
      <section class="page receipt-page">
        <div class="receipt-head">
          ${f('logo') ? `<img class="receipt-logo" src="${LOGO_BLUE_URL}" alt="Hangers" />` : `<div class="receipt-title">${STORE_LINE}</div>`}
          ${f('storeAddress') ? `<div class="muted">${STORE_PHONE}</div>` : ''}
        </div>
        <div class="meta-grid">
          <div class="meta-row"><span>Order</span><strong>${escapeHtml(order.orderNumber)}</strong></div>
          <div class="meta-row"><span>Date</span><strong>${fmtDate(order.createdAt)}</strong></div>
          ${f('deliveryDate') ? `<div class="meta-row"><span>Due</span><strong>${fmtDate(order.deliveryDate)}</strong></div>` : ''}
          ${f('paymentStatus') ? `<div class="meta-row"><span>Status</span><strong>${escapeHtml(payStatus)}</strong></div>` : ''}
        </div>
        ${f('customerInfo') ? `<div style="margin-bottom:4mm"><strong>Customer:</strong> ${escapeHtml(customerName || '-')} ${customerPhone ? ` · ${escapeHtml(customerPhone)}` : ''}</div>` : ''}
        ${f('itemTable') ? `
          <table>
            <thead>
              <tr>
                <th>Item / Service</th>
                <th class="center">PCS</th>
                <th class="right">Rate</th>
                <th class="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item: any) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(item.serviceName)}</strong>
                    ${item.garmentType ? `<div class="muted">${escapeHtml(item.garmentType)}</div>` : ''}
                    ${f('itemNotes') && item.notes ? `<div class="muted">${escapeHtml(item.notes)}</div>` : ''}
                  </td>
                  <td class="center">${Number(item.quantity || 1)}</td>
                  <td class="right">${rupee(item.unitPrice || 0)}</td>
                  <td class="right">${rupee(item.subtotal ?? Number(item.quantity || 1) * Number(item.unitPrice || 0))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
        <div class="totals">
          ${f('subtotal') ? `<div class="total-line"><span>Subtotal</span><span>${rupee(order.subtotal || 0)}</span></div>` : ''}
          ${f('discount') && Number(order.discount || 0) > 0 ? `<div class="total-line"><span>Discount</span><span>- ${rupee(order.discount)}</span></div>` : ''}
          ${f('tax') ? `<div class="total-line"><span>Tax</span><span>Inclusive</span></div>` : ''}
          <div class="total-line grand"><span>Total</span><span>${rupee(order.totalAmount || 0)}</span></div>
          ${f('balanceDue') ? `<div class="total-line"><span>Balance</span><span>${rupee(balance)}</span></div>` : ''}
        </div>
        ${f('customNote') && order.notes ? `<div style="margin-top:4mm"><strong>Notes:</strong> ${escapeHtml(order.notes)}</div>` : ''}
        ${trackingQrData ? `<div class="center" style="margin-top:4mm"><img src="${trackingQrData}" width="64" height="64" alt="Tracking QR" /></div>` : ''}
        ${upiQrData ? `<div class="center" style="margin-top:4mm"><img src="${upiQrData}" width="64" height="64" alt="UPI QR" /><div class="muted">Scan to pay</div></div>` : ''}
        ${f('terms') ? `<div class="receipt-footer">Retain this receipt for delivery. Please check garments at delivery.</div>` : ''}
      </section>`
  }

  if (type === 'thermal') {
    const trackingQrData = f('barcode') ? await qr(order.orderNumber) : ''
    const upiPayload = f('upiQr') ? buildUpiPayload(order, paymentQrSettings) : ''
    const upiQrData = upiPayload ? await qr(upiPayload) : ''
    const itemRows = items.map((item: any, index: number) => `
      <div class="thermal-item ${f('itemSerial') ? '' : 'no-si'}">
        ${f('itemSerial') ? `<div>${index + 1}</div>` : ''}
        <div>
          <div class="bold">${escapeHtml(item.serviceName)}</div>
          ${item.garmentType ? `<div class="muted">${escapeHtml(item.garmentType)}</div>` : ''}
          ${f('itemNotes') && item.notes ? `<div class="muted">${escapeHtml(item.notes)}</div>` : ''}
        </div>
        ${f('itemPieces') ? `<div class="right">${Number(item.quantity || 1)}</div>` : '<div></div>'}
        ${f('itemPrice') ? `<div class="right nowrap">${rupee(item.unitPrice || 0)}</div>` : '<div></div>'}
        ${f('itemAmount') ? `<div class="right nowrap">${rupee(item.subtotal ?? Number(item.quantity || 1) * Number(item.unitPrice || 0))}</div>` : '<div></div>'}
      </div>`).join('')
    body = `
      <section class="page thermal-page">
        <div class="thermal-center">
          ${f('logo') ? `<img class="thermal-logo" src="${LOGO_BLUE_URL}" alt="Hangers" />` : `<div class="bold">${STORE_LINE}</div>`}
          ${f('storeAddress') ? `<div>${STORE_PHONE}</div>` : ''}
          ${f('invoiceMessage') ? `<div>Customer Copy</div>` : ''}
        </div>
        <div class="divider"></div>
        ${f('orderNumber') ? `<div class="row"><span>Order</span><strong>${escapeHtml(order.orderNumber)}</strong></div>` : ''}
        ${f('orderDate') ? `<div class="row"><span>Date</span><span>${fmtDate(order.createdAt)}</span></div>` : ''}
        ${f('deliveryDate') ? `<div class="row"><span>Due</span><span>${fmtDate(order.deliveryDate)}</span></div>` : ''}
        ${f('customerInfo') ? `<div class="row"><span>Customer</span><span style="text-align:right">${escapeHtml(customerName || '-')}${customerPhone ? `<br/>${escapeHtml(customerPhone)}` : ''}</span></div>` : ''}
        <div class="divider"></div>
        ${itemRows}
        <div class="divider"></div>
        ${f('subtotal') ? `<div class="row"><span>Subtotal</span><span>${rupee(order.subtotal || order.totalAmount || 0)}</span></div>` : ''}
        ${Number(order.discount || 0) > 0 ? `<div class="row"><span>Discount</span><span>- ${rupee(order.discount)}</span></div>` : ''}
        ${f('tax') ? `<div class="row"><span>Tax</span><span>${f('inclusiveTax') ? 'Inclusive' : '-'}</span></div>` : ''}
        ${f('grandTotal') ? `<div class="row bold"><span>Total</span><span>${rupee(order.totalAmount || 0)}</span></div>` : ''}
        ${f('netPayable') ? `<div class="row bold"><span>Net Payable</span><span>${rupee(balance || order.totalAmount || 0)}</span></div>` : ''}
        ${f('customerNote') && order.notes ? `<div class="divider"></div><div><strong>Notes:</strong> ${escapeHtml(order.notes)}</div>` : ''}
        ${trackingQrData ? `<div class="thermal-center" style="margin-top:3mm"><img src="${trackingQrData}" width="82" height="82" alt="Tracking QR" /></div>` : ''}
        ${upiQrData ? `<div class="thermal-center" style="margin-top:3mm"><img src="${upiQrData}" width="82" height="82" alt="UPI QR" /><div>Scan to pay</div></div>` : ''}
        ${f('visitMessage') ? `<div class="divider"></div><div class="thermal-center">${STORE_NOTE}</div>` : ''}
      </section>`
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Hangers Print - ${escapeHtml(order.orderNumber)}</title><style>${css}</style></head><body>${body}</body></html>`
}

function getInitialFields(config: PrintLayoutSettings | null, type: PrintType): FieldState {
  const fields = config?.[type]?.fields
  if (!fields) return {}
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, !!value.enabled]))
}

function PrintCenterPageContent() {
  const searchParams = useSearchParams()
  const [orderNum, setOrderNum] = useState('')
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [type, setType] = useState<PrintType>('garment')
  const [bagTotal, setBagTotal] = useState(1)
  const [sizePreset, setSizePreset] = useState(0)
  const [printConfig, setPrintConfig] = useState<PrintLayoutSettings | null>(null)
  const [paymentQrSettings, setPaymentQrSettings] = useState<PaymentQrSettings | null>(null)
  const [customSize, setCustomSize] = useState<LabelSize>({ w: 0, h: 0 })
  const [fields, setFields] = useState<FieldState>({})
  const [fieldsOpen, setFieldsOpen] = useState(true)

  const currentConfig = printConfig?.[type]
  const garmentCount = (order?.items || []).reduce((total: number, item: any) => {
    const units = (item.garmentUnits || []).filter((unit: any) => unit.status !== 'VOID')
    return total + (units.length || Number(item.quantity || 1))
  }, 0)
  const presets = type === 'garment' || type === 'bag' ? (currentConfig?.presets || []) : []
  const labelSize = useMemo<LabelSize>(() => {
    if (type !== 'garment' && type !== 'bag') return printConfig?.garment?.size || { w: 0, h: 0 }
    const preset = presets[sizePreset]
    return preset && preset.w && preset.h ? { w: preset.w, h: preset.h } : (customSize.w && customSize.h ? customSize : currentConfig?.size || { w: 0, h: 0 })
  }, [customSize, currentConfig?.size, presets, printConfig?.garment?.size, sizePreset, type])

  useEffect(() => {
    const orderId = searchParams.get('orderId')
    const queryType = searchParams.get('type')
    if (queryType === 'garment' || queryType === 'bag' || queryType === 'receipt' || queryType === 'thermal') {
      setType(queryType)
      setSizePreset(0)
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

  useEffect(() => {
    settingsAPI.getAll()
      .then((response: any) => {
        const dbConfig = response?.data?.map?.[PRINT_LAYOUT_SETTING_KEY] || response?.map?.[PRINT_LAYOUT_SETTING_KEY]
        if (!dbConfig?.garment?.fields || !dbConfig?.bag?.fields || !dbConfig?.receipt?.fields || !dbConfig?.thermal?.fields) {
          throw new Error('Print settings are missing from database')
        }
        setPrintConfig(dbConfig)
        const qrConfig = response?.data?.map?.[PAYMENT_QR_SETTING_KEY] || response?.map?.[PAYMENT_QR_SETTING_KEY] || null
        setPaymentQrSettings(qrConfig)
        const nextType = type
        setFields(getInitialFields(dbConfig, nextType))
        if (nextType === 'garment' || nextType === 'bag') setCustomSize({ ...(dbConfig[nextType].size || { w: 0, h: 0 }) })
      })
      .catch((err: any) => toast.error(err.message || 'Failed to load DB-backed print settings'))
  }, [])

  useEffect(() => {
    if (!printConfig) return
    setFields(getInitialFields(printConfig, type))
    if (type === 'garment' || type === 'bag') setCustomSize({ ...(printConfig[type].size || { w: 0, h: 0 }) })
  }, [printConfig, type])

  const selectType = (nextType: PrintType) => {
    setType(nextType)
    setFields(getInitialFields(printConfig, nextType))
    setSizePreset(0)
    if ((nextType === 'garment' || nextType === 'bag') && printConfig) setCustomSize({ ...(printConfig[nextType].size || { w: 0, h: 0 }) })
  }

  const toggleField = (key: string) => setFields((prev) => ({ ...prev, [key]: !prev[key] }))

  const findOrder = async () => {
    if (!orderNum.trim()) {
      toast.error('Enter an order number')
      return
    }
    setLoading(true)
    try {
      const list: any = await ordersAPI.list({ search: orderNum.trim(), limit: 1 })
      const found = list.data?.orders?.[0]
      if (!found) {
        toast.error('Order not found')
        setOrder(null)
        return
      }
      const detail: any = await ordersAPI.get(found.id)
      setOrder(detail.data?.order || detail.data)
      toast.success('Order loaded')
    } catch {
      toast.error('Could not find order')
    } finally {
      setLoading(false)
    }
  }

  const doPrint = async () => {
    if (!order) return
    if (!printConfig || !currentConfig) {
      toast.error('Print settings are not loaded from database')
      return
    }
    setPrinting(true)
    try {
      if (fields.upiQr && (!paymentQrSettings?.enabled || !paymentQrSettings?.vpa?.trim())) {
        toast.error('UPI QR is enabled for this print type, but payment QR settings are not configured in DB')
        setPrinting(false)
        return
      }
      const html = await buildPrintHTML(order, type, bagTotal, labelSize, fields, paymentQrSettings)
      const win = window.open('', '_blank', 'width=760,height=720,menubar=no,toolbar=no')
      if (!win) {
        toast.error('Pop-up blocked')
        setPrinting(false)
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => {
        win.print()
        setPrinting(false)
      }, 450)
    } catch {
      toast.error('Failed to generate print preview')
      setPrinting(false)
    }
  }

  const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`
  const card = (extra?: any) => ({ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #e8f0f7', marginBottom: 18, ...extra })
  const activeFields = Object.keys(fields).filter((key) => fields[key])
  const fieldLabels = Object.fromEntries(Object.entries(currentConfig?.fields || {}).map(([key, value]) => [key, value.label]))
  const isTagType = type === 'garment' || type === 'bag'

  return (
    <div style={{ padding: '30px 36px 56px', maxWidth: 980, margin: '0 auto', fontFamily: 'var(--crm-font-ui)' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontWeight: 800, fontSize: 28, color: '#023c62', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Printer size={28} /> Print Center
        </h1>
        <p style={{ fontSize: 14, color: '#6b7fa3', margin: 0 }}>Garment, label, receipt, and thermal layouts use separate printer settings.</p>
      </div>

      <div style={card()}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Find Order</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={orderNum}
            onChange={(e) => setOrderNum(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && findOrder()}
            placeholder="Order number, e.g. HCS-1279"
            style={{ flex: 1, border: '1.5px solid #dce8f0', borderRadius: 9, padding: '11px 14px', fontSize: 14, outline: 'none' }}
          />
          <button onClick={findOrder} disabled={loading} style={{ background: '#023c62', color: '#fff', border: 'none', borderRadius: 9, padding: '11px 22px', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? 'Finding...' : 'Find'}
          </button>
        </div>
      </div>

      {!printConfig && (
        <div style={{ background: '#fff7ed', borderRadius: 12, padding: '13px 16px', border: '1px solid #fed7aa', marginBottom: 18, color: '#9a3412', fontSize: 13, fontWeight: 700 }}>
          Loading print settings from database...
        </div>
      )}

      {order && printConfig && (
        <>
          <div style={{ background: '#e8f7ef', borderRadius: 12, padding: '13px 16px', border: '1px solid #86efac', marginBottom: 18, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: '#023c62' }}>{order.orderNumber}</span>
              <span style={{ color: '#9dafc8' }}>·</span>
              <span style={{ fontWeight: 600 }}>{order.customer?.name || `+91 ${order.customer?.phone}`}</span>
              <span style={{ color: '#9dafc8' }}>·</span>
              <span style={{ color: '#6b7fa3' }}>{garmentCount} garments · {money(order.totalAmount)}</span>
            </div>
            <span style={{ color: '#15803d', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={14} />Loaded</span>
          </div>

          <div style={card()}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>What to Print</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
              {PRINT_TYPES.map((entry) => {
                const config = printConfig[entry.k]
                const active = type === entry.k
                return (
                  <button key={entry.k} onClick={() => selectType(entry.k as PrintType)}
                    style={{ padding: 14, borderRadius: 11, border: `2px solid ${active ? '#023c62' : '#dce8f0'}`, background: active ? '#f0f5fa' : '#fff', textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ color: '#023c62', marginBottom: 7 }}>{entry.icon}</div>
                    <div style={{ fontWeight: 800, color: '#023c62', fontSize: 13 }}>{config.title}</div>
                    <div style={{ fontSize: 11, color: '#6b7fa3', marginTop: 3, lineHeight: 1.35 }}>{config.description}</div>
                  </button>
                )
              })}
            </div>
            {type === 'bag' && (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: 13, color: '#6b7fa3', fontWeight: 600 }}>Number of bags</label>
                <input type="number" min={1} max={20} value={bagTotal} onChange={(e) => setBagTotal(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                  style={{ width: 70, border: '1.5px solid #dce8f0', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }} />
              </div>
            )}
          </div>

          {isTagType && (
            <div style={card()}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Printer Size</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: sizePreset === presets.length - 1 ? 14 : 0 }}>
                {presets.map((preset, index) => (
                  <button key={`${preset.label}-${index}`} onClick={() => setSizePreset(index)}
                    style={{ padding: '8px 13px', borderRadius: 999, border: `1.5px solid ${sizePreset === index ? '#023c62' : '#dce8f0'}`, background: sizePreset === index ? '#023c62' : '#fff', color: sizePreset === index ? '#fff' : '#6b7fa3', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {preset.label}
                  </button>
                ))}
              </div>
              {sizePreset === presets.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ fontSize: 13, color: '#6b7fa3' }}>Width mm</label>
                  <input type="number" step="0.1" value={customSize.w} onChange={(e) => setCustomSize((prev) => ({ ...prev, w: Number.parseFloat(e.target.value) || prev.w }))}
                    style={{ width: 82, border: '1.5px solid #dce8f0', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }} />
                  <label style={{ fontSize: 13, color: '#6b7fa3' }}>Height mm</label>
                  <input type="number" step="0.1" value={customSize.h} onChange={(e) => setCustomSize((prev) => ({ ...prev, h: Number.parseFloat(e.target.value) || prev.h }))}
                    style={{ width: 82, border: '1.5px solid #dce8f0', borderRadius: 8, padding: '7px 10px', textAlign: 'center' }} />
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 12, color: '#6b7fa3' }}>
                Selected: <strong style={{ color: '#023c62' }}>{labelSize.w}mm × {labelSize.h}mm</strong>
              </div>
            </div>
          )}

          <div style={card()}>
            <button onClick={() => setFieldsOpen((open) => !open)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fields</span>
                <span style={{ fontSize: 12, color: '#9dafc8', marginLeft: 10 }}>{activeFields.length} enabled</span>
              </div>
              <span style={{ fontSize: 13, color: '#6b7fa3' }}>{fieldsOpen ? 'Hide' : 'Customise'}</span>
            </button>

            {fieldsOpen ? (
              <div style={{ marginTop: 15, display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '7px 16px' }}>
                {Object.keys(fieldLabels).map((key) => (
                  <label key={key} onClick={() => toggleField(key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${fields[key] ? '#023c62' : '#b9c8d6'}`, background: fields[key] ? '#023c62' : '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      {fields[key] && <Check size={11} color="#fff" />}
                    </span>
                    <span style={{ fontSize: 12, color: '#31465f', fontWeight: fields[key] ? 700 : 500, lineHeight: 1.25 }}>{fieldLabels[key]}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {activeFields.map((key) => <span key={key} style={{ fontSize: 11, background: '#e8f0f7', color: '#023c62', borderRadius: 999, padding: '3px 9px', fontWeight: 700 }}>{fieldLabels[key]}</span>)}
              </div>
            )}
          </div>

          <div style={{ background: '#f7f9fc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e8f0f7', marginBottom: 18, fontSize: 13, color: '#6b7fa3', lineHeight: 1.7 }}>
            {type === 'garment' && <span>Will print <strong style={{ color: '#023c62' }}>{garmentCount} garment tags</strong> at {labelSize.w}×{labelSize.h}mm.</span>}
            {type === 'bag' && <span>Will print <strong style={{ color: '#023c62' }}>{bagTotal} bag labels</strong> at {labelSize.w}×{labelSize.h}mm.</span>}
            {type === 'receipt' && <span>Will print <strong style={{ color: '#023c62' }}>A5 receipt</strong> with selected fields.</span>}
            {type === 'thermal' && <span>Will print <strong style={{ color: '#023c62' }}>80mm thermal receipt</strong> with selected fields.</span>}
          </div>

          <button onClick={doPrint} disabled={printing}
            style={{ background: printing ? '#6b7fa3' : '#023c62', color: '#fff', border: 'none', borderRadius: 11, padding: '13px 34px', fontWeight: 800, cursor: printing ? 'wait' : 'pointer', fontSize: 15 }}>
            {printing ? 'Generating...' : 'Open Print Window'}
          </button>
        </>
      )}

      {!order && !loading && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 46, border: '1px solid #e8f0f7', textAlign: 'center', color: '#9dafc8' }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Printer size={48} /></div>
          <div style={{ fontSize: 15, color: '#6b7fa3', fontWeight: 700, marginBottom: 5 }}>Enter an order number above</div>
          <div style={{ fontSize: 13 }}>Use a live order number and test all print types locally first.</div>
        </div>
      )}
    </div>
  )
}

function PrintCenterPageFallback() {
  return (
    <div style={{ padding: '32px 36px', maxWidth: 920, margin: '0 auto', fontFamily: 'var(--crm-font-ui)' }}>
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
