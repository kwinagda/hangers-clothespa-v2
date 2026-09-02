'use client'
import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { AlertTriangle, BarChart3, CalendarDays, CreditCard, Landmark, Loader2, MessageCircle, Smartphone, Tag, WalletCards } from 'lucide-react'
import api, { idempotencyConfig, metadataAPI } from '@/lib/api'
import { PageHeader } from '@/components/ui'
import { PaginationControls } from '@/components/ui/PaginationControls'

const METHOD_ICON = {CASH:Landmark,UPI:Smartphone,CARD:CreditCard,RAZORPAY:WalletCards,ONLINE:WalletCards,COD:Landmark,WALLET:WalletCards,OTHER:Tag,ALL:BarChart3}
const METHOD_COLOR: Record<string,string> = {CASH:'#22c55e',UPI:'#3b82f6',CARD:'#8b5cf6',RAZORPAY:'#f97316',ONLINE:'#0ea5e9',COD:'#14b8a6',WALLET:'#6366f1',OTHER:'#6b7fa3'}
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}
const paymentSourceNumber = (payment: any) => {
  const invoice = payment.allocations?.[0]?.invoice
  return payment.order?.orderNumber
    || invoice?.ironBill?.billNumber
    || invoice?.serviceAppointment?.appointmentNumber
    || invoice?.invoiceNumber
    || '—'
}
const paymentCustomerName = (payment: any) =>
  payment.order?.customer?.name
  || payment.customer?.name
  || (payment.order?.customer?.phone ? `+91 ${payment.order.customer.phone}` : '')
  || (payment.customer?.phone ? `+91 ${payment.customer.phone}` : '—')

