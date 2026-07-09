'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { FileDown, FileText, Plus, RefreshCw, Share2 } from 'lucide-react'
import { metadataAPI, quotationsAPI } from '@/lib/api'
import { PageHeader, Button, Badge } from '@/components/ui'
import { PaginationControls } from '@/components/ui/PaginationControls'

const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [statusOptions, setStatusOptions] = useState<Array<{ value: string; label: string }>>([{ value: '', label: 'All Statuses' }])
  const [statusStyles, setStatusStyles] = useState<Record<string, { bg: string; color: string }>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await quotationsAPI.list({ page, limit: pageSize, search: search || undefined, quotationStatus: status || undefined })
      setQuotations(r.data?.quotations || r.quotations || [])
      setTotal(r.data?.pagination?.total || 0)
    } catch {
      toast.error('Failed to load quotations')
    }
    setLoading(false)
  }, [page, pageSize, search, status])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    metadataAPI.getAll().then((r: any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      const quotationStatuses = metadata.quotationStatuses || []
      setStatusOptions([{ value: '', label: 'All Statuses' }, ...quotationStatuses.map((item: any) => ({ value: item.value, label: item.label }))])
      setStatusStyles(Object.fromEntries(quotationStatuses.map((item: any) => [item.value, { bg: item.bg || '#f4f7fb', color: item.color || '#023c62' }])))
    }).catch(() => toast.error('Failed to load quotation metadata'))
  }, [])

  const updateStatus = async (quotationId: string, quotationStatus: string) => {
    setBusyId(quotationId)
    try {
      await quotationsAPI.updateStatus(quotationId, quotationStatus)
      toast.success('Quotation status updated')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update quotation')
    }
    setBusyId('')
  }

  const convertQuotation = async (quotationId: string) => {
    setBusyId(quotationId)
    try {
      const r = await quotationsAPI.convert(quotationId)
      const order = r.data?.order || r.order
      toast.success(`Converted to order ${order?.orderNumber || ''}`.trim())
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to convert quotation')
    }
    setBusyId('')
  }

  const openQuotationPdf = async (quotation: any) => {
    setBusyId(`pdf:${quotation.id}`)
    try {
      const url = quotationsAPI.pdfUrl(quotation.id)
      const win = window.open(url, '_blank', 'noopener,noreferrer')
      if (!win) {
        throw new Error('Popup blocked. Allow popups to open the quotation PDF.')
      }
      toast.success('Quotation PDF opened')
    } catch (e: any) {
      toast.error(e.message || 'Failed to open quotation PDF')
    } finally {
      setBusyId('')
    }
  }

  const shareQuotation = async (quotation: any) => {
    const validUntil = quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('en-IN') : 'Open'
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const quoteUrl = `${origin}/dashboard/quotations/print?quotationId=${quotation.id}`
    const shareText = [
      `Quotation ${quotation.orderNumber}`,
      `Customer: ${quotation.customer?.name || quotation.customer?.phone || 'Customer'}`,
      `Amount: ${fmt(quotation.totalAmount || 0)}`,
      `Valid Until: ${validUntil}`,
      quoteUrl,
    ].join('\n')

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `Quotation ${quotation.orderNumber}`,
          text: shareText,
          url: quoteUrl,
        })
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText)
        toast.success('Quotation share text copied')
        return
      } else {
        throw new Error('Share is not available in this browser')
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      toast.error(e.message || 'Failed to share quotation')
    }
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1320, margin: '0 auto', fontFamily: 'var(--crm-font-ui)' }}>
      <PageHeader
        title="Quotations"
        subtitle="Estimates for customers before an order is confirmed"
        actions={<Link href="/dashboard/orders/new?mode=quotation" style={{display:'inline-flex',alignItems:'center',gap:8,padding:'9px 18px',borderRadius:10,background:'#1a3c5e',color:'#fff',textDecoration:'none',fontSize:13,fontWeight:700}}><Plus size={14}/> New Quotation</Link>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search quotation no, customer, phone..."
          style={{ minWidth: 260, flex: 1, maxWidth: 420, border: '1px solid #dce8f0', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none' }}
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          style={{ border: '1px solid #dce8f0', borderRadius: 10, padding: '10px 14px', fontSize: 13, background: '#fff' }}
        >
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid #dce8f0', background: '#fff', cursor: 'pointer' }}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e4edf5', boxShadow: '0 10px 26px rgba(2,60,98,0.05)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#6b7fa3' }}>Loading quotations...</div>
        ) : !quotations.length ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#6b7fa3' }}>
            <FileText size={34} style={{ marginBottom: 10 }} />
            <div>No quotations found.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Quotation', 'Customer', 'Amount', 'Valid Until', 'Status', 'Actions'].map((label) => (
                  <th key={label} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#8aa0ba', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #e8f0f7' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotations.map((quotation: any) => {
                const style = statusStyles[quotation.quotationStatus || 'DRAFT'] || { bg: '#f4f7fb', color: '#023c62' }
                return (
                  <tr key={quotation.id}>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #eef3f8' }}>
                      <div style={{ fontWeight: 700, color: '#023c62' }}>{quotation.orderNumber}</div>
                      <div style={{ fontSize: 11, color: '#8aa0ba' }}>{quotation.createdAt ? new Date(quotation.createdAt).toLocaleDateString('en-IN') : '—'}</div>
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #eef3f8' }}>
                      <div style={{ fontWeight: 600, color: '#182538' }}>{quotation.customer?.name || 'Unknown'}</div>
                      <div style={{ fontSize: 12, color: '#6b7fa3' }}>{quotation.customer?.phone}</div>
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #eef3f8', fontWeight: 700, color: '#182538' }}>{fmt(quotation.totalAmount)}</td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #eef3f8', color: '#53657d' }}>{quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('en-IN') : '—'}</td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #eef3f8' }}>
                      <select
                        value={quotation.quotationStatus || 'DRAFT'}
                        onChange={(e) => updateStatus(quotation.id, e.target.value)}
                        disabled={busyId === quotation.id || quotation.quotationStatus === 'CONVERTED'}
                        style={{ border: 'none', borderRadius: 999, padding: '6px 10px', background: style.bg, color: style.color, fontWeight: 700, fontSize: 12 }}
                      >
                        {statusOptions.filter((option) => option.value).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #eef3f8' }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Link href={'/dashboard/orders/new?mode=quotation' + '&quotationId=' + quotation.id} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #dce8f0', color: '#023c62', textDecoration: 'none', fontWeight: 600 }}>
                          Edit
                        </Link>
                        <button onClick={() => openQuotationPdf(quotation)} disabled={busyId === `pdf:${quotation.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid #dce8f0', background: '#fff', color: '#023c62', fontWeight: 600, cursor: 'pointer', opacity: busyId === `pdf:${quotation.id}` ? 0.6 : 1 }}>
                          <FileDown size={14} />
                          {busyId === `pdf:${quotation.id}` ? 'Opening...' : 'PDF'}
                        </button>
                        <button
                          onClick={() => shareQuotation(quotation)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid #dce8f0', background: '#fff', color: '#023c62', fontWeight: 600, cursor: 'pointer' }}
                        >
                          <Share2 size={14} />
                          Share
                        </button>
                        {quotation.quotationStatus !== 'CONVERTED' && (
                          <button
                            onClick={() => convertQuotation(quotation.id)}
                            disabled={busyId === quotation.id}
                            style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#023c62', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: busyId === quotation.id ? 0.6 : 1 }}
                          >
                            {busyId === quotation.id ? 'Converting...' : 'Convert to Order'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <PaginationControls
          page={page}
          pageSize={pageSize}
          totalItems={total}
          itemLabel="quotations"
          onPageChange={setPage}
          onPageSizeChange={(next) => { setPageSize(next); setPage(1) }}
        />
      </div>
    </div>
  )
}
