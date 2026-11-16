import { API_BASE_URL } from '@/lib/api'

const getInvoiceDocumentLink = async (invoiceId: string) => {
  const response = await fetch(`${API_BASE_URL}/payments/invoice/${encodeURIComponent(invoiceId)}/share`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message || `Invoice document request failed (${response.status})`)
  }
  const payload = await response.json()
  const document = payload?.data || payload
  if (!document?.path || !document?.pdfPath) throw new Error('Invoice document link is unavailable')
  return {
    pageUrl: new URL(document.path, window.location.origin).toString(),
    pdfUrl: `${API_BASE_URL}${document.pdfPath}?download=1`,
  }
}

export const viewInvoicePdf = async (invoiceId: string) => {
  const popup = window.open('', `hangers-invoice-${invoiceId}`)
  if (!popup) throw new Error('Pop-up blocked. Allow pop-ups for CRM invoice viewing.')
  popup.opener = null
  try {
    const invoiceLink = await getInvoiceDocumentLink(invoiceId)
    popup.location.href = invoiceLink.pageUrl
  } catch (error) {
    popup.close()
    throw error
  }
}

export const downloadInvoicePdf = async (invoiceId: string, invoiceNumber?: string) => {
  const invoiceLink = await getInvoiceDocumentLink(invoiceId)
  const response = await fetch(invoiceLink.pdfUrl, { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw new Error(`Invoice PDF request failed (${response.status})`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${invoiceNumber || 'invoice'}.pdf`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