export default function FinancePage() {
  const [tab, setTab] = useState<'daily'|'receivables'>('daily')
  const [date, setDate] = useState(format(new Date(),'yyyy-MM-dd'))
  const [summary, setSummary] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [receivables, setReceivables] = useState<any[]>([])
  const [receivableGroups, setReceivableGroups] = useState<any[]>([])
  const [receivableTotal, setReceivableTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterMethod, setFilterMethod] = useState('ALL')
  const [methodOptions, setMethodOptions] = useState<Array<{ value: string; label: string }>>([])
  const [methodLabels, setMethodLabels] = useState<Record<string, string>>({ ALL: 'ALL' })
  const [paymentStatusMeta, setPaymentStatusMeta] = useState<Record<string, { label: string; color: string; bg: string }>>({})
  const [dailyPage, setDailyPage] = useState(1)
  const [receivablesPage, setReceivablesPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedReceivables, setSelectedReceivables] = useState<Record<string, string[]>>({})
  const [arReminder, setArReminder] = useState<{ open: boolean; group: any | null; confirm: boolean }>({ open: false, group: null, confirm: false })
  const [arPreview, setArPreview] = useState<any>(null)
  const [arPreviewLoading, setArPreviewLoading] = useState(false)
  const [arSending, setArSending] = useState(false)

  const loadDaily = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`/payments/daily?date=${date}`)
      setSummary(r.data?.summary || {})
      setPayments(asArray(r.data, ['payments', 'items']))
    } catch { toast.error('Failed to load finance data') }
    finally { setLoading(false) }
  }, [date])

  const loadReceivables = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/payments/receivables')
      setReceivables(asArray(r.data, ['orders', 'receivables', 'items']))
      setReceivableGroups(asArray(r.data, ['customerGroups', 'groups']))
      setReceivableTotal(r.data?.total || 0)
    } catch { toast.error('Failed to load receivables') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (tab === 'daily') loadDaily(); else loadReceivables() }, [tab, loadDaily, loadReceivables])
  useEffect(() => {
    metadataAPI.getAll().then((r:any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      const filteredMethods = (metadata.paymentMethods || []).filter((item:any) => item.value && item.value !== 'SPLIT' && item.value !== 'Pay Later')
      setMethodOptions(filteredMethods)
      setMethodLabels({
        ALL: 'ALL',
        ...Object.fromEntries(filteredMethods.map((item: any) => [item.value, item.label || item.value])),
      })
      setPaymentStatusMeta(Object.fromEntries((metadata.paymentStatuses || []).map((item: any) => [item.value, { label: item.label || item.value, color: item.color || '#023c62', bg: item.bg || '#f4f7fb' }])))
    }).catch(() => {
      toast.error('Failed to load finance metadata')
    })
  }, [])

  const filtered = filterMethod === 'ALL' ? payments : payments.filter(p => p.method === filterMethod)
  const pagedPayments = filtered.slice((dailyPage - 1) * pageSize, dailyPage * pageSize)
  const pagedReceivableGroups = receivableGroups.slice((receivablesPage - 1) * pageSize, receivablesPage * pageSize)

  const S = (v: number) => `₹${(v||0).toLocaleString('en-IN')}`
  const groupKey = (group: any) => group?.customer?.id || group?.customer?.phone || group?.customer?.name || 'unknown'
  const selectedForGroup = (group: any) => {
    const key = groupKey(group)
    const selected = selectedReceivables[key]
    const ids = (group?.receivables || []).map((item: any) => item.invoiceId).filter(Boolean)
    return selected && selected.length ? selected : ids
  }
  const selectedTotalForGroup = (group: any) => {
    const selected = new Set(selectedForGroup(group))
    return (group?.receivables || []).reduce((sum: number, item: any) => selected.has(item.invoiceId) ? sum + Number(item.balance || item.balanceDue || 0) : sum, 0)
  }
  const toggleGroupSelection = (group: any, invoiceId: string) => {
    const key = groupKey(group)
    const allIds: string[] = (group?.receivables || []).map((item: any) => item.invoiceId).filter(Boolean)
    const current = selectedReceivables[key] && selectedReceivables[key].length ? selectedReceivables[key] : allIds
    const next = current.includes(invoiceId) ? current.filter((id: string) => id !== invoiceId) : [...current, invoiceId]
    setSelectedReceivables((prev) => ({ ...prev, [key]: next }))
  }
  const setGroupSelection = (group: any, checked: boolean) => {
    const key = groupKey(group)
    const allIds = (group?.receivables || []).map((item: any) => item.invoiceId).filter(Boolean)
    setSelectedReceivables((prev) => ({ ...prev, [key]: checked ? allIds : [] }))
  }
  const openArReminder = async (group: any) => {
    const invoiceIds = selectedForGroup(group)
    if (!invoiceIds.length) {
      toast.error('Select at least one bill/order')
      return
    }
    setArReminder({ open: true, group, confirm: false })
    setArPreview(null)
    setArPreviewLoading(true)
    try {
      const r = await api.post('/payments/receivables/reminders/preview', { customerId: group.customer?.id, invoiceIds })
      setArPreview(r.data || r)
    } catch (e: any) {
      setArPreview({ error: e?.message || 'Failed to load reminder preview' })
    } finally {
      setArPreviewLoading(false)
    }
  }
  const sendArReminder = async () => {
    if (!arReminder.group || !arReminder.confirm) return
    const invoiceIds = selectedForGroup(arReminder.group)
    setArSending(true)
    try {
      await api.post('/payments/receivables/reminders/send', { customerId: arReminder.group.customer?.id, invoiceIds }, idempotencyConfig('ar-reminder-send'))
      toast.success('Outstanding reminder sent')
      setArReminder({ open: false, group: null, confirm: false })
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send reminder')
    } finally {
      setArSending(false)
    }
  }
  const methodTotals = summary?.byMethod || {}
  const summaryMethods = methodOptions.filter((method) => Number(methodTotals[method.value] || 0) > 0)
  const summaryCards = [
    { value: 'TOTAL', label: 'Total Collected', amount: summary?.total || 0, color: '#023c62', big: true },
    ...summaryMethods.map((method) => ({
      value: method.value,
      label: method.label,
      amount: methodTotals[method.value] || 0,
      color: METHOD_COLOR[method.value] || '#6b7fa3',
      big: false,
    })),
  ]

  return (
    <div className="finance-page" style={{padding:'30px 36px 60px',maxWidth:1360,margin:'0 auto',fontFamily:"var(--crm-font-ui)"}}>
      <PageHeader title="Finance" subtitle="Collections, outstanding balances and payment activity" />

      {/* Tabs */}
      <div className="finance-tabs" style={{display:'flex',gap:8,marginBottom:24}}>
        {[{k:'daily',l:'Daily Register',Icon:CalendarDays},{k:'receivables',l:'Accounts Receivable',Icon:AlertTriangle}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k as any)}
            style={{padding:'10px 20px',borderRadius:10,border:`1.5px solid ${tab===t.k?'#023c62':'#dce8f0'}`,background:tab===t.k?'#023c62':'#fff',color:tab===t.k?'#fff':'#6b7fa3',fontWeight:600,cursor:'pointer',fontSize:14,display:'inline-flex',alignItems:'center',gap:8}}>
            <t.Icon size={16} />
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'daily' && (
        <>
          {/* Date picker + summary cards */}
          <div className="finance-date-tools" style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{border:'1.5px solid #dce8f0',borderRadius:10,padding:'9px 14px',fontSize:14,color:'#023c62',fontWeight:600,outline:'none'}}/>
            <button onClick={loadDaily} style={{background:'#023c62',color:'#fff',border:'none',borderRadius:10,padding:'10px 16px',fontWeight:600,cursor:'pointer',fontSize:14}}>Refresh</button>
          </div>

          {summary && (
            <div className="finance-summary-cards" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:14,marginBottom:24}}>
              {summaryCards.map(card=>(
                <div key={card.value} style={{background:card.big?'linear-gradient(135deg,#023c62,#035a8f)':'#fff',borderRadius:16,padding:20,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
                  <div style={{fontSize:11,fontWeight:600,color:card.big?'rgba(184,208,232,0.7)':'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>{card.label}</div>
                  <div style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:22,color:card.big?'#fff':card.color}}>{S(card.amount)}</div>
                  {!card.big&&<div style={{fontSize:11,color:'#9dafc8',marginTop:4}}>{payments.filter(p=>p.method===card.value).length} txns</div>}
                </div>
              ))}
            </div>
          )}

          {/* Filter + transactions */}
          <div className="finance-register" style={{background:'#fff',borderRadius:14,border:'1px solid #e3edf6',overflow:'hidden'}}>
            <div className="finance-register-head" style={{padding:'16px 20px',borderBottom:'1px solid #e8f0f7',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <span style={{fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:15,color:'#023c62',flex:1}}>Transactions ({filtered.length})</span>
              {[{ value: 'ALL', label: 'ALL' }, ...methodOptions].map(m=>(
                <button key={m.value} onClick={()=>setFilterMethod(m.value)}
                  style={{padding:'5px 12px',borderRadius:8,border:`1.5px solid ${filterMethod===m.value?METHOD_COLOR[m.value]||'#023c62':'#dce8f0'}`,background:filterMethod===m.value?'#f7f9fc':'#fff',color:filterMethod===m.value?METHOD_COLOR[m.value]||'#023c62':'#6b7fa3',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                  {(() => {
                    const Icon = METHOD_ICON[m.value as keyof typeof METHOD_ICON] || Tag
                    return <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon size={14} /> {methodLabels[m.value] || m.label}</span>
                  })()}
                </button>
              ))}
            </div>
            <table className="finance-table" style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'#f7f9fc'}}>
                {['Time','Order','Customer','Method','Ref','Amount','By'].map(h=>(
                  <th key={h} style={{padding:'11px 18px',textAlign:'left',fontSize:10.5,fontWeight:700,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.07em',borderBottom:'1px solid #e8f0f7',background:'#f7f9fc'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading?<tr><td colSpan={7} style={{padding:48,textAlign:'center',color:'#9dafc8'}}>Loading...</td></tr>
                :!filtered.length?<tr><td colSpan={7} style={{padding:48,textAlign:'center',color:'#9dafc8'}}>No transactions for this date.</td></tr>
                :pagedPayments.map((p:any)=>(
                  <tr key={p.id} style={{borderBottom:'1px solid #eef4f8'}}>
                    <td style={{padding:'13px 18px',fontSize:13.5,color:'#6b7fa3'}}>{format(new Date(p.createdAt),'h:mm a')}</td>
                    <td style={{padding:'13px 18px',fontFamily:"var(--crm-font-mono)",fontSize:13.5,color:'#023c62'}}>{paymentSourceNumber(p)}</td>
                    <td style={{padding:'13px 18px',fontSize:13.5}}>{paymentCustomerName(p)}</td>
                    <td style={{padding:'11px 16px'}}>
                      <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:'#f0f4f8',color:METHOD_COLOR[p.method]||'#6b7fa3'}}>
                        {(() => {
                          const Icon = METHOD_ICON[(p.method || 'OTHER') as keyof typeof METHOD_ICON] || Tag
                          return <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Icon size={12} /> {methodLabels[p.method] || p.method}</span>
                        })()}
                      </span>
                    </td>
                    <td style={{padding:'11px 16px',fontSize:12,color:'#9dafc8',fontFamily:"var(--crm-font-mono)"}}>{p.reference||'—'}</td>
                    <td style={{padding:'11px 16px',fontWeight:700,color:'#022c50',fontSize:15}}>{S(p.amount)}</td>
                    <td style={{padding:'13px 18px',fontSize:13.5,color:'#6b7fa3'}}>{p.collectedByStaff?.name||'—'}</td>
                  </tr>
                ))}
              </tbody>
              {filtered.length>0&&(
                <tfoot><tr style={{background:'#f7f9fc'}}>
                  <td colSpan={5} style={{padding:'12px 18px',fontWeight:700,color:'#023c62',fontFamily:"var(--crm-font-ui)"}}>Total</td>
                  <td style={{padding:'12px 18px',fontWeight:800,color:'#023c62',fontSize:16,fontFamily:"var(--crm-font-ui)"}}>{S(filtered.reduce((s:number,p:any)=>s+p.amount,0))}</td>
                  <td/>
                </tr></tfoot>
              )}
            </table>
            <div className="finance-mobile-transactions">
              {loading ? Array.from({length:5},(_,index)=><div className="finance-mobile-skeleton" key={index}><i/><span/><b/></div>) : !filtered.length ? <div className="finance-mobile-empty">No transactions for this date.</div> : pagedPayments.map((p:any)=>{const Icon=METHOD_ICON[(p.method||'OTHER') as keyof typeof METHOD_ICON]||Tag;return <article key={p.id}><div><strong>{paymentCustomerName(p)}</strong><small>{paymentSourceNumber(p)} · {format(new Date(p.createdAt),'h:mm a')}</small></div><span><b>{S(p.amount)}</b><small><Icon size={11}/>{methodLabels[p.method]||p.method}</small></span>{p.reference&&<p>Reference: {p.reference}</p>}<em>Collected by {p.collectedByStaff?.name||'—'}</em></article>})}
            </div>
          </div>
          <PaginationControls
            page={dailyPage}
            pageSize={pageSize}
            totalItems={filtered.length}
            itemLabel="transactions"
            onPageChange={setDailyPage}
            onPageSizeChange={(size) => { setPageSize(size); setDailyPage(1) }}
            pageSizeOptions={[10, 20, 30, 50, 100]}
          />
        </>
      )}

      {tab === 'receivables' && (
        <>
          <div className="ar-total-card" style={{background:'linear-gradient(135deg,#7f1d1d,#991b1b)',borderRadius:16,padding:24,color:'#fff',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:12,color:'rgba(255,200,200,0.7)',fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>Total Outstanding Balance</div>
              <div style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:36}}>{S(receivableTotal)}</div>
              <div style={{fontSize:13,color:'rgba(255,200,200,0.7)',marginTop:4}}>Across {receivables.length} open invoices for {receivableGroups.length} customers</div>
            </div>
            <AlertTriangle size={44} style={{opacity:0.35}} />
          </div>

          <div style={{display:'grid',gap:12}}>
            {loading ? <div style={{padding:48,textAlign:'center',color:'#9dafc8',background:'#fff',borderRadius:14,border:'1px solid #e3edf6'}}>Loading...</div>
            : !receivableGroups.length ? <div style={{padding:48,textAlign:'center',color:'#22c55e',background:'#fff',borderRadius:14,border:'1px solid #e3edf6'}}>No outstanding balances.</div>
            : pagedReceivableGroups.map((group: any) => {
              const key = groupKey(group)
              const selectedIds = selectedForGroup(group)
              const allIds = (group.receivables || []).map((item: any) => item.invoiceId)
              const allSelected = selectedIds.length === allIds.length && allIds.every((id: string) => selectedIds.includes(id))
              return (
                <div className="ar-customer-card" key={key} style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden',boxShadow:'0 1px 8px rgba(2,60,98,0.04)'}}>
                  <div className="ar-customer-head" style={{padding:'14px 16px',display:'grid',gridTemplateColumns:'minmax(0,1fr) 120px 120px 170px',gap:12,alignItems:'center',background:'#fbfdff',borderBottom:'1px solid #e8f0f7'}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:900,color:'#023c62',fontSize:16,overflowWrap:'anywhere'}}>{group.customer?.name || 'Unknown customer'}</div>
                      <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>+91 {group.customer?.phone || '—'} · {group.invoiceCount} open bills/orders</div>
                    </div>
                    <div><div style={arMetricLabel}>Total</div><div style={arMetricValue}>{S(group.totalAmount)}</div></div>
                    <div><div style={arMetricLabel}>Balance</div><div style={{...arMetricValue,color:'#dc2626'}}>{S(group.balance)}</div></div>
                    <button onClick={() => openArReminder(group)} disabled={!selectedIds.length || group.customer?.notifWhatsApp === false} style={{...arWhatsAppButton, opacity: !selectedIds.length || group.customer?.notifWhatsApp === false ? 0.55 : 1}}>
                      <MessageCircle size={15} /> Send Reminder
                    </button>
                  </div>
                  <div style={{padding:'10px 16px 14px'}}>
                    <label style={{display:'inline-flex',alignItems:'center',gap:8,fontSize:12,color:'#52647e',fontWeight:800,marginBottom:8}}>
                      <input type="checkbox" checked={allSelected} onChange={(e) => setGroupSelection(group, e.target.checked)} />
                      Select all for this customer · Selected {selectedIds.length} · {S(selectedTotalForGroup(group))}
                    </label>
                    <div style={{display:'grid',gap:7}}>
                      {(group.receivables || []).map((o: any) => {
                        const checked = selectedIds.includes(o.invoiceId)
                        return (
                          <div className="ar-invoice-row" key={o.invoiceId} style={{display:'grid',gridTemplateColumns:'28px minmax(0,1.2fr) minmax(0,1fr) 96px 96px 120px',gap:10,alignItems:'center',padding:'9px 10px',border:'1px solid #eef4f8',borderRadius:10,background:checked?'#f7fbff':'#fff'}}>
                            <input type="checkbox" checked={checked} onChange={() => toggleGroupSelection(group, o.invoiceId)} />
                            <div style={{minWidth:0}}>
                              <div style={{fontFamily:"var(--crm-font-mono)",fontWeight:800,color:'#023c62',fontSize:13}}>{o.invoiceNumber || o.orderNumber}</div>
                              <div style={{fontSize:11,color:'#7b8ca8',marginTop:2}}>{o.orderNumber || o.sourceNumber}</div>
                            </div>
                            <div style={{fontSize:12,color:'#52647e',fontWeight:700}}>
                              {o.sourceType === 'FIELD_SERVICE' ? 'Sofa Cleaning' : o.sourceType === 'DAILY_IRON' ? 'Daily Iron' : 'Order'}
                            </div>
                            <div style={{fontSize:12,color:'#52647e'}}>{S(o.totalAmount)}</div>
                            <div style={{fontSize:12,color:'#16a34a'}}>{S(o.paidAmount)}</div>
                            <div style={{fontSize:13,fontWeight:900,color:'#dc2626'}}>{S(o.balance || o.balanceDue)}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <PaginationControls
            page={receivablesPage}
            pageSize={pageSize}
            totalItems={receivableGroups.length}
            itemLabel="customers"
            onPageChange={setReceivablesPage}
            onPageSizeChange={(size) => { setPageSize(size); setReceivablesPage(1) }}
            pageSizeOptions={[10, 20, 30, 50, 100]}
          />
        </>
      )}
      {arReminder.open && (
        <div className="ar-modal-backdrop" style={modalBackdrop}>
          <div className="ar-reminder-modal" style={arModal}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',marginBottom:14}}>
              <div>
                <div style={{fontSize:18,fontWeight:900,color:'#023c62'}}>Send Outstanding Reminder</div>
                <div style={{fontSize:12,color:'#6b7fa3',marginTop:4}}>{arReminder.group?.customer?.name} · {selectedForGroup(arReminder.group).length} selected · {S(selectedTotalForGroup(arReminder.group))}</div>
              </div>
              <button onClick={() => setArReminder({ open:false, group:null, confirm:false })} style={modalClose}>×</button>
            </div>
            {arPreviewLoading ? <div className="ar-preview-loading"><Loader2 className="crm-spin" size={18}/> Loading preview...</div>
            : arPreview?.error ? <div style={{padding:12,borderRadius:10,background:'#fef2f2',color:'#991b1b',fontWeight:700}}>{arPreview.error}</div>
            : (
              <>
                {arPreview?.qrImage && <img src={arPreview.qrImage} alt="Payment QR" style={{width:112,height:112,objectFit:'contain',border:'1px solid #e3edf6',borderRadius:12,background:'#fff',padding:8,marginBottom:10}} />}
                <pre style={previewBox}>{arPreview?.body || ''}</pre>
                <label style={{display:'flex',gap:9,alignItems:'flex-start',fontSize:13,color:'#334155',fontWeight:700,marginTop:12}}>
                  <input type="checkbox" checked={arReminder.confirm} onChange={(e) => setArReminder((current) => ({ ...current, confirm: e.target.checked }))} />
                  I confirm this WhatsApp reminder should be sent for the selected bills/orders.
                </label>
                <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:16}}>
                  <button onClick={() => setArReminder({ open:false, group:null, confirm:false })} disabled={arSending} style={modalSecondary}>Cancel</button>
                  <button onClick={sendArReminder} disabled={arSending || !arReminder.confirm} style={{...modalPrimary, opacity: arSending || !arReminder.confirm ? 0.55 : 1}}>{arSending ? 'Sending...' : 'Send WhatsApp'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const arMetricLabel = { fontSize: 10, color: '#7b8ca8', textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontWeight: 800, marginBottom: 3 }
const arMetricValue = { fontSize: 15, color: '#023c62', fontWeight: 900 }
const arWhatsAppButton = { border: '1px solid #bfe6d2', background: '#e8f7ef', color: '#0d7a4e', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }
const modalBackdrop = { position: 'fixed' as const, inset: 0, background: 'rgba(2,22,38,0.42)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const arModal = { width: 'min(560px, 96vw)', maxHeight: '88vh', overflow: 'auto', background: '#fff', borderRadius: 16, border: '1px solid #dce8f0', boxShadow: '0 24px 70px rgba(2,22,38,0.28)', padding: 18 }
const modalClose = { border: '1px solid #dce8f0', background: '#fff', borderRadius: 9, width: 32, height: 32, cursor: 'pointer', fontSize: 20, color: '#52647e', lineHeight: 1 }
const previewBox = { margin: 0, whiteSpace: 'pre-wrap' as const, background: '#f7f9fc', border: '1px solid #e3edf6', borderRadius: 12, padding: 13, color: '#334155', fontFamily: 'var(--crm-font-ui)', fontSize: 13, lineHeight: 1.5 }
const modalSecondary = { border: '1px solid #dce8f0', background: '#fff', color: '#52647e', borderRadius: 10, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' }
const modalPrimary = { border: 'none', background: '#023c62', color: '#fff', borderRadius: 10, padding: '10px 15px', fontWeight: 900, cursor: 'pointer' }
