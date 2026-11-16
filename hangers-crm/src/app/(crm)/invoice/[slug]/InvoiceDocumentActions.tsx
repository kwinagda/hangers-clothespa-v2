'use client'

import { Download, Printer } from 'lucide-react'

export default function InvoiceDocumentActions({ pdfUrl }: { pdfUrl?: string }) {
  return (
    <div className="invoice-document-actions" aria-label="Invoice document actions">
      <button type="button" onClick={() => window.print()}>
        <Printer size={15} aria-hidden="true" /> Print
      </button>
      {pdfUrl && <a href={`${pdfUrl}${pdfUrl.includes('?') ? '&' : '?'}download=1`}>
        <Download size={15} aria-hidden="true" /> PDF
      </a>}
    </div>
  )
}
