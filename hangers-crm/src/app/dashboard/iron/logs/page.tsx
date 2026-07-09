'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { ironAPI } from '@/lib/api'
import IronSectionTabs from '../_components/IronSectionTabs'
import { PageHeader } from '@/components/ui'
import { InlineLoader, SkeletonCard, TableLoader } from '@/components/ui/Feedback'
import { PaginationControls } from '@/components/ui/PaginationControls'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

export default function IronLogsPage() {
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [payload, setPayload] = useState<any>(null)
  const [summaryPage, setSummaryPage] = useState(1)
  const [logPage, setLogPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const load = useCallback(async (date: string) => {
    setLoading(true)
    try {
      const response = await ironAPI.listLogs({ date })
      setPayload(response?.data || null)
    } catch {
      toast.error('Failed to load Daily Iron logs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(selectedDate) }, [load, selectedDate])
  useEffect(() => { setSummaryPage(1); setLogPage(1) }, [selectedDate, pageSize, payload])

  const customerSummaries = useMemo(() => asArray(payload, ['customers', 'summaries', 'items']), [payload])
  const logs = useMemo(() => asArray(payload, ['logs', 'items']), [payload])
  const summary = payload?.summary || {}
  const pagedCustomerSummaries = useMemo(
    () => customerSummaries.slice((summaryPage - 1) * pageSize, summaryPage * pageSize),
    [customerSummaries, summaryPage, pageSize]
  )
  const pagedLogs = useMemo(
    () => logs.slice((logPage - 1) * pageSize, logPage * pageSize),
    [logs, logPage, pageSize]
  )

  return (
    <div style={{ padding:'32px 36px', maxWidth:1280, margin:'0 auto', fontFamily:"var(--crm-font-ui)" }}>
      <PageHeader
        title="Iron Logs"
        subtitle="Daily Iron service usage log per customer"
        actions={<div style={{display:'flex',gap:10,alignItems:'center'}}>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{border:'1px solid #dce8f0',borderRadius:12,padding:'10px 14px',fontSize:14,color:'#023c62',background:'#fff'}} />
          <button onClick={() => load(selectedDate)} style={{background:'#fff',border:'1px solid #dce8f0',borderRadius:12,padding:'10px 16px',color:'#023c62',fontWeight:700,cursor:'pointer'}}>Refresh</button>
        </div>}
      />

      <IronSectionTabs />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Customers Logged', value: summary.activeCustomers ?? '—', color:'#023c62' },
          { label:'Entries', value: summary.totalLogs ?? '—', color:'#035a8f' },
          { label:'Pieces', value: summary.totalPieces ?? '—', color:'#166534' },
          { label:'Open Logs', value: summary.openLogs ?? '—', color:'#b35a00' },
          { label:'Estimated Value', value: loading ? '—' : fmt(summary.totalAmount || 0), color:'#6d28d9' },
        ].map((item) => (
          <div key={item.label} className="crm-surface crm-card-hover" style={{ borderRadius:16, padding:'18px 20px' }}>
            <div style={{ fontSize:11, color:'#6b7fa3', letterSpacing:'0.06em', textTransform:'uppercase' as const, marginBottom:6 }}>{item.label}</div>
            <div style={{ fontFamily:"var(--crm-font-ui)", fontWeight:800, fontSize:28, color:item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'0.95fr 1.05fr', gap:16 }}>
        <div className="crm-surface crm-card-hover" style={{ borderRadius:20, overflow:'hidden' }}>
          <div style={{ padding:'18px 20px', borderBottom:'1px solid #e8f0f7', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontWeight:700, color:'#023c62' }}>Customer Summary</div>
              <div style={{ fontSize:12, color:'#6b7fa3', marginTop:3 }}>Per-customer daily totals for {format(new Date(selectedDate), 'dd MMM yyyy')}.</div>
            </div>
            <Link href="/dashboard/customers" style={{ fontSize:12, color:'#035a8f', fontWeight:600, textDecoration:'none' }}>Open customers →</Link>
          </div>
          {loading ? (
            <TableLoader rows={5} columns={4} />
          ) : !customerSummaries.length ? (
            <div style={{ padding:36, textAlign:'center', color:'#9dafc8' }}>{loading ? 'Loading summaries…' : 'No Daily Iron logs for this date.'}</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f7f9fc' }}>
                  {['Customer', 'Pieces', 'Value', 'Status'].map((heading) => (
                    <th key={heading} style={{ padding:'11px 16px', textAlign:'left', fontSize:11, color:'#6b7fa3', fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.08em', borderBottom:'1px solid #e8f0f7' }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedCustomerSummaries.map((item: any) => (
                  <tr key={item.customerId} className="crm-table-row" style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'13px 16px' }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#023c62', marginBottom:2 }}>{item.name}</div>
                      <div style={{ fontSize:12, color:'#6b7fa3' }}>+91 {item.phone}</div>
                      <Link href={`/dashboard/customers/${item.customerId}?tab=iron`} style={{ fontSize:12, color:'#035a8f', textDecoration:'none' }}>Open customer →</Link>
                    </td>
                    <td style={{ padding:'13px 16px', fontSize:14, fontWeight:700, color:'#166534' }}>{item.totalPieces}</td>
                    <td style={{ padding:'13px 16px', fontSize:14, fontWeight:700, color:'#6d28d9' }}>{fmt(item.totalAmount)}</td>
                    <td style={{ padding:'13px 16px', fontSize:12, color:'#6b7fa3' }}>{item.ironSubStatus || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ padding:'0 20px 18px' }}>
            <PaginationControls
              page={summaryPage}
              pageSize={pageSize}
              totalItems={customerSummaries.length}
              itemLabel="customer summaries"
              onPageChange={setSummaryPage}
              onPageSizeChange={(size) => { setPageSize(size); setSummaryPage(1) }}
              pageSizeOptions={[5, 10, 20, 30]}
            />
          </div>
        </div>

        <div className="crm-surface crm-card-hover" style={{ borderRadius:20, overflow:'hidden' }}>
          <div style={{ padding:'18px 20px', borderBottom:'1px solid #e8f0f7' }}>
            <div style={{ fontWeight:700, color:'#023c62' }}>Daily Log Feed</div>
            <div style={{ fontSize:12, color:'#6b7fa3', marginTop:3 }}>Every Daily Iron log captured on {format(new Date(selectedDate), 'dd MMM yyyy')}.</div>
          </div>
          {loading ? (
            <TableLoader rows={6} columns={6} />
          ) : !logs.length ? (
            <div style={{ padding:36, textAlign:'center', color:'#9dafc8' }}>{loading ? 'Loading logs…' : 'No log entries found for this date.'}</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f7f9fc' }}>
                  {['Time', 'Customer', 'Garment', 'Pieces', 'Amount', 'Bill'].map((heading) => (
                    <th key={heading} style={{ padding:'11px 16px', textAlign:'left', fontSize:11, color:'#6b7fa3', fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.08em', borderBottom:'1px solid #e8f0f7' }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map((log: any) => (
                  <tr key={log.id} className="crm-table-row" style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'13px 16px', fontSize:12, color:'#6b7fa3' }}>{format(new Date(log.createdAt), 'h:mm a')}</td>
                    <td style={{ padding:'13px 16px' }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#023c62' }}>{log.customer?.name || 'Unnamed Customer'}</div>
                      <div style={{ fontSize:11, color:'#9dafc8' }}>+91 {log.customer?.phone}</div>
                    </td>
                    <td style={{ padding:'13px 16px', fontSize:13, color:'#1a2332' }}>{log.serviceName}</td>
                    <td style={{ padding:'13px 16px', fontSize:13, fontWeight:700, color:'#166534' }}>{log.pieces}</td>
                    <td style={{ padding:'13px 16px', fontSize:13, fontWeight:700, color:'#6d28d9' }}>{fmt(log.amount)}</td>
                    <td style={{ padding:'13px 16px', fontSize:12, color:'#6b7fa3' }}>{log.bill?.billNumber || 'Open'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ padding:'0 20px 18px' }}>
            <PaginationControls
              page={logPage}
              pageSize={pageSize}
              totalItems={logs.length}
              itemLabel="log entries"
              onPageChange={setLogPage}
              onPageSizeChange={(size) => { setPageSize(size); setLogPage(1) }}
              pageSizeOptions={[5, 10, 20, 30]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
