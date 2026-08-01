'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { API_BASE_URL, ordersAPI, settingsAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { Check, FileText, Pencil, Printer, Receipt, ScrollText, Tag, Trash2 } from 'lucide-react'
import { LOGO_BLUE_URL, LOGO_WHITE_URL } from '@/lib/branding'

type PrintType = 'garment' | 'label' | 'bag' | 'receipt' | 'thermal'
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
  provider?: string
  vpa?: string
  gpayNumber?: string
  payeeName?: string
  defaultAccountId?: string
  accounts?: PaymentAccount[]
}
type PaymentAccount = {
  id: string
  label: string
  isDefault?: boolean
  provider?: string
  vpa?: string
  gpayNumber?: string
  payeeName?: string
  qrImageUrl?: string
  qrImageDataUrl?: string
}
type PaymentAccountValidation = Record<string, string[]>
type PrintBrandLogos = {
  blueLogo: string
  whiteLogo: string
}
const PRINT_LAYOUT_SETTING_KEY = 'print_layout_settings'
const PAYMENT_QR_SETTING_KEY = 'payment_qr_settings'
const PRINT_TYPES: Array<{ k: PrintType; icon: ReactNode }> = [
  { k: 'garment', icon: <Tag size={24} /> },
  { k: 'label', icon: <Tag size={24} /> },
  { k: 'bag', icon: <FileText size={24} /> },
  { k: 'receipt', icon: <Receipt size={24} /> },
  { k: 'thermal', icon: <ScrollText size={24} /> },
]

const STORE_PHONE = '+91 7977417014'
const STORE_LINE = 'Hangers Clothes Spa'
const STORE_NOTE = 'Thank you for your visit. Have a nice day.'

const unwrapApiPayload = (payload: any) => {
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return { ...payload, ...payload.data }
  }
  return payload
}

async function requestPrintJson(path: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.message || `Print request failed (${response.status})`)
  return unwrapApiPayload(payload)
}

async function makeQR(text: string, size = 80): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
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

const escapeHtml = (value: any) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const timestampValue = (value: any) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0
}

const compareOrderItems = (a: any, b: any) => {
  const createdDiff = timestampValue(a?.createdAt) - timestampValue(b?.createdAt)
  if (createdDiff) return createdDiff
  return String(a?.id || '').localeCompare(String(b?.id || ''))
}

const getDefaultPaymentAccount = (settings?: PaymentQrSettings | null): PaymentAccount | null => {
  if (!settings) return null
  const accounts = Array.isArray(settings.accounts) ? settings.accounts : []
  const account = accounts.find((item) => item.id === settings.defaultAccountId) || accounts.find((item) => item.isDefault) || accounts[0]
  if (account) return account
  return {
    id: settings.defaultAccountId || 'primary',
    label: 'Primary Account',
    isDefault: true,
    provider: settings.provider || 'UPI',
    vpa: settings.vpa || '',
    gpayNumber: settings.gpayNumber || '',
    payeeName: settings.payeeName || '',
  }
}

function getPaymentQrImage(settings?: PaymentQrSettings | null) {
  const account = getDefaultPaymentAccount(settings)
  return account?.qrImageDataUrl || account?.qrImageUrl || ''
}

const isValidUpiId = (value: string) => /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{2,64}$/.test(value.trim())
const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 10)

