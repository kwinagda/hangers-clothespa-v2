'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { metadataAPI, searchAPI } from '@/lib/api'
import { Badge, PageHeader } from '@/components/ui'
import { PaginationControls } from '@/components/ui/PaginationControls'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}
const fmt = (n:number) => `₹${(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`
export default function SearchPage() {
  const [st,setSt] = useState<'orders'|'customers'>('orders')
  const [statusOptions,setStatusOptions] = useState<Array<{v:string,l:string}>>([])
  const [tagOptions,setTagOptions] = useState<Array<{v:string,l:string}>>([])
  const [paymentStatusOptions,setPaymentStatusOptions] = useState<Array<{v:string,l:string}>>([])
  const [paymentStatusMeta,setPaymentStatusMeta] = useState<Record<string,{l:string;color:string;bg:string}>>({})
  const [q,setQ] = useState('')
  const [status,setStatus] = useState('')
  const [pStatus,setPStatus] = useState('')
  const [tag,setTag] = useState('')
  const [from,setFrom] = useState('')
  const [to,setTo] = useState('')
  const [minAmt,setMinAmt] = useState('')
  const [maxAmt,setMaxAmt] = useState('')
  const [results,setResults] = useState<any>(null)
  const [loading,setLoading] = useState(false)
  const [page,setPage] = useState(1)
  const [pageSize,setPageSize] = useState(20)
  useEffect(() => {
    metadataAPI.getAll().then((r:any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      setStatusOptions((metadata.orderStatuses || []).filter((item:any) => item.key !== 'RETURNED').map((item:any) => ({ v: item.key, l: item.label || item.key })))
      setTagOptions((metadata.customerTags || []).map((item:any) => ({ v: item.value, l: item.label })))
      setPaymentStatusOptions((metadata.paymentStatuses || []).map((item:any) => ({ v: item.value, l: item.label })))
      setPaymentStatusMeta(Object.fromEntries((metadata.paymentStatuses || []).map((item:any) => [item.value, { l: item.label || item.value, color: item.color || '#023c62', bg: item.bg || '#f4f7fb' }])))
    }).catch(() => {
      toast.error('Failed to load search filters')
    })
  }, [])
  const search = async (p=1, limit=pageSize) => {
    setLoading(true); setPage(p)
    try {
      const params:any = {type:st,page:p,limit}
      if(q)params.q=q; if(status)params.status=status; if(pStatus)params.paymentStatus=pStatus
      if(tag)params.tag=tag; if(from)params.from=from; if(to)params.to=to
      if(minAmt)params.minAmount=minAmt; if(maxAmt)params.maxAmount=maxAmt
      const r = await searchAPI.query(params)
      setResults({
        ...r.data,
        orders: asArray(r.data, ['orders', 'items']),
        customers: asArray(r.data, ['customers', 'items']),
      })
    } catch (e:any) {
      toast.error(e.message || 'Search failed')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }
  const s = {fontFamily:"var(--crm-font-ui)"}
  const inputStyle = {border:'1.5px solid #dce8f0',borderRadius:9,padding:'10px 14px',fontSize:13.5,width:'100%',boxSizing:'border-box' as const,outline:'none',fontFamily:'var(--crm-font-ui)'}
  const thStyle = {padding:'11px 18px',textAlign:'left' as const,fontSize:10.5,fontWeight:700,color:'#6b7fa3',textTransform:'uppercase' as const,letterSpacing:'0.07em',borderBottom:'1px solid #e8f0f7',background:'#f7f9fc'}
  const tdStyle = {padding:'12px 18px',fontSize:13.5,color:'#1a2332',borderBottom:'1px solid #eef4f8',verticalAlign:'top' as const}
  const sel = (v:string,onChange:any,opts:{v:string,l:string}[],placeholder:string) => <select value={v} onChange={e=>onChange(e.target.value)} style={inputStyle}><option value="">{placeholder}</option>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>
  return (
    <div style={{padding:'30px 36px 60px',maxWidth:1100,margin:'0 auto',...s}}>
      <PageHeader title="Advanced Search" subtitle="Find orders and customers with operational filters" />
      <div className="crm-tab-shell">
        {(['orders','customers'] as const).map(t=><button key={t} onClick={()=>{setSt(t);setResults(null)}} className={`crm-tab-link ${st===t?'crm-tab-link-active':''}`} style={{border:'none',cursor:'pointer',fontFamily:'var(--crm-font-ui)',textTransform:'capitalize' as const}}>{t}</button>)}
      </div>
      <div className="crm-surface" style={{background:'#fff',borderRadius:14,border:'1px solid #e3edf6',padding:20,marginBottom:18}}>
        <input type="text" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search(1)}
          placeholder={st==='orders'?'Search by order number, customer name or phone...':'Search by name or phone...'}
          style={{...inputStyle,marginBottom:12}}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:14}}>
          {st==='orders'&&<>{sel(status,setStatus,statusOptions,'All Statuses')}{sel(pStatus,setPStatus,paymentStatusOptions,'Payment Status')}<input type="number" value={minAmt} onChange={e=>setMinAmt(e.target.value)} placeholder="Min ₹" style={inputStyle}/><input type="number" value={maxAmt} onChange={e=>setMaxAmt(e.target.value)} placeholder="Max ₹" style={inputStyle}/></>}
          {st==='customers'&&sel(tag,setTag,tagOptions,'All Tags')}
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={inputStyle}/>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={inputStyle}/>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>search(1)} disabled={loading} style={{padding:'10px 22px',background:'#023c62',color:'#fff',borderRadius:9,fontSize:13.5,fontWeight:700,border:'none',cursor:'pointer',opacity:loading?0.5:1,fontFamily:'var(--crm-font-ui)'}}>{loading?'Searching...':'Search'}</button>
          <button onClick={()=>{setQ('');setStatus('');setPStatus('');setTag('');setFrom('');setTo('');setMinAmt('');setMaxAmt('');setResults(null)}} style={{padding:'10px 22px',border:'1.5px solid #dce8f0',borderRadius:9,fontSize:13.5,fontWeight:700,background:'#fff',color:'#3d5470',cursor:'pointer',fontFamily:'var(--crm-font-ui)'}}>Clear</button>
        </div>
      </div>
      {results&&<div>
        <div style={{fontSize:13,color:'#6b7fa3',marginBottom:12}}>{results.total} result{results.total!==1?'s':''} found</div>
        {st==='orders'&&<div className="crm-surface" style={{background:'#fff',borderRadius:14,border:'1px solid #e3edf6',overflow:'hidden'}}>
          {!results.orders?.length?<div style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No orders found</div>:
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['Order #','Customer','Date','Status','Amount','Payment'].map(h=><th key={h} style={{...thStyle,textAlign:h==='Amount'||h==='Payment'?'right':'left'}}>{h}</th>)}</tr></thead>
            <tbody>{results.orders.map((o:any)=><tr key={o.id} className="crm-table-row">
              <td style={tdStyle}><Link href={`/dashboard/orders/${o.id}`} style={{color:'#023c62',fontFamily:'var(--crm-font-mono)',fontSize:12.5,fontWeight:700,textDecoration:'none'}}>{o.orderNumber}</Link></td>
              <td style={tdStyle}><div style={{fontWeight:700}}>{o.customer?.name}</div><div style={{fontSize:11.5,color:'#9dafc8',marginTop:3}}>{o.customer?.phone}</div></td>
              <td style={{...tdStyle,color:'#6b7fa3'}}>{new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
              <td style={tdStyle}><Badge label={String(o.status || '').replace(/_/g,' ')} status={o.status} size="sm" /></td>
              <td style={{...tdStyle,textAlign:'right',fontWeight:800,color:'#023c62',fontFamily:'var(--crm-font-mono)'}}>{fmt(o.totalAmount||o.total||0)}</td>
              <td style={{...tdStyle,textAlign:'right'}}>{(() => {
                const paymentStyle = paymentStatusMeta[o.paymentStatus || 'UNPAID'] || { l: o.paymentStatus || 'UNPAID', color: '#023c62', bg: '#f4f7fb' }
                return <Badge label={paymentStyle.l} color={paymentStyle.color} status={o.paymentStatus || 'UNPAID'} size="sm" />
              })()}</td>
            </tr>)}</tbody>
          </table>}
        </div>}
        {st==='customers'&&<div className="crm-surface" style={{background:'#fff',borderRadius:14,border:'1px solid #e3edf6',overflow:'hidden'}}>
          {!results.customers?.length?<div style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No customers found</div>:
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['Name','Phone','Tag','Member Since',''].map(h=><th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>{results.customers.map((c:any)=><tr key={c.id} className="crm-table-row">
              <td style={{...tdStyle,fontWeight:700}}>{c.name}</td>
              <td style={{...tdStyle,color:'#6b7fa3'}}>{c.phone}</td>
              <td style={tdStyle}><Badge label={c.tag||'REGULAR'} size="sm" /></td>
              <td style={{...tdStyle,color:'#6b7fa3'}}>{new Date(c.createdAt).toLocaleDateString('en-IN')}</td>
              <td style={tdStyle}><Link href={`/dashboard/customers/${c.id}`} style={{fontSize:12.5,color:'#023c62',fontWeight:700,textDecoration:'none'}}>View</Link></td>
            </tr>)}</tbody>
          </table>}
        </div>}
        <PaginationControls
          page={page}
          pageSize={pageSize}
          totalItems={results.total || 0}
          itemLabel={st}
          onPageChange={(nextPage)=>search(nextPage)}
          onPageSizeChange={(size)=>{setPageSize(size); search(1, size)}}
          pageSizeOptions={[10,20,30,50,100]}
        />
      </div>}
    </div>
  )
}
