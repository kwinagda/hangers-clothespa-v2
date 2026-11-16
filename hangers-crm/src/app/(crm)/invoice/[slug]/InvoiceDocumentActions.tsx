'use client'

import { Download, Printer } from 'lucide-react'

export default function InvoiceDocumentActions({ pdfUrl }: { pdfUrl?: string }) {
  return (
    <div className="invoice-document-actions" aria-label="Invoice document actions">
      <button type="button" onClick={() => window.print()}>
        <Printer size={16} aria-hidden="true" /> Print invoice
      </button>
      {pdfUrl && <a href={`${pdfUrl}${pdfUrl.includes('?') ? '&' : '?'}download=1`}>
        <Download size={16} aria-hidden="true" /> Download PDF
      </a>}
    </div>
  )
}
