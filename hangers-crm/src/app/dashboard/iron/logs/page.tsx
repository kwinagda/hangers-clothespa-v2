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
  const [correctingLog, setCorrectingLog] = useState<any>(null)
  const [correctionPieces, setCorrectionPieces] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionSaving, setCorrectionSaving] = useState(false)

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

  const openCorrection = (log: any) => {
    if (log.billId || log.bill?.billNumber) {
      toast.error('This Daily Iron log is already billed. Use bill correction/void-rebill.')
      return
    }
    setCorrectingLog(log)
    setCorrectionPieces(String(log.pieces || ''))
    setCorrectionReason('')
  }

  const submitCorrection = async () => {
    if (!correctingLog || correctionSaving) return
    const pieces = Number(correctionPieces)
    if (!Number.isInteger(pieces) || pieces <= 0) {
      toast.error('Enter a valid quantity')
      return
    }
    if (correctionReason.trim().length < 3) {
      toast.error('Correction reason is required')
      return
    }
    setCorrectionSaving(true)
    try {
      await ironAPI.correctLog(correctingLog.id, {
        pieces,
        reason: correctionReason.trim(),
        notes: correctingLog.notes || undefined,
      })
      toast.success('Daily Iron log corrected')
      setCorrectingLog(null)
      setCorrectionPieces('')
      setCorrectionReason('')
      await load(selectedDate)
    } catch (err: any) {
      toast.error(err.message || 'Failed to correct Daily Iron log')
    } finally {
      setCorrectionSaving(false)
    }
  }

  return (
    <div className="iron-logs-page" style={{ padding:'30px 36px 60px', maxWidth:1360, margin:'0 auto', fontFamily:"var(--crm-font-ui)" }}>
      <PageHeader
        title="Iron Logs"
        subtitle="Daily Iron service usage log per customer"
        actions={<div style={{display:'flex',gap:10,alignItems:'center'}}>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{border:'1px solid #dce8f0',borderRadius:12,padding:'10px 14px',fontSize:14,color:'#023c62',background:'#fff'}} />
          <button onClick={() => load(selectedDate)} style={{background:'#fff',border:'1px solid #dce8f0',borderRadius:12,padding:'10px 16px',color:'#023c62',fontWeight:700,cursor:'pointer'}}>Refresh</button>
        </div>}
      />

      <IronSectionTabs />

      <div className="iron-logs-metrics" style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Customers Logged', value: summary.activeCustomers ?? '—', color:'#023c62' },
          { label:'Entries', value: summary.totalLogs ?? '—', color:'#035a8f' },
          { label:'Pieces', value: summary.totalPieces ?? '—', color:'#166534' },
          { label:'Open Logs', value: summary.openLogs ?? '—', color:'#b35a00' },
          { label:'Estimated Value', value: loading ? '—' : fmt(summary.totalAmount || 0), color:'#6d28d9' },
        ].map((item) => (
          <div key={item.label} style={{ background:'#fff', borderRadius:14, border:'1px solid #e3edf6', padding:'18px 20px' }}>
            <div style={{ fontSize:11, color:'#6b7fa3', letterSpacing:'0.06em', textTransform:'uppercase' as const, marginBottom:6 }}>{item.label}</div>
            <div style={{ fontFamily:"var(--crm-font-ui)", fontWeight:800, fontSize:28, color:item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="iron-logs-layout" style={{ display:'grid', gridTemplateColumns:'0.95fr 1.05fr', gap:16 }}>
        <div style={{ background:'#fff', border:'1px solid #e3edf6', borderRadius:14, overflow:'hidden' }}>
          <div className="iron-logs-section-head" style={{ padding:'18px 20px', borderBottom:'1px solid #e8f0f7', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
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
                    <th key={heading} style={{ padding:'11px 18px', textAlign:'left', fontSize:10.5, color:'#6b7fa3', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.07em', borderBottom:'1px solid #e8f0f7', background:'#f7f9fc' }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedCustomerSummaries.map((item: any) => (
                  <tr key={item.customerId} className="crm-table-row" style={{ borderBottom:'1px solid #eef4f8' }}>
                    <td style={{ padding:'13px 18px', fontSize:13.5 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#023c62', marginBottom:2 }}>{item.name}</div>
                      <div style={{ fontSize:12, color:'#6b7fa3' }}>+91 {item.phone}</div>
                      <Link href={`/dashboard/customers/${item.customerId}?tab=iron`} style={{ fontSize:12, color:'#035a8f', textDecoration:'none' }}>Open customer →</Link>
                    </td>
                    <td style={{ padding:'13px 16px', fontSize:14, fontWeight:700, color:'#166534' }}>{item.totalPieces}</td>
                    <td style={{ padding:'13px 16px', fontSize:14, fontWeight:700, color:'#6d28d9' }}>{fmt(item.totalAmount)}</td>
                    <td style={{ padding:'13px 18px', fontSize:13.5, color:'#6b7fa3' }}>{item.ironSubStatus || '—'}</td>
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

        <div style={{ background:'#fff', border:'1px solid #e3edf6', borderRadius:14, overflow:'hidden' }}>
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
                  {['Time', 'Customer', 'Garment', 'Pieces', 'Amount', 'Bill', 'Action'].map((heading) => (
                    <th key={heading} style={{ padding:'11px 18px', textAlign:'left', fontSize:10.5, color:'#6b7fa3', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.07em', borderBottom:'1px solid #e8f0f7', background:'#f7f9fc' }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map((log: any) => (
                  <tr key={log.id} className="crm-table-row" style={{ borderBottom:'1px solid #eef4f8' }}>
                    <td style={{ padding:'13px 18px', fontSize:13.5, color:'#6b7fa3' }}>{format(new Date(log.createdAt), 'h:mm a')}</td>
                    <td style={{ padding:'13px 18px', fontSize:13.5 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#023c62' }}>{log.customer?.name || 'Unnamed Customer'}</div>
                      <div style={{ fontSize:11, color:'#9dafc8' }}>+91 {log.customer?.phone}</div>
                    </td>
                    <td style={{ padding:'13px 16px', fontSize:13, color:'#1a2332' }}>{log.serviceName}</td>
                    <td style={{ padding:'13px 16px', fontSize:13, fontWeight:700, color:'#166534' }}>{log.pieces}</td>
                    <td style={{ padding:'13px 16px', fontSize:13, fontWeight:700, color:'#6d28d9' }}>{fmt(log.amount)}</td>
                    <td style={{ padding:'13px 18px', fontSize:13.5, color:'#6b7fa3' }}>{log.bill?.billNumber || 'Open'}</td>
                    <td style={{ padding:'13px 18px', fontSize:13.5 }}>
                      <button
                        onClick={() => openCorrection(log)}
                        disabled={Boolean(log.billId || log.bill?.billNumber)}
                        title={log.billId || log.bill?.billNumber ? 'Billed logs are locked' : 'Correct typo quantity'}
                        style={{
                          border:'1px solid #d8e6f0',
                          background: log.billId || log.bill?.billNumber ? '#f5f8fb' : '#fff',
                          color: log.billId || log.bill?.billNumber ? '#9dafc8' : '#023c62',
                          borderRadius:8,
                          padding:'7px 10px',
                          fontSize:12,
                          fontWeight:800,
                          cursor: log.billId || log.bill?.billNumber ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Correct
                      </button>
                    </td>
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
      {correctingLog && (
        <div style={{ position:'fixed', inset:0, background:'rgba(2,20,34,0.38)', zIndex:80, display:'grid', placeItems:'center', padding:20 }}>
          <div style={{ width:'min(520px, 100%)', background:'#fff', borderRadius:14, border:'1px solid #dce8f0', boxShadow:'0 24px 70px rgba(2,60,98,0.24)', overflow:'hidden' }}>
            <div style={{ padding:'18px 20px', borderBottom:'1px solid #e8f0f7' }}>
              <div style={{ fontWeight:900, color:'#023c62', fontSize:18 }}>Correct Daily Iron Log</div>
              <div style={{ marginTop:4, color:'#6b7fa3', fontSize:13 }}>
                {correctingLog.customer?.name || 'Customer'} · {correctingLog.serviceName} · current {correctingLog.pieces} pcs
              </div>
            </div>
            <div style={{ padding:20, display:'grid', gap:14 }}>
              <label style={{ display:'grid', gap:6, color:'#52657f', fontSize:12, fontWeight:800 }}>
                Correct quantity
                <input
                  inputMode="numeric"
                  value={correctionPieces}
                  onChange={(event) => setCorrectionPieces(event.target.value.replace(/\D/g, '').slice(0, 3))}
                  style={{ border:'1px solid #d8e6f0', borderRadius:10, padding:'10px 12px', fontSize:16, fontWeight:900, color:'#023c62', outline:'none' }}
                />
              </label>
              <label style={{ display:'grid', gap:6, color:'#52657f', fontSize:12, fontWeight:800 }}>
                Reason
                <textarea
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value.slice(0, 180))}
                  placeholder="Example: Qty entered as 12 instead of 2"
                  rows={3}
                  style={{ border:'1px solid #d8e6f0', borderRadius:10, padding:'10px 12px', fontSize:14, color:'#142033', outline:'none', resize:'vertical' }}
                />
              </label>
              <div style={{ background:'#f8fbfd', border:'1px solid #e3edf6', borderRadius:10, padding:'10px 12px', color:'#6b7fa3', fontSize:12, lineHeight:1.5 }}>
                This keeps the same log record, recalculates the amount, writes an audit log, and sends the normal Daily Iron WhatsApp log again.
              </div>
            </div>
            <div style={{ padding:'14px 20px', borderTop:'1px solid #e8f0f7', display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => setCorrectingLog(null)} disabled={correctionSaving} style={{ border:'1px solid #d8e6f0', background:'#fff', color:'#52657f', borderRadius:9, padding:'9px 13px', fontWeight:800, cursor:'pointer' }}>Cancel</button>
              <button onClick={submitCorrection} disabled={correctionSaving} style={{ border:'none', background: correctionSaving ? '#9dafc8' : '#023c62', color:'#fff', borderRadius:9, padding:'9px 14px', fontWeight:900, cursor: correctionSaving ? 'not-allowed' : 'pointer' }}>{correctionSaving ? 'Saving...' : 'Save correction'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
