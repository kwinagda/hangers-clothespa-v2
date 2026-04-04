'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { metadataAPI, searchAPI } from '@/lib/api'
import { PaginationControls } from '@/components/ui/PaginationControls'
const fmt = (n:number) => `₹${(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`
export default function SearchPage() {
  const [st,setSt] = useState<'orders'|'customers'>('orders')
  const [statusOptions,setStatusOptions] = useState<Array<{v:string,l:string}>>([])
  const [tagOptions,setTagOptions] = useState<Array<{v:string,l:string}>>([])
  const [paymentStatusOptions,setPaymentStatusOptions] = useState<Array<{v:string,l:string}>>([])
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
    }).catch(() => {})
  }, [])
  const search = async (p=1, limit=pageSize) => {
    setLoading(true); setPage(p)
    const params:any = {type:st,page:p,limit}
    if(q)params.q=q; if(status)params.status=status; if(pStatus)params.paymentStatus=pStatus
    if(tag)params.tag=tag; if(from)params.from=from; if(to)params.to=to
    if(minAmt)params.minAmount=minAmt; if(maxAmt)params.maxAmount=maxAmt
    const r = await searchAPI.query(params)
    setResults(r.data); setLoading(false)
  }
  const s = {fontFamily:"var(--crm-font-ui)"}
  const sel = (v:string,onChange:any,opts:{v:string,l:string}[],placeholder:string) => <select value={v} onChange={e=>onChange(e.target.value)} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'7px 10px',fontSize:13,width:'100%'}}><option value="">{placeholder}</option>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>
  return (
    <div style={{padding:'32px 36px',maxWidth:1100,margin:'0 auto',...s}}>
      <h1 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:26,color:'#023c62',marginBottom:24}}>Advanced Search</h1>
      <div style={{display:'flex',gap:4,marginBottom:20,background:'#f1f5f9',borderRadius:12,padding:4,width:'fit-content'}}>
        {(['orders','customers'] as const).map(t=><button key={t} onClick={()=>{setSt(t);setResults(null)}} style={{padding:'8px 18px',borderRadius:8,fontSize:13,fontWeight:600,border:'none',cursor:'pointer',background:st===t?'#fff':'transparent',color:st===t?'#023c62':'#6b7fa3',boxShadow:st===t?'0 1px 4px rgba(0,0,0,0.08)':'none',textTransform:'capitalize' as const}}>{t}</button>)}
      </div>
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',padding:20,marginBottom:16}}>
        <input type="text" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search(1)}
          placeholder={st==='orders'?'Search by order number, customer name or phone...':'Search by name or phone...'}
          style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 14px',fontSize:13,boxSizing:'border-box' as const,marginBottom:12}}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
          {st==='orders'&&<>{sel(status,setStatus,statusOptions,'All Statuses')}{sel(pStatus,setPStatus,paymentStatusOptions,'Payment Status')}<div style={{display:'flex',gap:6}}><input type="number" value={minAmt} onChange={e=>setMinAmt(e.target.value)} placeholder="Min ₹" style={{width:'50%',border:'1px solid #e2e8f0',borderRadius:8,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/><input type="number" value={maxAmt} onChange={e=>setMaxAmt(e.target.value)} placeholder="Max ₹" style={{width:'50%',border:'1px solid #e2e8f0',borderRadius:8,padding:'7px 10px',fontSize:13,boxSizing:'border-box' as const}}/></div></>}
          {st==='customers'&&sel(tag,setTag,tagOptions,'All Tags')}
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'7px 10px',fontSize:13}}/>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'7px 10px',fontSize:13}}/>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>search(1)} disabled={loading} style={{padding:'10px 20px',background:'#023c62',color:'#fff',borderRadius:8,fontSize:13,fontWeight:700,border:'none',cursor:'pointer',opacity:loading?0.5:1}}>{loading?'Searching...':'Search'}</button>
          <button onClick={()=>{setQ('');setStatus('');setPStatus('');setTag('');setFrom('');setTo('');setMinAmt('');setMaxAmt('');setResults(null)}} style={{padding:'10px 20px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,background:'#fff',cursor:'pointer'}}>Clear</button>
        </div>
      </div>
      {results&&<div>
        <div style={{fontSize:13,color:'#6b7fa3',marginBottom:12}}>{results.total} result{results.total!==1?'s':''} found</div>
        {st==='orders'&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',overflow:'hidden'}}>
          {!results.orders?.length?<div style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No orders found</div>:
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:'#f8fafc'}}>{['Order #','Customer','Date','Status','Amount','Payment'].map(h=><th key={h} style={{padding:'10px 16px',textAlign:h==='Amount'||h==='Payment'?'right':'left',fontSize:11,color:'#9dafc8',textTransform:'uppercase' as const,letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>{h}</th>)}</tr></thead>
            <tbody>{results.orders.map((o:any)=><tr key={o.id} style={{borderBottom:'1px solid #f8fafc'}}>
              <td style={{padding:'10px 16px'}}><Link href={`/dashboard/orders/${o.id}`} style={{color:'#023c62',fontFamily:'monospace',fontSize:12}}>{o.orderNumber}</Link></td>
              <td style={{padding:'10px 16px'}}><div style={{fontWeight:600}}>{o.customer?.name}</div><div style={{fontSize:11,color:'#9dafc8'}}>{o.customer?.phone}</div></td>
              <td style={{padding:'10px 16px',color:'#6b7fa3'}}>{new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
              <td style={{padding:'10px 16px'}}><span style={{padding:'3px 8px',background:'#f1f5f9',borderRadius:4,fontSize:11}}>{o.status}</span></td>
              <td style={{padding:'10px 16px',textAlign:'right',fontWeight:600}}>{fmt(o.totalAmount||o.total||0)}</td>
              <td style={{padding:'10px 16px',textAlign:'right'}}><span style={{padding:'3px 8px',borderRadius:4,fontSize:11,background:o.paymentStatus==='PAID'?'#dcfce7':'#fee2e2',color:o.paymentStatus==='PAID'?'#166534':'#991b1b'}}>{o.paymentStatus||'UNPAID'}</span></td>
            </tr>)}</tbody>
          </table>}
        </div>}
        {st==='customers'&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',overflow:'hidden'}}>
          {!results.customers?.length?<div style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No customers found</div>:
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:'#f8fafc'}}>{['Name','Phone','Tag','Member Since',''].map(h=><th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,color:'#9dafc8',textTransform:'uppercase' as const,letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>{h}</th>)}</tr></thead>
            <tbody>{results.customers.map((c:any)=><tr key={c.id} style={{borderBottom:'1px solid #f8fafc'}}>
              <td style={{padding:'10px 16px',fontWeight:600}}>{c.name}</td>
              <td style={{padding:'10px 16px',color:'#6b7fa3'}}>{c.phone}</td>
              <td style={{padding:'10px 16px'}}><span style={{padding:'3px 8px',background:'#f1f5f9',borderRadius:4,fontSize:11}}>{c.tag||'REGULAR'}</span></td>
              <td style={{padding:'10px 16px',color:'#6b7fa3'}}>{new Date(c.createdAt).toLocaleDateString('en-IN')}</td>
              <td style={{padding:'10px 16px'}}><Link href={`/dashboard/customers/${c.id}`} style={{fontSize:12,color:'#023c62'}}>View →</Link></td>
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
