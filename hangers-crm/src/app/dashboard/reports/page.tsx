'use client'
import { useEffect, useState } from 'react'
import { metadataAPI, reportsAPI } from '@/lib/api'
const fmt = (n:number) => `₹${(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`
export default function ReportsPage() {
  const [type,setType] = useState('sales')
  const [reportTypes,setReportTypes] = useState<Array<{ value: string; label: string }>>([])
  const [from,setFrom] = useState(()=>{const d=new Date();d.setDate(1);return d.toISOString().split('T')[0]})
  const [to,setTo] = useState(new Date().toISOString().split('T')[0])
  const [data,setData] = useState<any>(null)
  const [loading,setLoading] = useState(false)
  const load = async () => { setLoading(true); const r=await reportsAPI.get(type,from,to); setData(r.data); setLoading(false) }
  useEffect(() => {
    metadataAPI.getAll().then((r:any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      setReportTypes(metadata.reportTypes || [])
    }).catch(() => {})
  }, [])
  useEffect(()=>{ load() },[type,from,to])
  const s = {fontFamily:"var(--crm-font-ui)"}
  const card = (label:string,value:any,color='#023c62',bg='#f8fafc') => <div style={{background:bg,borderRadius:12,padding:16}}><div style={{fontSize:11,color,marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'0.06em',opacity:0.7}}>{label}</div><div style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:22,color}}>{value}</div></div>
  return (
    <div style={{padding:'32px 36px',maxWidth:1100,margin:'0 auto',...s}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <h1 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:26,color:'#023c62',margin:0}}>Business Reports</h1>
        <button onClick={()=>{if(!data)return;const rows:string[][]=[];if(type==='sales'){rows.push(['Metric','Value']);rows.push(['Orders',data.orders],['Revenue',data.revenue],['Paid',data.paid],['Outstanding',data.outstanding])}const csv=rows.map(r=>r.join(',')).join('\n');const b=new Blob([csv],{type:'text/csv'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`hangers_${type}_${from}_${to}.csv`;a.click()}} style={{padding:'10px 20px',border:'1px solid #e2e8f0',borderRadius:10,fontSize:13,background:'#fff',cursor:'pointer'}}>Export CSV</button>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap' as const,marginBottom:20}}>
        {reportTypes.map(t=><button key={t.value} onClick={()=>setType(t.value)} style={{padding:'8px 16px',borderRadius:8,fontSize:13,fontWeight:600,border:type===t.value?'2px solid #023c62':'1px solid #e2e8f0',background:type===t.value?'#023c62':'#fff',color:type===t.value?'#fff':'#374151',cursor:'pointer'}}>{t.label}</button>)}
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:12,flexWrap:'wrap' as const}}>
        <span style={{fontSize:13,color:'#6b7fa3'}}>From</span>
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'6px 12px',fontSize:13}}/>
        <span style={{fontSize:13,color:'#6b7fa3'}}>To</span>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'6px 12px',fontSize:13}}/>
        {[{l:'Today',f:()=>{const t=new Date().toISOString().split('T')[0];setFrom(t);setTo(t)}},{l:'This Month',f:()=>{const t=new Date();const d=new Date(t.getFullYear(),t.getMonth(),1);setFrom(d.toISOString().split('T')[0]);setTo(t.toISOString().split('T')[0])}},{l:'Last Month',f:()=>{const t=new Date();const s=new Date(t.getFullYear(),t.getMonth()-1,1);const e=new Date(t.getFullYear(),t.getMonth(),0);setFrom(s.toISOString().split('T')[0]);setTo(e.toISOString().split('T')[0])}}].map(b=><button key={b.l} onClick={b.f} style={{padding:'6px 12px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,background:'#fff',cursor:'pointer'}}>{b.l}</button>)}
      </div>
      {loading?<div style={{padding:40,textAlign:'center',color:'#9dafc8'}}>Loading report...</div>:data&&<div>
        {type==='sales'&&<div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>{card('Total Orders',data.orders)}{card('Revenue',fmt(data.revenue))}{card('Collected',fmt(data.paid),'#166534','#f0fdf4')}{card('Outstanding',fmt(data.outstanding),data.outstanding>0?'#991b1b':'#374151',data.outstanding>0?'#fef2f2':'#f8fafc')}</div>}
        {type==='orders'&&data.byStatus&&<div><div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10,marginBottom:12}}>{card('Total',data.total)}{Object.entries(data.byStatus).slice(0,4).map(([st,cnt])=>card(st,String(cnt)))}</div></div>}
        {type==='customers'&&<div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>{card('New Customers',data.total)}{data.byTag&&Object.entries(data.byTag).map(([tag,cnt])=>card(tag,String(cnt)))}</div>}
        {type==='payments'&&<div><div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:12}}>{card('Total Collected',fmt(data.total),'#166534','#f0fdf4')}{card('Transactions',data.count)}{data.byMode&&Object.entries(data.byMode).map(([m,a])=>card(m,fmt(a as number)))}</div></div>}
        {type==='expenses'&&<div><div style={{background:'#fef2f2',borderRadius:12,padding:16,marginBottom:12}}>{card('Total Expenses',fmt(data.total),'#991b1b','#fef2f2')}</div>{data.byCategory&&<div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>{Object.entries(data.byCategory).map(([cat,amt])=>card(cat,fmt(amt as number)))}</div>}</div>}
        {type==='garments'&&data.topItems&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',overflow:'hidden'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr style={{background:'#f8fafc'}}><th style={{padding:'10px 16px',textAlign:'left',fontSize:11,color:'#9dafc8',textTransform:'uppercase' as const,letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>Item</th><th style={{padding:'10px 16px',textAlign:'right',fontSize:11,color:'#9dafc8',textTransform:'uppercase' as const,letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>Qty</th></tr></thead><tbody>{data.topItems.map(([name,qty]:[string,number])=><tr key={name} style={{borderBottom:'1px solid #f8fafc'}}><td style={{padding:'10px 16px'}}>{name}</td><td style={{padding:'10px 16px',textAlign:'right',fontWeight:600}}>{qty}</td></tr>)}</tbody></table></div>}
        {type==='staff'&&data.byStaff&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',overflow:'hidden'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr style={{background:'#f8fafc'}}>{['Staff ID','Days','Total Hours'].map(h=><th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,color:'#9dafc8',textTransform:'uppercase' as const,letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>{h}</th>)}</tr></thead><tbody>{Object.entries(data.byStaff).map(([id,info]:any)=><tr key={id} style={{borderBottom:'1px solid #f8fafc'}}><td style={{padding:'10px 16px'}}>{(info as any).name||id}</td><td style={{padding:'10px 16px'}}>{info.days}</td><td style={{padding:'10px 16px'}}>{info.totalHours.toFixed(1)}h</td></tr>)}</tbody></table></div>}
      </div>}
    </div>
  )
}
