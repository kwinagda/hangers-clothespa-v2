import { API_BASE_URL } from '@/lib/api'

const invoicePdfUrl = (invoiceId: string, download = false) =>
  `${API_BASE_URL}/payments/invoice/${encodeURIComponent(invoiceId)}/pdf${download ? '?download=1' : ''}`

const fetchInvoicePdf = async (invoiceId: string, download = false) => {
  const response = await fetch(invoicePdfUrl(invoiceId, download), { credentials: 'include', cache: 'no-store' })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message || `Invoice PDF request failed (${response.status})`)
  }
  return response.blob()
}

export const viewInvoicePdf = async (invoiceId: string) => {
  const popup = window.open('', `hangers-invoice-${invoiceId}`)
  if (!popup) throw new Error('Pop-up blocked. Allow pop-ups for CRM invoice viewing.')
  popup.opener = null
  try {
    const blob = await fetchInvoicePdf(invoiceId)
    const url = URL.createObjectURL(blob)
    popup.location.href = url
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    popup.close()
    throw error
  }
}

export const downloadInvoicePdf = async (invoiceId: string, invoiceNumber?: string) => {
  const blob = await fetchInvoicePdf(invoiceId, true)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${invoiceNumber || 'invoice'}.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