async function buildPrintHTML(
  order: any,
  type: PrintType,
  bagTotal: number,
  size: LabelSize,
  fields: FieldState,
  paymentQrSettings?: PaymentQrSettings | null,
  brandLogos: PrintBrandLogos = { blueLogo: LOGO_BLUE_URL, whiteLogo: LOGO_WHITE_URL }
): Promise<string> {
  const f = (key: string) => fields[key] !== false
  const items = [...(order.items || [])].sort(compareOrderItems)
  const garments = items.flatMap((item: any) => {
    const units = (item.garmentUnits || [])
      .filter((unit: any) => unit.status !== 'VOID')
      .sort((a: any, b: any) => Number(a.sequence || 0) - Number(b.sequence || 0) || String(a.id || '').localeCompare(String(b.id || '')))
    const lineQuantity = Math.max(1, Number(item.quantity || 1), units.length)
    return Array.from({ length: lineQuantity }, (_, index) => ({
      ...item,
      quantity: 1,
      lineQuantity,
      lineUnitIndex: index + 1,
      garmentUnit: units[index] || null,
      fallbackUnitIndex: index + 1,
    }))
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
      : `html, body { width: ${size.w}mm; min-height: ${size.h}mm; margin: 0; }`

  const tagFont = {
    brand: Math.max(11, Math.min(15, Math.floor(size.w / 3.05))),
    order: Math.max(13, Math.min(17, Math.floor(size.w / 2.65))),
    main: Math.max(10, Math.min(14, Math.floor(size.w / 3.2))),
    small: Math.max(8, Math.min(11, Math.floor(size.w / 4.35))),
  }

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
    ${bodySizeRule}
    ${pageRule}
    @media print {
      html, body {
        width: ${type === 'receipt' ? '148mm' : type === 'thermal' ? '80mm' : `${size.w}mm`};
        margin: 0 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
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
      padding: 0.65mm;
    }
    .tag-inner {
      width: 100%;
      height: 100%;
      max-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-evenly;
      text-align: center;
      gap: 0.25mm;
      overflow: hidden;
    }
    .tag-brand,
    .tag-order,
    .tag-main,
    .tag-small,
    .tag-note {
      max-width: 100%;
      overflow-wrap: anywhere;
      word-break: break-word;
      text-rendering: geometricPrecision;
      -webkit-text-stroke: 0.14px #000;
    }
    .tag-brand { font-size: ${tagFont.brand}px; line-height: 0.95; font-weight: 900; letter-spacing: 0.01em; }
    .tag-order { font-family: Arial, Helvetica, sans-serif; font-size: ${tagFont.order}px; line-height: 0.95; font-weight: 900; letter-spacing: 0.01em; }
    .tag-main { font-size: ${tagFont.main}px; line-height: 1; font-weight: 900; }
    .tag-small { font-size: ${tagFont.small}px; line-height: 1; font-weight: 900; }
    .tag-note { font-size: ${Math.max(7, tagFont.small - 1)}px; line-height: 1; font-weight: 850; }
    .defects { display: flex; gap: 0.6mm; flex-wrap: wrap; align-items: center; justify-content: center; max-width: 100%; }
    .defects span { font-size: ${Math.max(6.5, tagFont.small - 1)}px; font-weight: 850; white-space: nowrap; }
    .qr { width: ${qrPx}px; height: ${qrPx}px; object-fit: contain; }

    .receipt-page {
      width: 134mm;
      min-height: 196mm;
      margin: 0 auto;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px;
      line-height: 1.38;
      color: #152132;
    }
    .receipt-sheet {
      border: 1px solid #d7e4ee;
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
    }
    .receipt-hero {
      background: linear-gradient(135deg, #022d4d 0%, #023c62 62%, #2a6b97 100%);
      color: #fff;
      padding: 6mm;
      display: flex;
      justify-content: space-between;
      gap: 8mm;
      align-items: flex-start;
    }
    .receipt-logo { max-width: 44mm; max-height: 15mm; object-fit: contain; display: block; margin-bottom: 2mm; }
    .receipt-title { font-size: 16px; font-weight: 900; letter-spacing: 0.01em; }
    .receipt-sub { color: #dcecf9; font-size: 9.5px; line-height: 1.45; }
    .receipt-doc { text-align: right; min-width: 38mm; }
    .receipt-doc-label { font-size: 8.5px; color: #dcecf9; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; }
    .receipt-doc-no { font-size: 15px; font-weight: 900; margin-top: 1mm; }
    .receipt-body { padding: 5mm 6mm 6mm; }
    .receipt-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 4mm; }
    .receipt-meta-card { border: 1px solid #dce8f0; border-radius: 8px; padding: 3mm; background: #fff; }
    .receipt-meta-label { font-size: 8.5px; color: #7d91a7; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 1mm; }
    .receipt-meta-value { color: #023c62; font-weight: 800; font-size: 11px; overflow-wrap: anywhere; }
    .receipt-customer { border: 1px solid #dce8f0; border-radius: 8px; padding: 3mm; margin-bottom: 4mm; background: #f8fbfd; }
    .receipt-customer-name { color: #023c62; font-size: 13px; font-weight: 900; }
    .receipt-customer-phone { color: #53657d; font-size: 10px; font-weight: 700; margin-top: 0.5mm; }
    .receipt-section-title { color: #023c62; font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; margin: 4mm 0 2mm; }
    .muted { color: #6b7fa3; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; }
    .receipt-table { border: 1px solid #dce8f0; border-radius: 8px; overflow: hidden; }
    .receipt-table th { background: #f4f8fb; color: #476581; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 900; border-bottom: 1px solid #dce8f0; padding: 2.4mm 2mm; font-size: 8.5px; }
    .receipt-table td { border-bottom: 1px solid #edf3f7; padding: 2.3mm 2mm; vertical-align: top; font-size: 9.6px; }
    .receipt-table tr:last-child td { border-bottom: 0; }
    .right { text-align: right; }
    .center { text-align: center; }
    .totals { margin-left: auto; width: 58mm; margin-top: 4mm; border: 1px solid #dce8f0; border-radius: 10px; overflow: hidden; }
    .total-line { display: flex; justify-content: space-between; padding: 2mm 3mm; border-bottom: 1px solid #edf3f7; color: #53657d; font-weight: 700; }
    .total-line:last-child { border-bottom: 0; }
    .grand { font-size: 14px; font-weight: 900; background: #023c62; color: #fff; }
    .receipt-note { margin-top: 4mm; border: 1px solid #f4d58d; background: #fff9e8; color: #7a4d00; border-radius: 8px; padding: 3mm; }
    .receipt-footer { margin-top: 5mm; padding-top: 3mm; border-top: 1px solid #dce8f0; text-align: center; font-size: 9px; color: #6b7fa3; }

    .thermal-page {
      width: 80mm;
      padding: 3mm 3mm 5mm;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px;
      line-height: 1.35;
      color: #152132;
    }
    .thermal-center { text-align: center; }
    .thermal-hero { border: 1px solid #023c62; border-radius: 3mm; padding: 3mm; margin-bottom: 3mm; text-align: center; }
    .thermal-logo { max-width: 42mm; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2mm; }
    .thermal-title { color: #023c62; font-size: 13px; font-weight: 900; }
    .thermal-sub { color: #53657d; font-size: 9px; }
    .divider { border-top: 1px solid #dce8f0; margin: 2.5mm 0; }
    .row { display: flex; justify-content: space-between; gap: 3mm; margin-bottom: 1mm; }
    .thermal-pill { border: 1px solid #dce8f0; border-radius: 2mm; padding: 2mm; margin-bottom: 2mm; background: #f8fbfd; }
    .thermal-item { display: grid; grid-template-columns: 6mm 1fr 10mm 14mm 16mm; gap: 1mm; padding: 1.5mm 0; border-bottom: 1px solid #edf3f7; align-items: start; }
    .thermal-item.no-si { grid-template-columns: 1fr 10mm 14mm 16mm; }
    .thermal-total { background: #023c62; color: #fff; border-radius: 2mm; padding: 2mm; margin-top: 2mm; }
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
      const quantityLabel = `${item.lineUnitIndex || 1}/${item.lineQuantity || 1}`
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
            <div class="tag-small">Qty ${escapeHtml(quantityLabel)}</div>
            ${f('price') ? `<div class="tag-small">${rupee(item.unitPrice || 0)}</div>` : ''}
            ${f('customerPhone') ? `<div class="tag-small">${escapeHtml(customerPhone)}</div>` : ''}
            ${defectText.length ? `<div class="defects">${defectText.map((entry) => `<span>${escapeHtml(entry)}</span>`).join('')}</div>` : ''}
            ${f('notes') && (item.notes || order.notes) ? `<div class="tag-note">${escapeHtml(item.notes || order.notes)}</div>` : ''}
            ${f('tagIndex') ? `<div class="tag-small">Tag ${index + 1}/${garments.length}</div>` : ''}
            ${qrData ? `<img class="qr" src="${qrData}" alt="QR" />` : ''}
          </div>
        </section>`
    }))
    body = pages.join('')
  }

  if (type === 'label') {
    const pages = await Promise.all(garments.map(async (item: any, index: number) => {
      const labelNumber = `${index + 1}/${garments.length}`
      const tagNumber = item.garmentUnit?.tagNumber || `${order.orderNumber}-LABEL-${index + 1}`
      const qrData = f('barcode') ? await qr(tagNumber) : ''
      return `
        <section class="page tag-page">
          <div class="tag-inner">
            ${f('brand') ? `<div class="tag-brand">${escapeHtml(STORE_LINE.replace(' Clothes Spa', ''))}</div>` : ''}
            ${f('orderNumber') ? `<div class="tag-order">${escapeHtml(order.orderNumber)}</div>` : ''}
            ${f('customerName') ? `<div class="tag-small">${escapeHtml(customerName || 'Customer')}</div>` : ''}
            ${f('customerPhone') ? `<div class="tag-small">${escapeHtml(customerPhone)}</div>` : ''}
            ${f('receivedCount') ? `<div class="tag-main">${escapeHtml(labelNumber)}</div>` : ''}
            ${f('garmentType') ? `<div class="tag-small">${escapeHtml(item.garmentType || item.serviceName || 'Item')}</div>` : ''}
            ${f('serviceName') ? `<div class="tag-small">${escapeHtml(item.serviceName || '')}</div>` : ''}
            ${f('orderDate') ? `<div class="tag-small">Date ${fmtDate(order.createdAt)}</div>` : ''}
            ${f('deliveryDate') && order.deliveryDate ? `<div class="tag-small">Due ${fmtDate(order.deliveryDate)}</div>` : ''}
            ${f('notes') && (item.notes || order.notes) ? `<div class="tag-note">${escapeHtml(item.notes || order.notes)}</div>` : ''}
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
    const upiQrData = f('upiQr') ? getPaymentQrImage(paymentQrSettings) : ''
    body = `
      <section class="page receipt-page">
        <div class="receipt-sheet">
          <div class="receipt-hero">
            <div>
              ${f('logo') ? `<img class="receipt-logo" src="${brandLogos.whiteLogo}" alt="Hangers" />` : `<div class="receipt-title">${STORE_LINE}</div>`}
              <div class="receipt-sub">${f('storeAddress') ? escapeHtml(STORE_PHONE) : 'Premium garment care receipt'}</div>
            </div>
            <div class="receipt-doc">
              <div class="receipt-doc-label">Receipt</div>
              <div class="receipt-doc-no">${escapeHtml(order.orderNumber)}</div>
              <div class="receipt-sub">${fmtDate(order.createdAt)}</div>
            </div>
          </div>
          <div class="receipt-body">
            <div class="receipt-meta-grid">
              <div class="receipt-meta-card"><div class="receipt-meta-label">Order</div><div class="receipt-meta-value">${escapeHtml(order.orderNumber)}</div></div>
              <div class="receipt-meta-card"><div class="receipt-meta-label">Order Date</div><div class="receipt-meta-value">${fmtDate(order.createdAt)}</div></div>
              ${f('deliveryDate') ? `<div class="receipt-meta-card"><div class="receipt-meta-label">Due Date</div><div class="receipt-meta-value">${fmtDate(order.deliveryDate)}</div></div>` : ''}
              ${f('paymentStatus') ? `<div class="receipt-meta-card"><div class="receipt-meta-label">Payment</div><div class="receipt-meta-value">${escapeHtml(payStatus)}</div></div>` : ''}
            </div>
            ${f('customerInfo') ? `<div class="receipt-customer"><div class="receipt-meta-label">Customer</div><div class="receipt-customer-name">${escapeHtml(customerName || '-')}</div>${customerPhone ? `<div class="receipt-customer-phone">${escapeHtml(customerPhone)}</div>` : ''}</div>` : ''}
            ${f('itemTable') ? `
              <div class="receipt-section-title">Garments / Service</div>
              <table class="receipt-table">
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
                      <td class="right"><strong>${rupee(item.subtotal ?? Number(item.quantity || 1) * Number(item.unitPrice || 0))}</strong></td>
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
            ${f('customNote') && order.notes ? `<div class="receipt-note"><strong>Notes:</strong> ${escapeHtml(order.notes)}</div>` : ''}
            ${trackingQrData || upiQrData ? `<div class="center" style="display:flex;justify-content:center;gap:8mm;margin-top:4mm">${trackingQrData ? `<div><img src="${trackingQrData}" width="64" height="64" alt="Tracking QR" /><div class="muted">Track order</div></div>` : ''}${upiQrData ? `<div><img src="${escapeHtml(upiQrData)}" width="64" height="64" alt="Payment QR" /><div class="muted">Scan to pay</div></div>` : ''}</div>` : ''}
            ${f('terms') ? `<div class="receipt-footer">Retain this receipt for delivery. Please check garments at delivery.</div>` : ''}
          </div>
        </div>
      </section>`
  }

  if (type === 'thermal') {
    const trackingQrData = f('barcode') ? await qr(order.orderNumber) : ''
    const upiQrData = f('upiQr') ? getPaymentQrImage(paymentQrSettings) : ''
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
        <div class="thermal-hero">
          ${f('logo') ? `<img class="thermal-logo" src="${brandLogos.blueLogo}" alt="Hangers" />` : `<div class="bold">${STORE_LINE}</div>`}
          ${f('storeAddress') ? `<div class="thermal-sub">${STORE_PHONE}</div>` : ''}
          ${f('invoiceMessage') ? `<div class="thermal-title">Customer Copy</div>` : ''}
        </div>
        <div class="thermal-pill">
          ${f('orderNumber') ? `<div class="row"><span>Order</span><strong>${escapeHtml(order.orderNumber)}</strong></div>` : ''}
          ${f('orderDate') ? `<div class="row"><span>Date</span><span>${fmtDate(order.createdAt)}</span></div>` : ''}
          ${f('deliveryDate') ? `<div class="row"><span>Due</span><span>${fmtDate(order.deliveryDate)}</span></div>` : ''}
          ${f('customerInfo') ? `<div class="row"><span>Customer</span><span style="text-align:right">${escapeHtml(customerName || '-')}${customerPhone ? `<br/>${escapeHtml(customerPhone)}` : ''}</span></div>` : ''}
        </div>
        <div class="divider"></div>
        ${itemRows}
        <div class="divider"></div>
        ${f('subtotal') ? `<div class="row"><span>Subtotal</span><span>${rupee(order.subtotal || order.totalAmount || 0)}</span></div>` : ''}
        ${Number(order.discount || 0) > 0 ? `<div class="row"><span>Discount</span><span>- ${rupee(order.discount)}</span></div>` : ''}
        ${f('tax') ? `<div class="row"><span>Tax</span><span>${f('inclusiveTax') ? 'Inclusive' : '-'}</span></div>` : ''}
        <div class="thermal-total">
          ${f('grandTotal') ? `<div class="row bold"><span>Total</span><span>${rupee(order.totalAmount || 0)}</span></div>` : ''}
          ${f('netPayable') ? `<div class="row bold"><span>Net Payable</span><span>${rupee(balance || order.totalAmount || 0)}</span></div>` : ''}
        </div>
        ${f('customerNote') && order.notes ? `<div class="divider"></div><div><strong>Notes:</strong> ${escapeHtml(order.notes)}</div>` : ''}
        ${trackingQrData ? `<div class="thermal-center" style="margin-top:3mm"><img src="${trackingQrData}" width="82" height="82" alt="Tracking QR" /></div>` : ''}
        ${upiQrData ? `<div class="thermal-center" style="margin-top:3mm"><img src="${escapeHtml(upiQrData)}" width="82" height="82" alt="Payment QR" /><div>Scan to pay</div></div>` : ''}
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

const isPrintType = (value: string): value is PrintType =>
  value === 'garment' || value === 'label' || value === 'bag' || value === 'receipt' || value === 'thermal'

function AutoPrintRunner({ orderId, printType }: { orderId: string; printType: string }) {
  const [status, setStatus] = useState('Loading order...')
  const [errorMessage, setErrorMessage] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const notify = (status: 'done' | 'error', message = '') => {
      try {
        window.opener?.postMessage({ type: `HANGERS_PRINT_${status.toUpperCase()}`, message }, window.location.origin)
      } catch {}
    }

    const fail = (message: string) => {
      setErrorMessage(message)
      notify('error', message)
    }

    const run = async () => {
      try {
        if (!orderId) throw new Error('Print order id is missing')
        const type = isPrintType(printType) ? printType : 'garment'

        setStatus('Loading order...')
        const orderResponse = await requestPrintJson(`/orders/${encodeURIComponent(orderId)}`)
        const order = orderResponse.order || orderResponse.data?.order || orderResponse.data
        if (!order?.id) throw new Error('Order response did not include order details')

        setStatus('Loading print settings...')
        const settingsResponse = await requestPrintJson('/settings')
        const dbConfig = settingsResponse?.data?.map?.[PRINT_LAYOUT_SETTING_KEY] || settingsResponse?.map?.[PRINT_LAYOUT_SETTING_KEY]
        if (!dbConfig?.garment?.fields || !dbConfig?.label?.fields || !dbConfig?.bag?.fields || !dbConfig?.receipt?.fields || !dbConfig?.thermal?.fields) {
          throw new Error('Print settings are missing')
        }

        const fields = getInitialFields(dbConfig, type)
        const currentConfig = dbConfig[type]
        const presets = type === 'garment' || type === 'label' || type === 'bag' ? (currentConfig?.presets || []) : []
        const preset = presets[0]
        const labelSize = type === 'garment' || type === 'label' || type === 'bag'
          ? (preset && preset.w && preset.h ? { w: preset.w, h: preset.h } : currentConfig?.size || { w: 0, h: 0 })
          : dbConfig.garment?.size || { w: 0, h: 0 }
        const paymentQrSettings = settingsResponse?.data?.map?.[PAYMENT_QR_SETTING_KEY] || settingsResponse?.map?.[PAYMENT_QR_SETTING_KEY] || null

        if (fields.upiQr && !getPaymentQrImage(paymentQrSettings)) {
          throw new Error('Payment QR is enabled for this print type, but no default account QR image is configured in DB')
        }

        setStatus('Building print document...')
        const [blueLogoResult, whiteLogoResult] = await Promise.allSettled([
          fetchAsDataUrl(LOGO_BLUE_URL),
          fetchAsDataUrl(LOGO_WHITE_URL),
        ])
        const brandLogos = {
          blueLogo: blueLogoResult.status === 'fulfilled' && blueLogoResult.value ? blueLogoResult.value : LOGO_BLUE_URL,
          whiteLogo: whiteLogoResult.status === 'fulfilled' && whiteLogoResult.value ? whiteLogoResult.value : LOGO_WHITE_URL,
        }
        const html = await buildPrintHTML(order, type, 1, labelSize, fields, paymentQrSettings, brandLogos)

        setStatus('Opening print dialog...')
        const frame = document.createElement('iframe')
        frame.setAttribute('title', 'Hangers print document')
        frame.style.position = 'fixed'
        frame.style.right = '0'
        frame.style.bottom = '0'
        frame.style.width = '0'
        frame.style.height = '0'
        frame.style.border = '0'
        frame.style.opacity = '0'
        document.body.appendChild(frame)

        const frameWindow = frame.contentWindow
        const frameDocument = frameWindow?.document
        if (!frameWindow || !frameDocument) throw new Error('Could not prepare print frame')

        let completed = false
        let printStarted = false
        const closePopup = () => {
          try { window.close() } catch {}
          window.setTimeout(() => { try { window.close() } catch {} }, 250)
          window.setTimeout(() => { try { window.close() } catch {} }, 1000)
        }
        const finish = () => {
          if (completed) return
          completed = true
          setStatus('Print dialog opened.')
          notify('done')
          window.removeEventListener('afterprint', finish)
          window.removeEventListener('focus', onFocusAfterPrint)
          frameWindow.removeEventListener?.('afterprint', finish)
          window.setTimeout(closePopup, 250)
        }
        const onFocusAfterPrint = () => {
          if (!printStarted || completed) return
          window.setTimeout(finish, 450)
        }

        window.addEventListener('afterprint', finish)
        window.addEventListener('focus', onFocusAfterPrint)
        frameWindow.addEventListener?.('afterprint', finish)
        frameWindow.onafterprint = finish
        frameDocument.open()
        frameDocument.write(html)
        frameDocument.close()
        window.setTimeout(() => {
          try {
            frameWindow.focus()
            printStarted = true
            frameWindow.print()
            window.setTimeout(finish, 2500)
          } catch (err: any) {
            fail(err?.message || 'Print failed')
          }
        }, 300)
      } catch (err: any) {
        fail(err?.message || 'Failed to generate print preview')
      }
    }

    run()
  }, [orderId, printType])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      background: '#fff',
      color: errorMessage ? '#b91c1c' : '#023c62',
      fontFamily: 'var(--crm-font-ui)',
      fontSize: 13,
      fontWeight: 800,
      textAlign: 'center',
      padding: 24,
    }}>
      <div>
        <div>{errorMessage || status}</div>
        {errorMessage && (
          <div style={{ marginTop: 10, fontSize: 12, maxWidth: 420, lineHeight: 1.45 }}>
            Print could not start. Close this window and retry from the order actions menu.
          </div>
        )}
      </div>
    </div>
  )
}

function PrintCenterPageContent() {
  const searchParams = useSearchParams()
  const autoPrint = searchParams.get('autoprint') === '1'
  const orderIdParam = searchParams.get('orderId') || ''
  const typeParam = searchParams.get('type') || ''
  const [orderNum, setOrderNum] = useState('')
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [printStatus, setPrintStatus] = useState('Preparing print...')
  const [printError, setPrintError] = useState('')
  const [type, setType] = useState<PrintType>('garment')
  const [bagTotal, setBagTotal] = useState(1)
  const [sizePreset, setSizePreset] = useState(0)
  const [printConfig, setPrintConfig] = useState<PrintLayoutSettings | null>(null)
  const [paymentQrSettings, setPaymentQrSettings] = useState<PaymentQrSettings | null>(null)
  const [customSize, setCustomSize] = useState<LabelSize>({ w: 0, h: 0 })
  const [fields, setFields] = useState<FieldState>({})
  const [brandLogos, setBrandLogos] = useState<PrintBrandLogos>({ blueLogo: LOGO_BLUE_URL, whiteLogo: LOGO_WHITE_URL })
  const [fieldsOpen, setFieldsOpen] = useState(true)
  const [savingFields, setSavingFields] = useState(false)
  const [savingPaymentQr, setSavingPaymentQr] = useState(false)
  const [paymentDraftSettings, setPaymentDraftSettings] = useState<PaymentQrSettings | null>(null)
  const [paymentDraftDirty, setPaymentDraftDirty] = useState(false)
  const [editingPaymentAccountIds, setEditingPaymentAccountIds] = useState<Set<string>>(new Set())
  const [dirtyPaymentAccountIds, setDirtyPaymentAccountIds] = useState<Set<string>>(new Set())
  const fieldSaveSeq = useRef(0)
  const paymentSaveSeq = useRef(0)
  const paymentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoPrintSeq = useRef('')

  const currentConfig = printConfig?.[type]
  const garmentCount = (order?.items || []).reduce((total: number, item: any) => {
    const units = (item.garmentUnits || []).filter((unit: any) => unit.status !== 'VOID')
    return total + (units.length || Number(item.quantity || 1))
  }, 0)
  const presets = type === 'garment' || type === 'label' || type === 'bag' ? (currentConfig?.presets || []) : []
  const labelSize = useMemo<LabelSize>(() => {
    if (type !== 'garment' && type !== 'label' && type !== 'bag') return printConfig?.garment?.size || { w: 0, h: 0 }
    const preset = presets[sizePreset]
    return preset && preset.w && preset.h ? { w: preset.w, h: preset.h } : (customSize.w && customSize.h ? customSize : currentConfig?.size || { w: 0, h: 0 })
  }, [customSize, currentConfig?.size, presets, printConfig?.garment?.size, sizePreset, type])

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      fetchAsDataUrl(LOGO_BLUE_URL),
      fetchAsDataUrl(LOGO_WHITE_URL),
    ]).then(([blueResult, whiteResult]) => {
      if (cancelled) return
      setBrandLogos({
        blueLogo: blueResult.status === 'fulfilled' && blueResult.value ? blueResult.value : LOGO_BLUE_URL,
        whiteLogo: whiteResult.status === 'fulfilled' && whiteResult.value ? whiteResult.value : LOGO_WHITE_URL,
      })
    })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (autoPrint) return
    if (typeParam === 'garment' || typeParam === 'label' || typeParam === 'bag' || typeParam === 'receipt' || typeParam === 'thermal') {
      setType(typeParam)
      setSizePreset(0)
    }
    if (!orderIdParam) {
      if (autoPrint) setPrintError('Print order id is missing')
      return
    }
    setPrintStatus('Loading order...')
    setLoading(true)
    const loadOrder = autoPrint
      ? requestPrintJson(`/orders/${encodeURIComponent(orderIdParam)}`)
      : ordersAPI.get(orderIdParam)
    loadOrder
      .then((detail: any) => {
        const loaded = detail.order || detail.data?.order || detail.data
        if (!loaded?.id) throw new Error('Order response did not include order details')
        setOrder(loaded)
        setOrderNum(loaded?.orderNumber || '')
      })
      .catch((err: any) => {
        const message = err?.message || 'Could not load print order'
        setPrintError(message)
        if (autoPrint) window.opener?.postMessage({ type: 'HANGERS_PRINT_ERROR', message }, window.location.origin)
        else toast.error(message)
      })
      .finally(() => setLoading(false))
  }, [autoPrint, orderIdParam, typeParam])

  useEffect(() => {
    if (autoPrint) return
    const loadSettings = autoPrint ? requestPrintJson('/settings') : settingsAPI.getAll()
    loadSettings
      .then((response: any) => {
        const dbConfig = response?.data?.map?.[PRINT_LAYOUT_SETTING_KEY] || response?.map?.[PRINT_LAYOUT_SETTING_KEY]
        if (!dbConfig?.garment?.fields || !dbConfig?.label?.fields || !dbConfig?.bag?.fields || !dbConfig?.receipt?.fields || !dbConfig?.thermal?.fields) {
          throw new Error('Print settings are missing')
        }
        setPrintConfig(dbConfig)
        const qrConfig = response?.data?.map?.[PAYMENT_QR_SETTING_KEY] || response?.map?.[PAYMENT_QR_SETTING_KEY] || null
        setPaymentQrSettings(qrConfig)
        setPaymentDraftSettings(qrConfig)
        setPaymentDraftDirty(false)
        const nextType = type
        setFields(getInitialFields(dbConfig, nextType))
        if (nextType === 'garment' || nextType === 'label' || nextType === 'bag') setCustomSize({ ...(dbConfig[nextType].size || { w: 0, h: 0 }) })
      })
      .catch((err: any) => {
        const message = err.message || 'Failed to load print settings'
        setPrintError(message)
        if (autoPrint) window.opener?.postMessage({ type: 'HANGERS_PRINT_ERROR', message }, window.location.origin)
        else toast.error(message)
      })
  }, [autoPrint])

  useEffect(() => {
    return () => {
      if (paymentSaveTimer.current) clearTimeout(paymentSaveTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!printConfig) return
    setFields(getInitialFields(printConfig, type))
    if (type === 'garment' || type === 'label' || type === 'bag') setCustomSize({ ...(printConfig[type].size || { w: 0, h: 0 }) })
  }, [printConfig, type])

  const selectType = (nextType: PrintType) => {
    setType(nextType)
    setFields(getInitialFields(printConfig, nextType))
    setSizePreset(0)
    if ((nextType === 'garment' || nextType === 'label' || nextType === 'bag') && printConfig) setCustomSize({ ...(printConfig[nextType].size || { w: 0, h: 0 }) })
  }

	  const toggleField = (key: string) => {
    if (!printConfig?.[type]?.fields?.[key]) return

    const nextEnabled = !fields[key]
    const nextFields = { ...fields, [key]: nextEnabled }
    const nextConfig = {
      ...printConfig,
      [type]: {
        ...printConfig[type],
        fields: {
          ...printConfig[type].fields,
          [key]: {
            ...printConfig[type].fields[key],
            enabled: nextEnabled,
          },
        },
      },
    }

    setFields(nextFields)
    setPrintConfig(nextConfig)
    setSavingFields(true)
    const saveId = fieldSaveSeq.current + 1
    fieldSaveSeq.current = saveId

    settingsAPI.update({ [PRINT_LAYOUT_SETTING_KEY]: nextConfig })
      .catch(() => {
        toast.error('Could not auto-save print field setting')
      })
      .finally(() => {
        if (fieldSaveSeq.current === saveId) setSavingFields(false)
      })
	  }

  const persistPaymentQrSettings = async (nextSettings: PaymentQrSettings) => {
    if (paymentSaveTimer.current) clearTimeout(paymentSaveTimer.current)
    setSavingPaymentQr(true)
    const saveId = paymentSaveSeq.current + 1
    paymentSaveSeq.current = saveId
    try {
      await settingsAPI.update({ [PAYMENT_QR_SETTING_KEY]: nextSettings })
      setPaymentQrSettings(nextSettings)
      setPaymentDraftSettings(nextSettings)
      setPaymentDraftDirty(false)
      setEditingPaymentAccountIds(new Set())
      setDirtyPaymentAccountIds(new Set())
      toast.success('Payment accounts saved')
    } catch {
      toast.error('Could not save payment account settings')
    } finally {
      if (paymentSaveSeq.current === saveId) setSavingPaymentQr(false)
    }
  }

  const updatePaymentQrSetting = (patch: PaymentQrSettings) => {
    const nextSettings = {
      provider: 'UPI',
      vpa: '',
      gpayNumber: '',
      payeeName: '',
      defaultAccountId: 'primary',
      accounts: [],
      ...(paymentDraftSettings || paymentQrSettings || {}),
      ...patch,
    }
    setPaymentDraftSettings(nextSettings)
    setPaymentDraftDirty(true)
  }

  const markPaymentAccountDirty = (accountId: string) => {
    setPaymentDraftDirty(true)
    setDirtyPaymentAccountIds((prev) => new Set(prev).add(accountId))
  }

  const normalizedPaymentSettings = (source: PaymentQrSettings | null = paymentDraftSettings || paymentQrSettings): PaymentQrSettings => {
    const existing = source || {}
    const legacyAccount: PaymentAccount = {
      id: existing.defaultAccountId || 'primary',
      label: 'Primary Account',
      isDefault: true,
      provider: existing.provider || 'UPI',
      vpa: existing.vpa || '',
      gpayNumber: existing.gpayNumber || '',
      payeeName: existing.payeeName || '',
    }
    const accounts = Array.isArray(existing.accounts) && existing.accounts.length ? existing.accounts : [legacyAccount]
    const defaultAccountId = existing.defaultAccountId || accounts.find((account) => account.isDefault)?.id || accounts[0].id
    return {
      provider: existing.provider || 'UPI',
      vpa: existing.vpa || '',
      gpayNumber: existing.gpayNumber || '',
      payeeName: existing.payeeName || '',
      defaultAccountId,
      accounts: accounts.map((account) => ({ ...account, isDefault: account.id === defaultAccountId })),
    }
  }

  const validatePaymentAccounts = (settings: PaymentQrSettings): PaymentAccountValidation => {
    const errors: PaymentAccountValidation = {}
    const accounts = settings.accounts || []
    const addError = (accountId: string, message: string) => {
      errors[accountId] = [...(errors[accountId] || []), message]
    }
    for (const account of accounts) {
      if (!String(account.label || '').trim()) addError(account.id, 'Account label is required')
      if (!String(account.payeeName || '').trim()) addError(account.id, 'Payee name is required')
      if (account.gpayNumber && !/^\d{10}$/.test(account.gpayNumber)) addError(account.id, 'GPay number must be exactly 10 digits')
      if (account.vpa && !isValidUpiId(account.vpa)) addError(account.id, 'UPI ID format should look like name@bank')
      if (!String(account.vpa || '').trim() && !String(account.gpayNumber || '').trim()) addError(account.id, 'Add UPI ID or GPay number')
      if (account.qrImageUrl && !/^https:\/\/.+/i.test(account.qrImageUrl.trim())) addError(account.id, 'QR image URL must start with https://')
    }
    if (settings.defaultAccountId && !accounts.some((account) => account.id === settings.defaultAccountId)) {
      errors.__root = ['Default payment account is missing']
    }
    return errors
  }

  const savePaymentAccounts = (accounts: PaymentAccount[], defaultAccountId?: string) => {
    const nextDefaultId = defaultAccountId || accounts.find((account) => account.isDefault)?.id || accounts[0]?.id || 'primary'
    const nextAccounts = accounts.map((account) => ({ ...account, isDefault: account.id === nextDefaultId }))
    const defaultAccount = nextAccounts.find((account) => account.id === nextDefaultId) || nextAccounts[0]
    updatePaymentQrSetting({
      defaultAccountId: nextDefaultId,
      accounts: nextAccounts,
      provider: defaultAccount?.provider || 'UPI',
      vpa: defaultAccount?.vpa || '',
      gpayNumber: defaultAccount?.gpayNumber || '',
      payeeName: defaultAccount?.payeeName || '',
    })
  }

  const savePaymentAccountDraft = async (accountId: string) => {
    const draftSettings = normalizedPaymentSettings(paymentDraftSettings || paymentQrSettings)
    const savedSettings = normalizedPaymentSettings(paymentQrSettings)
    const draftAccount = draftSettings.accounts?.find((account) => account.id === accountId)
    if (!draftAccount) {
      toast.error('Payment account not found')
      return
    }
    const errors = validatePaymentAccounts(draftSettings)
    const firstError = errors[accountId]?.[0] || errors.__root?.[0]
    if (firstError) {
      toast.error(firstError)
      return
    }
    const savedAccounts = savedSettings.accounts || []
    const accountExists = savedAccounts.some((account) => account.id === accountId)
    const nextAccounts = accountExists
      ? savedAccounts.map((account) => account.id === accountId ? draftAccount : account)
      : [...savedAccounts, draftAccount]
    const nextDefaultId = draftSettings.defaultAccountId === accountId
      ? accountId
      : (savedSettings.defaultAccountId && nextAccounts.some((account) => account.id === savedSettings.defaultAccountId)
        ? savedSettings.defaultAccountId
        : nextAccounts[0]?.id || accountId)
    const defaultAccount = nextAccounts.find((account) => account.id === nextDefaultId) || nextAccounts[0]
    const nextSavedSettings = {
      ...savedSettings,
      defaultAccountId: nextDefaultId,
      accounts: nextAccounts.map((account) => ({ ...account, isDefault: account.id === nextDefaultId })),
      provider: defaultAccount?.provider || 'UPI',
      vpa: defaultAccount?.vpa || '',
      gpayNumber: defaultAccount?.gpayNumber || '',
      payeeName: defaultAccount?.payeeName || '',
    }
    if (paymentSaveTimer.current) clearTimeout(paymentSaveTimer.current)
    setSavingPaymentQr(true)
    const saveId = paymentSaveSeq.current + 1
    paymentSaveSeq.current = saveId
    try {
      await settingsAPI.update({ [PAYMENT_QR_SETTING_KEY]: nextSavedSettings })
      setPaymentQrSettings(nextSavedSettings)
      setPaymentDraftSettings((current) => {
        const active = normalizedPaymentSettings(current || nextSavedSettings)
        return {
          ...active,
          defaultAccountId: nextDefaultId,
          accounts: (active.accounts || []).map((account) => ({
            ...account,
            isDefault: account.id === nextDefaultId,
          })),
          provider: defaultAccount?.provider || 'UPI',
          vpa: defaultAccount?.vpa || '',
          gpayNumber: defaultAccount?.gpayNumber || '',
          payeeName: defaultAccount?.payeeName || '',
        }
      })
      toast.success('Payment account saved')
    } catch {
      toast.error('Could not save payment account')
      return
    } finally {
      if (paymentSaveSeq.current === saveId) setSavingPaymentQr(false)
    }
    setEditingPaymentAccountIds((prev) => {
      const next = new Set(prev)
      next.delete(accountId)
      return next
    })
    setDirtyPaymentAccountIds((prev) => {
      const next = new Set(prev)
      next.delete(accountId)
      return next
    })
  }

  const discardPaymentAccountDraft = (accountId: string) => {
    const saved = normalizedPaymentSettings(paymentQrSettings)
    const draft = normalizedPaymentSettings(paymentDraftSettings || paymentQrSettings)
    const savedAccount = saved.accounts?.find((account) => account.id === accountId)
    const nextAccounts = savedAccount
      ? (draft.accounts || []).map((account) => account.id === accountId ? savedAccount : account)
      : (draft.accounts || []).filter((account) => account.id !== accountId)
    const nextDefaultId = saved.defaultAccountId && nextAccounts.some((account) => account.id === saved.defaultAccountId)
      ? saved.defaultAccountId
      : nextAccounts[0]?.id || 'primary'
    const defaultAccount = nextAccounts.find((account) => account.id === nextDefaultId) || nextAccounts[0]
    setPaymentDraftSettings({
      ...draft,
      defaultAccountId: nextDefaultId,
      accounts: nextAccounts.map((account) => ({ ...account, isDefault: account.id === nextDefaultId })),
      provider: defaultAccount?.provider || 'UPI',
      vpa: defaultAccount?.vpa || '',
      gpayNumber: defaultAccount?.gpayNumber || '',
      payeeName: defaultAccount?.payeeName || '',
    })
    setEditingPaymentAccountIds((prev) => {
      const next = new Set(prev)
      next.delete(accountId)
      return next
    })
    setDirtyPaymentAccountIds((prev) => {
      const next = new Set(prev)
      next.delete(accountId)
      setPaymentDraftDirty(next.size > 0)
      return next
    })
  }

  const updatePaymentAccount = (accountId: string, patch: Partial<PaymentAccount>) => {
    const current = normalizedPaymentSettings()
    const accounts = (current.accounts || []).map((account) => account.id === accountId ? { ...account, ...patch } : account)
    savePaymentAccounts(accounts, current.defaultAccountId)
    markPaymentAccountDirty(accountId)
  }

  const addPaymentAccount = () => {
    const current = normalizedPaymentSettings()
    const id = `account-${Date.now()}`
    savePaymentAccounts([
      ...(current.accounts || []),
      {
        id,
        label: 'New Payment Account',
        provider: 'UPI',
        vpa: '',
        gpayNumber: '',
        payeeName: STORE_LINE,
        qrImageUrl: '',
        qrImageDataUrl: '',
      },
    ], current.defaultAccountId)
    setEditingPaymentAccountIds((prev) => new Set(prev).add(id))
    markPaymentAccountDirty(id)
  }

  const deletePaymentAccount = async (accountId: string) => {
    const current = normalizedPaymentSettings()
    const accounts = current.accounts || []
    if (accounts.length <= 1) {
      toast.error('At least one payment account is required')
      return
    }
    if (current.defaultAccountId === accountId) {
      toast.error('Set another account as default before deleting this one')
      return
    }
    const account = accounts.find((item) => item.id === accountId)
    const label = account?.label || 'this payment account'
    if (!window.confirm(`Delete ${label}? This removes its UPI/GPay/QR settings from CRM payment settings.`)) return
    const nextAccounts = accounts.filter((item) => item.id !== accountId)
    const defaultAccount = nextAccounts.find((item) => item.id === current.defaultAccountId) || nextAccounts[0]
    const nextSettings = {
      ...current,
      defaultAccountId: defaultAccount?.id || 'primary',
      accounts: nextAccounts.map((item) => ({ ...item, isDefault: item.id === defaultAccount?.id })),
      provider: defaultAccount?.provider || 'UPI',
      vpa: defaultAccount?.vpa || '',
      gpayNumber: defaultAccount?.gpayNumber || '',
      payeeName: defaultAccount?.payeeName || '',
    }
    setSavingPaymentQr(true)
    try {
      await settingsAPI.update({ [PAYMENT_QR_SETTING_KEY]: nextSettings })
      setPaymentQrSettings(nextSettings)
      setPaymentDraftSettings(nextSettings)
      toast.success('Payment account deleted')
    } catch {
      toast.error('Could not delete payment account')
      return
    } finally {
      setSavingPaymentQr(false)
    }
    setEditingPaymentAccountIds((prev) => {
      const next = new Set(prev)
      next.delete(accountId)
      return next
    })
    setDirtyPaymentAccountIds((prev) => {
      const next = new Set(prev)
      next.delete(accountId)
      setPaymentDraftDirty(next.size > 0)
      return next
    })
  }

  const uploadPaymentQr = (accountId: string, file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Upload an image file for QR')
      return
    }
    const reader = new FileReader()
    reader.onload = () => updatePaymentAccount(accountId, { qrImageDataUrl: String(reader.result || ''), qrImageUrl: '' })
    reader.onerror = () => toast.error('Could not read QR image')
    reader.readAsDataURL(file)
  }

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
      const message = !printConfig ? 'Print settings are not loaded' : `Print settings are missing for ${type}`
      setPrintError(message)
      if (autoPrint) window.opener?.postMessage({ type: 'HANGERS_PRINT_ERROR', message }, window.location.origin)
      else toast.error(message)
      return
    }
    setPrinting(true)
    setPrintError('')
    setPrintStatus('Building print document...')
    try {
      if (fields.upiQr && !getPaymentQrImage(paymentQrSettings)) {
        const message = 'Payment QR is enabled for this print type, but no default account QR image is configured in DB'
        if (autoPrint) window.opener?.postMessage({ type: 'HANGERS_PRINT_ERROR', message }, window.location.origin)
        else toast.error(message)
        setPrintError(message)
        setPrinting(false)
        return
      }
      ;(window as any).__HANGERS_PRINT_DEBUG__ = { stage: 'build:start', type, order: order.orderNumber, fields, labelSize, bagTotal }
      const html = await buildPrintHTML(order, type, bagTotal, labelSize, fields, paymentQrSettings, brandLogos)
      ;(window as any).__HANGERS_PRINT_DEBUG__ = { stage: 'build:done', type, order: order.orderNumber, htmlLength: html.length }
      setPrintStatus('Opening print dialog...')
      if (autoPrint) {
        const notify = (status: 'done' | 'error', message = '') => {
          try {
            window.opener?.postMessage({ type: `HANGERS_PRINT_${status.toUpperCase()}`, message }, window.location.origin)
          } catch {}
        }
        const frame = document.createElement('iframe')
        frame.setAttribute('title', 'Hangers print document')
        frame.style.position = 'fixed'
        frame.style.right = '0'
        frame.style.bottom = '0'
        frame.style.width = '0'
        frame.style.height = '0'
        frame.style.border = '0'
        frame.style.opacity = '0'
        document.body.appendChild(frame)
        ;(window as any).__HANGERS_PRINT_DEBUG__ = { stage: 'frame:created', type, order: order.orderNumber, htmlLength: html.length }

        const frameWindow = frame.contentWindow
        const frameDocument = frameWindow?.document
        if (!frameWindow || !frameDocument) throw new Error('Could not prepare print frame')

        let completed = false
        const finish = (status: 'done' | 'error', message = '') => {
          if (completed && status === 'done') return
          completed = status === 'done'
          notify(status, message)
          if (status === 'done') {
            setPrintStatus('Print dialog opened.')
            window.setTimeout(() => {
              try { window.close() } catch {}
            }, 250)
          }
        }

        frameWindow.onafterprint = () => finish('done')
        frameDocument.open()
        frameDocument.write(html)
        frameDocument.close()
        window.setTimeout(() => {
          try {
            frameWindow.focus()
            frameWindow.print()
            ;(window as any).__HANGERS_PRINT_DEBUG__ = { stage: 'print:called', type, order: order.orderNumber, htmlLength: html.length }
            window.setTimeout(() => finish('done'), 2500)
          } catch (err: any) {
            const message = err?.message || 'Print failed'
            setPrintError(message)
            finish('error', message)
            setPrinting(false)
          }
        }, 300)
        return
      }
      const win = autoPrint ? window : window.open('', '_blank', 'width=760,height=720,menubar=no,toolbar=no')
      if (!win) {
        toast.error('Pop-up blocked')
        setPrinting(false)
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      if (!autoPrint) {
        win.focus()
        setTimeout(() => {
          win.print()
          setPrinting(false)
        }, 450)
      }
    } catch (err: any) {
      const message = err?.message || 'Failed to generate print preview'
      setPrintError(message)
      ;(window as any).__HANGERS_PRINT_DEBUG__ = { stage: 'error', type, order: order?.orderNumber, message }
      if (autoPrint) {
        window.opener?.postMessage({ type: 'HANGERS_PRINT_ERROR', message }, window.location.origin)
      } else {
        toast.error('Failed to generate print preview')
      }
      setPrinting(false)
    }
  }

  const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`
  const card = (extra?: any) => ({ background: '#fff', borderRadius: 12, padding: 18, border: '1px solid #e8f0f7', marginBottom: 18, ...extra })
  const activeFields = Object.keys(fields).filter((key) => fields[key])
  const fieldLabels = Object.fromEntries(Object.entries(currentConfig?.fields || {}).map(([key, value]) => [key, value.label]))
  const isTagType = type === 'garment' || type === 'label' || type === 'bag'

  useEffect(() => {
    if (autoPrint) return
    if (!autoPrint || printing) return
    if (!order) {
      setPrintStatus('Loading order...')
      return
    }
    if (!printConfig) {
      setPrintStatus('Loading print settings...')
      return
    }
    const seq = `${order.id || order.orderNumber}:${type}:${JSON.stringify(fields)}:${labelSize.w}x${labelSize.h}:${bagTotal}`
    if (autoPrintSeq.current === seq) return
    autoPrintSeq.current = seq
    const timer = window.setTimeout(() => {
      doPrint()
    }, 250)
    return () => window.clearTimeout(timer)
  }, [autoPrint, order, printConfig, printing, type, fields, labelSize.w, labelSize.h, bagTotal])

  if (autoPrint) {
    return <AutoPrintRunner orderId={orderIdParam} printType={typeParam} />
  }

  return (
    <div style={{ padding: '30px 36px 56px', maxWidth: 980, margin: '0 auto', fontFamily: 'var(--crm-font-ui)' }}>
      <div style={{ marginBottom: 24 }}>
	        <h1 style={{ fontWeight: 800, fontSize: 28, color: '#023c62', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
	          <Printer size={28} /> Print & Payment Settings
	        </h1>
	        <p style={{ fontSize: 14, color: '#6b7fa3', margin: 0 }}>Set print layouts, payment QR, UPI ID, and GPay number from one place.</p>
        {autoPrint && (
          <p style={{ fontSize: 12, color: '#15803d', margin: '8px 0 0', fontWeight: 800 }}>
            Auto print is enabled. The print dialog will open after settings and order details load.
          </p>
        )}
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
	          Loading print settings...
	        </div>
	      )}

      {printConfig && (
        <div style={card()}>
          {(() => {
            const paymentSettings = normalizedPaymentSettings()
            const accounts = paymentSettings.accounts || []
            const accountErrors = validatePaymentAccounts(paymentSettings)
            return (
              <>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',marginBottom:14,flexWrap:'wrap'}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em'}}>UPI / GPay Details For Payment Reminders</div>
              <div style={{fontSize:12,color:'#9dafc8',marginTop:4}}>The default account is used for invoice QR, payment prints, and WhatsApp payment reminders.</div>
            </div>
          </div>
          <div style={{marginBottom:12,background:'#f8fbfd',border:'1px solid #e8f0f7',borderRadius:12,padding:'10px 12px',fontSize:12,color:'#51657f',lineHeight:1.45}}>
            Edit all fields first, then save once. Nothing is written to server while typing.
          </div>
          <div style={{display:'grid',gap:12}}>
            {accounts.map((account) => {
              const isDefault = account.id === paymentSettings.defaultAccountId
              const isEditing = editingPaymentAccountIds.has(account.id)
              const hasQr = Boolean(account.qrImageDataUrl || account.qrImageUrl)
              return (
                <div key={account.id} style={{border:`1.5px solid ${isDefault ? '#023c62' : '#dce8f0'}`,borderRadius:14,padding:14,background:isDefault?'#f0f5fa':'#fff'}}>
                  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:12}}>
                    {isEditing ? (
                      <input
                        value={account.label || ''}
                        onChange={(event) => updatePaymentAccount(account.id, { label: event.target.value })}
                        placeholder="Account label"
                        style={{flex:1,border:'1.5px solid #dce8f0',borderRadius:9,padding:'8px 10px',fontSize:13,fontWeight:800,color:'#142033'}}
                      />
                    ) : (
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:15,fontWeight:900,color:'#142033',overflowWrap:'anywhere'}}>{account.label || 'Payment Account'}</div>
                        <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>{account.payeeName || STORE_LINE}</div>
                      </div>
                    )}
                    <span style={{border:'none',background:isDefault?'#023c62':'#e8f0f7',color:isDefault?'#fff':'#023c62',borderRadius:999,padding:'7px 12px',fontSize:12,fontWeight:800,whiteSpace:'nowrap'}}>
                      {isDefault ? 'Default' : 'Not default'}
                    </span>
                    {!isEditing && (
                      <button
                        onClick={() => setEditingPaymentAccountIds((prev) => new Set(prev).add(account.id))}
                        style={{width:34,height:34,borderRadius:10,border:'1px solid #dce8f0',background:'#fff',color:'#023c62',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}
                        title="Edit payment account"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {isEditing && (
                      <>
                        <button onClick={() => savePaymentAccounts(accounts, account.id)}
                          disabled={isDefault}
                          onMouseUp={() => markPaymentAccountDirty(account.id)}
                          style={{border:'none',background:isDefault?'#023c62':'#e8f0f7',color:isDefault?'#fff':'#023c62',borderRadius:999,padding:'7px 12px',fontSize:12,fontWeight:800,cursor:isDefault?'default':'pointer',opacity:isDefault?0.75:1}}>
                          {isDefault ? 'Default' : 'Set Default'}
                        </button>
                        <button
                          onClick={() => deletePaymentAccount(account.id)}
                          disabled={accounts.length <= 1 || isDefault}
                          title={isDefault ? 'Set another account as default before deleting this one' : accounts.length <= 1 ? 'At least one payment account is required' : 'Delete payment account'}
                          style={{width:34,height:34,borderRadius:10,border:'1px solid #fecaca',background:'#fff7f7',color:'#dc2626',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:accounts.length <= 1 || isDefault ? 'not-allowed' : 'pointer',opacity:accounts.length <= 1 || isDefault ? 0.45 : 1}}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>
                        {[
                          ['payeeName', 'Payee Name', STORE_LINE],
                          ['vpa', 'UPI ID', 'name@bank'],
                          ['gpayNumber', 'GPay Number', '10 digit payment number'],
                        ].map(([key, label, placeholder]) => (
                          <label key={key} style={{fontSize:12,color:'#6b7fa3',fontWeight:700}}>
                            {label}
                            <input
                              value={(account as any)[key] || ''}
                              onChange={(event) => updatePaymentAccount(account.id, { [key]: key === 'gpayNumber' ? digitsOnly(event.target.value) : event.target.value } as any)}
                              placeholder={placeholder}
                              inputMode={key === 'gpayNumber' ? 'numeric' : 'text'}
                              style={{display:'block',width:'100%',marginTop:6,border:'1.5px solid #dce8f0',borderRadius:9,padding:'9px 11px',boxSizing:'border-box',fontSize:13}}
                            />
                          </label>
                        ))}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,alignItems:'center',marginTop:12}}>
                        <label style={{fontSize:12,color:'#6b7fa3',fontWeight:700}}>
                          Public QR Image URL
                          <input
                            value={account.qrImageUrl || ''}
                            onChange={(event) => updatePaymentAccount(account.id, { qrImageUrl: event.target.value, qrImageDataUrl: account.qrImageDataUrl || '' })}
                            placeholder="Optional hosted image URL for WhatsApp header"
                            style={{display:'block',width:'100%',marginTop:6,border:'1.5px solid #dce8f0',borderRadius:9,padding:'9px 11px',boxSizing:'border-box',fontSize:13}}
                          />
                        </label>
                        <label style={{border:'1.5px solid #dce8f0',borderRadius:10,padding:'9px 12px',fontSize:12,fontWeight:800,color:'#023c62',background:'#fff',cursor:'pointer',alignSelf:'end'}}>
                          Upload QR
                          <input type="file" accept="image/*" onChange={(event) => uploadPaymentQr(account.id, event.target.files?.[0])} style={{display:'none'}} />
                        </label>
                      </div>
                    </>
                  ) : (
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:10}}>
                      {[
                        ['UPI ID', account.vpa || 'Not set'],
                        ['GPay', account.gpayNumber || 'Not set'],
                        ['QR', hasQr ? 'Configured' : 'Not set'],
                      ].map(([label, value]) => (
                        <div key={label} style={{border:'1px solid #e8f0f7',borderRadius:10,background:'#fff',padding:'9px 10px',minWidth:0}}>
                          <div style={{fontSize:10.5,color:'#9dafc8',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
                          <div style={{fontSize:12.5,color:'#142033',fontWeight:800,marginTop:3,overflowWrap:'anywhere'}}>{value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isEditing && accountErrors[account.id]?.length > 0 && (
                    <div style={{marginTop:10,border:'1px solid #fecaca',background:'#fff7f7',borderRadius:10,padding:'8px 10px',display:'grid',gap:4}}>
                      {accountErrors[account.id].map((message) => (
                        <div key={message} style={{fontSize:12,color:'#b91c1c',fontWeight:700}}>{message}</div>
                      ))}
                    </div>
                  )}
                  {isEditing && (
                    <div style={{marginTop:12,display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,background:'#f8fbfd',border:'1px solid #e8f0f7',borderRadius:10,padding:'9px 10px',flexWrap:'wrap'}}>
                      <span style={{fontSize:12,color:dirtyPaymentAccountIds.has(account.id)?'#b45309':'#15803d',fontWeight:800}}>
                        {dirtyPaymentAccountIds.has(account.id) ? 'Unsaved changes in this account' : 'No changes'}
                      </span>
                      <div style={{display:'flex',gap:8}}>
                        <button
                          onClick={() => discardPaymentAccountDraft(account.id)}
                          disabled={savingPaymentQr}
                          style={{border:'1.5px solid #dce8f0',background:'#fff',color:'#51657f',borderRadius:9,padding:'8px 12px',fontSize:12,fontWeight:800,cursor:savingPaymentQr?'wait':'pointer'}}
                        >
                          Discard
                        </button>
                        <button
                          onClick={() => savePaymentAccountDraft(account.id)}
                          disabled={savingPaymentQr || !dirtyPaymentAccountIds.has(account.id) || Boolean(accountErrors[account.id]?.length)}
                          title={accountErrors[account.id]?.[0] || undefined}
                          style={{border:'none',background:'#023c62',color:'#fff',borderRadius:9,padding:'8px 13px',fontSize:12,fontWeight:900,cursor:!savingPaymentQr && dirtyPaymentAccountIds.has(account.id) && !accountErrors[account.id]?.length?'pointer':'not-allowed',opacity:!savingPaymentQr && dirtyPaymentAccountIds.has(account.id) && !accountErrors[account.id]?.length?1:0.55}}
                        >
                          {savingPaymentQr ? 'Saving...' : 'Save Account'}
                        </button>
                      </div>
                    </div>
                  )}
                  {hasQr && (
                    <div style={{marginTop:10,display:'flex',alignItems:'center',gap:10}}>
                      <img src={account.qrImageDataUrl || account.qrImageUrl} alt={`${account.label} QR`} style={{width:74,height:74,objectFit:'contain',border:'1px solid #dce8f0',borderRadius:10,background:'#fff'}} />
                      <div style={{fontSize:12,color:'#6b7fa3',lineHeight:1.45}}>This QR is stored with this payment account and used when this account is default.</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{position:'sticky',bottom:0,marginTop:14,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,background:'#f8fbfd',border:'1px solid #e8f0f7',borderRadius:12,padding:'11px 12px',boxShadow:'0 -8px 18px rgba(2,60,98,0.04)',flexWrap:'wrap'}}>
            <span style={{fontSize:12,color:savingPaymentQr ? '#92400e' : paymentDraftDirty ? '#b45309' : '#15803d',fontWeight:800}}>
              {savingPaymentQr ? 'Saving...' : paymentDraftDirty ? 'Some account changes are unsaved' : 'Payment accounts saved'}
            </span>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
              <button onClick={addPaymentAccount} style={{border:'1.5px solid #023c62',background:'#fff',color:'#023c62',borderRadius:10,padding:'8px 12px',fontSize:12,fontWeight:800,cursor:'pointer'}}>
                Add Account
              </button>
            </div>
          </div>
              </>
            )
          })()}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 10 }}>
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
                <span style={{ fontSize: 12, color: savingFields ? '#92400e' : '#15803d', marginLeft: 10, fontWeight: 700 }}>
                  {savingFields ? 'Auto-saving...' : 'Auto-saved'}
                </span>
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
            {type === 'label' && <span>Will print <strong style={{ color: '#023c62' }}>{garmentCount} numbered received labels</strong> at {labelSize.w}×{labelSize.h}mm.</span>}
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
