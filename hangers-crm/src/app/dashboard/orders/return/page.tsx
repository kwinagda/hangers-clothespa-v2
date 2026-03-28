'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { returnOrderAPI } from '@/lib/api'
const REASONS = ['Stain not removed','Colour faded','Item damaged','Wrong item returned','Item shrunk','Customer not satisfied','Other']
export default function ReturnOrderPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const [orderId,setOrderId] = useState(sp.get('orderId')||'')
  const [reason,setReason] = useState(REASONS[0])
  const [custom,setCustom] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState<any>(null)
  const s = {fontFamily:"'DM Sans',sans-serif"}
  const submit = async () => {
    if(!orderId){setError('Enter the original order ID');return}
    setLoading(true); setError('')
    const r = await returnOrderAPI.create({originalOrderId:orderId,reason:reason==='Other'?custom:reason})
    if(r.data?.success!==false&&r.data) setSuccess(r.data)
    else setError(r.data?.message||'Failed to create return order')
    setLoading(false)
  }
  if(success) return (
    <div style={{padding:'60px 36px',maxWidth:480,margin:'0 auto',...s,textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:16}}>✅</div>
      <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:22,color:'#166534',marginBottom:8}}>Return Order Created</h2>
      <p style={{color:'#166534',marginBottom:24}}>Order: <strong style={{fontFamily:'monospace'}}>{success.orderNumber}</strong></p>
      <div style={{display:'flex',gap:10,justifyContent:'center'}}>
        <button onClick={()=>router.push(`/dashboard/orders/${success.id}`)} style={{padding:'10px 20px',background:'#023c62',color:'#fff',borderRadius:10,fontSize:13,fontWeight:700,border:'none',cursor:'pointer'}}>View Order</button>
        <button onClick={()=>router.push('/dashboard/orders')} style={{padding:'10px 20px',border:'1px solid #e2e8f0',borderRadius:10,fontSize:13,background:'#fff',cursor:'pointer'}}>All Orders</button>
      </div>
    </div>
  )
  return (
    <div style={{padding:'32px 36px',maxWidth:500,margin:'0 auto',...s}}>
      <button onClick={()=>router.back()} style={{fontSize:13,color:'#6b7fa3',background:'none',border:'none',cursor:'pointer',marginBottom:16}}>← Back</button>
      <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:'#023c62',marginBottom:24}}>Return / Re-clean Order</h1>
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',padding:24}}>
        <div style={{display:'flex',flexDirection:'column' as const,gap:16}}>
          <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Original Order ID *</label>
            <input type="text" value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="Paste order ID" readOnly={!!sp.get('orderId')} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,fontFamily:'monospace',boxSizing:'border-box' as const}}/></div>
          <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Reason *</label>
            <select value={reason} onChange={e=>setReason(e.target.value)} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
              {REASONS.map(r=><option key={r} value={r}>{r}</option>)}
            </select></div>
          {reason==='Other'&&<div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Specify</label>
            <input type="text" value={custom} onChange={e=>setCustom(e.target.value)} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/></div>}
          {error&&<div style={{background:'#fef2f2',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#991b1b'}}>{error}</div>}
          <div style={{background:'#fefce8',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#854d0e'}}>A new order will be created for re-cleaning at no charge, linked to the original.</div>
          <button onClick={submit} disabled={loading} style={{padding:'12px',background:'#023c62',color:'#fff',borderRadius:8,fontSize:13,fontWeight:700,border:'none',cursor:'pointer',opacity:loading?0.5:1}}>{loading?'Creating...':'Create Return Order'}</button>
        </div>
      </div>
    </div>
  )
}
