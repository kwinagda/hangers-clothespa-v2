'use client'
import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import api from '@/lib/api'

const METHODS = ['ALL','CASH','UPI','CARD','RAZORPAY','OTHER']
const METHOD_ICON: Record<string,string> = {CASH:'💵',UPI:'📱',CARD:'💳',RAZORPAY:'🔗',OTHER:'🏷️',ALL:'📊'}
const METHOD_COLOR: Record<string,string> = {CASH:'#22c55e',UPI:'#3b82f6',CARD:'#8b5cf6',RAZORPAY:'#f97316',OTHER:'#6b7fa3'}

export default function FinancePage() {
  const [tab, setTab] = useState<'daily'|'receivables'>('daily')
  const [date, setDate] = useState(format(new Date(),'yyyy-MM-dd'))
  const [summary, setSummary] = useState<any>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [receivables, setReceivables] = useState<any[]>([])
  const [receivableTotal, setReceivableTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterMethod, setFilterMethod] = useState('ALL')

  const loadDaily = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`/payments/daily?date=${date}`)
      setSummary(r.data?.summary || {})
      setPayments(r.data?.payments || [])
    } catch { toast.error('Failed to load finance data') }
    finally { setLoading(false) }
  }, [date])

  const loadReceivables = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/payments/receivables')
      setReceivables(r.data?.orders || [])
      setReceivableTotal(r.data?.total || 0)
    } catch { toast.error('Failed to load receivables') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (tab === 'daily') loadDaily(); else loadReceivables() }, [tab, loadDaily, loadReceivables])

  const filtered = filterMethod === 'ALL' ? payments : payments.filter(p => p.method === filterMethod)

  const S = (v: number) => `₹${(v||0).toLocaleString('en-IN')}`

  return (
    <div style={{padding:'32px 36px',maxWidth:1200,margin:'0 auto',fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{marginBottom:28}}>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,color:'#023c62',margin:'0 0 4px'}}>Finance & Accounts</h1>
        <p style={{fontSize:14,color:'#6b7fa3',margin:0}}>Daily cash register, collections, and outstanding balances</p>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:8,marginBottom:24}}>
        {[{k:'daily',l:'📅 Daily Register'},{k:'receivables',l:'⚠️ Accounts Receivable'}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k as any)}
            style={{padding:'10px 20px',borderRadius:10,border:`1.5px solid ${tab===t.k?'#023c62':'#dce8f0'}`,background:tab===t.k?'#023c62':'#fff',color:tab===t.k?'#fff':'#6b7fa3',fontWeight:600,cursor:'pointer',fontSize:14}}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'daily' && (
        <>
          {/* Date picker + summary cards */}
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{border:'1.5px solid #dce8f0',borderRadius:10,padding:'9px 14px',fontSize:14,color:'#023c62',fontWeight:600,outline:'none'}}/>
            <button onClick={loadDaily} style={{background:'#023c62',color:'#fff',border:'none',borderRadius:10,padding:'10px 16px',fontWeight:600,cursor:'pointer',fontSize:14}}>Refresh</button>
          </div>

          {summary && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:14,marginBottom:24}}>
              {[
                {l:'Total Collected',v:summary.total,color:'#023c62',big:true},
                {l:'💵 Cash',v:summary.cash,color:'#22c55e'},
                {l:'📱 UPI',v:summary.upi,color:'#3b82f6'},
                {l:'💳 Card',v:summary.card,color:'#8b5cf6'},
                {l:'🔗 Razorpay',v:summary.online,color:'#f97316'},
              ].map(card=>(
                <div key={card.l} style={{background:card.big?'linear-gradient(135deg,#023c62,#035a8f)':'#fff',borderRadius:16,padding:20,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
                  <div style={{fontSize:11,fontWeight:600,color:card.big?'rgba(184,208,232,0.7)':'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>{card.l}</div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:card.big?'#fff':card.color}}>{S(card.v)}</div>
                  {!card.big&&<div style={{fontSize:11,color:'#9dafc8',marginTop:4}}>{payments.filter(p=>p.method===card.l.split(' ')[1]).length} txns</div>}
                </div>
              ))}
            </div>
          )}

          {/* Filter + transactions */}
          <div style={{background:'#fff',borderRadius:20,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)',overflow:'hidden'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #e8f0f7',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:15,color:'#023c62',flex:1}}>Transactions ({filtered.length})</span>
              {METHODS.map(m=>(
                <button key={m} onClick={()=>setFilterMethod(m)}
                  style={{padding:'5px 12px',borderRadius:8,border:`1.5px solid ${filterMethod===m?METHOD_COLOR[m]||'#023c62':'#dce8f0'}`,background:filterMethod===m?'#f7f9fc':'#fff',color:filterMethod===m?METHOD_COLOR[m]||'#023c62':'#6b7fa3',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                  {METHOD_ICON[m]} {m}
                </button>
              ))}
            </div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'#f7f9fc'}}>
                {['Time','Order','Customer','Method','Ref','Amount','By'].map(h=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading?<tr><td colSpan={7} style={{padding:48,textAlign:'center',color:'#9dafc8'}}>Loading...</td></tr>
                :!filtered.length?<tr><td colSpan={7} style={{padding:48,textAlign:'center',color:'#9dafc8'}}>No transactions for this date.</td></tr>
                :filtered.map((p:any)=>(
                  <tr key={p.id} style={{borderBottom:'1px solid #f0f4f8'}}>
                    <td style={{padding:'11px 16px',fontSize:12,color:'#6b7fa3'}}>{format(new Date(p.createdAt),'h:mm a')}</td>
                    <td style={{padding:'11px 16px',fontFamily:"'DM Mono',monospace",fontSize:12,color:'#023c62'}}>{p.order?.orderNumber||'—'}</td>
                    <td style={{padding:'11px 16px',fontSize:13}}>{p.order?.customer?.name||'+91 '+p.order?.customer?.phone}</td>
                    <td style={{padding:'11px 16px'}}>
                      <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:'#f0f4f8',color:METHOD_COLOR[p.method]||'#6b7fa3'}}>
                        {METHOD_ICON[p.method]} {p.method}
                      </span>
                    </td>
                    <td style={{padding:'11px 16px',fontSize:12,color:'#9dafc8',fontFamily:"'DM Mono',monospace"}}>{p.reference||'—'}</td>
                    <td style={{padding:'11px 16px',fontWeight:700,color:'#022c50',fontSize:15}}>{S(p.amount)}</td>
                    <td style={{padding:'11px 16px',fontSize:12,color:'#6b7fa3'}}>{p.collectedByStaff?.name||'—'}</td>
                  </tr>
                ))}
              </tbody>
              {filtered.length>0&&(
                <tfoot><tr style={{background:'#f7f9fc'}}>
                  <td colSpan={5} style={{padding:'12px 16px',fontWeight:700,color:'#023c62',fontFamily:"'Syne',sans-serif"}}>Total</td>
                  <td style={{padding:'12px 16px',fontWeight:800,color:'#023c62',fontSize:16,fontFamily:"'Syne',sans-serif"}}>{S(filtered.reduce((s:number,p:any)=>s+p.amount,0))}</td>
                  <td/>
                </tr></tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {tab === 'receivables' && (
        <>
          <div style={{background:'linear-gradient(135deg,#7f1d1d,#991b1b)',borderRadius:16,padding:24,color:'#fff',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:12,color:'rgba(255,200,200,0.7)',fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>Total Outstanding Balance</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:36}}>{S(receivableTotal)}</div>
              <div style={{fontSize:13,color:'rgba(255,200,200,0.7)',marginTop:4}}>Across {receivables.length} orders with pending payments</div>
            </div>
            <div style={{fontSize:48,opacity:0.3}}>⚠️</div>
          </div>

          <div style={{background:'#fff',borderRadius:20,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)',overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'#f7f9fc'}}>
                {['Order','Customer','Phone','Order Total','Paid','Balance','Status'].map(h=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading?<tr><td colSpan={7} style={{padding:48,textAlign:'center',color:'#9dafc8'}}>Loading...</td></tr>
                :!receivables.length?<tr><td colSpan={7} style={{padding:48,textAlign:'center',color:'#22c55e',fontSize:15}}>✅ No outstanding balances!</td></tr>
                :receivables.map((o:any)=>(
                  <tr key={o.id} style={{borderBottom:'1px solid #f0f4f8',cursor:'pointer'}} onClick={()=>window.location.href=`/dashboard/orders/${o.id}`}>
                    <td style={{padding:'11px 16px',fontFamily:"'DM Mono',monospace",fontSize:12,color:'#023c62'}}>{o.orderNumber}</td>
                    <td style={{padding:'11px 16px',fontSize:13,fontWeight:500}}>{o.customer?.name||'—'}</td>
                    <td style={{padding:'11px 16px',fontSize:12,color:'#6b7fa3'}}>+91 {o.customer?.phone}</td>
                    <td style={{padding:'11px 16px',fontSize:14}}>{S(o.totalAmount)}</td>
                    <td style={{padding:'11px 16px',fontSize:14,color:'#22c55e'}}>{S(o.paidAmount)}</td>
                    <td style={{padding:'11px 16px',fontSize:14,fontWeight:700,color:'#dc2626'}}>{S(o.balance)}</td>
                    <td style={{padding:'11px 16px'}}>
                      <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:o.paymentStatus==='PARTIAL'?'#fef3c7':'#fee2e2',color:o.paymentStatus==='PARTIAL'?'#92400e':'#dc2626'}}>
                        {o.paymentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
