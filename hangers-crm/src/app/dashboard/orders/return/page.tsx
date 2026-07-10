'use client'
import { ChangeEvent, Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { metadataAPI, returnOrderAPI } from '@/lib/api'
import toast from 'react-hot-toast'
function ReturnOrderPageContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const [reasons,setReasons] = useState<Array<{ value: string; label: string }>>([])
  const [orderId,setOrderId] = useState(sp.get('orderId')||'')
  const [reason,setReason] = useState('')
  const [custom,setCustom] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState<any>(null)
  const s = {fontFamily:"var(--crm-font-ui)"}
  useEffect(() => {
    metadataAPI.getAll().then((r:any) => {
      const items = r?.metadata?.returnReasons || r?.data?.metadata?.returnReasons || []
      setReasons(items)
      if (items[0]?.value) setReason(items[0].value)
    }).catch((e:any) => {
      setReasons([])
      toast.error(e.message || 'Failed to load return reasons')
    })
  }, [])
  const submit = async () => {
    if(!orderId){setError('Enter the original order ID');return}
    if(reason === 'Other' && !custom.trim()){setError('Enter the custom return reason');return}
    setLoading(true); setError('')
    try {
      const r = await returnOrderAPI.create({originalOrderId:orderId.trim(),reason:reason==='Other'?custom.trim():reason})
      if(r.data?.success!==false&&r.data) {
        setSuccess(r.data)
        toast.success('Return order created')
      } else setError(r.data?.message||'Failed to create return order')
    } catch (e:any) {
      setError(e.message || 'Failed to create return order')
    } finally {
      setLoading(false)
    }
  }
  if(success) return (
    <div style={{padding:'60px 36px',maxWidth:480,margin:'0 auto',...s,textAlign:'center'}}>
      <div style={{display:'flex',justifyContent:'center',marginBottom:16}}><CheckCircle2 size={48} color="#166534" /></div>
      <h2 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:22,color:'#166534',marginBottom:8}}>Return Order Created</h2>
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
      <h1 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:26,color:'#023c62',marginBottom:24}}>Return / Re-clean Order</h1>
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',padding:24}}>
        <div style={{display:'flex',flexDirection:'column' as const,gap:16}}>
          <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Original Order ID *</label>
            <input type="text" value={orderId} onChange={(e: ChangeEvent<HTMLInputElement>)=>setOrderId(e.target.value)} placeholder="Paste order ID" readOnly={!!sp.get('orderId')} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,fontFamily:'monospace',boxSizing:'border-box' as const}}/></div>
          <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Reason *</label>
            <select value={reason} onChange={(e: ChangeEvent<HTMLSelectElement>)=>setReason(e.target.value)} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
              {reasons.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
            </select></div>
          {reason==='Other'&&<div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Specify</label>
            <input type="text" value={custom} onChange={(e: ChangeEvent<HTMLInputElement>)=>setCustom(e.target.value)} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/></div>}
          {error&&<div style={{background:'#fef2f2',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#991b1b'}}>{error}</div>}
          <div style={{background:'#fefce8',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#854d0e'}}>A new order will be created for re-cleaning at no charge, linked to the original.</div>
          <button onClick={submit} disabled={loading} style={{padding:'12px',background:'#023c62',color:'#fff',borderRadius:8,fontSize:13,fontWeight:700,border:'none',cursor:'pointer',opacity:loading?0.5:1}}>{loading?'Creating...':'Create Return Order'}</button>
        </div>
      </div>
    </div>
  )
}

export default function ReturnOrderPage() {
  return (
    <Suspense fallback={<div style={{ padding: '30px 36px 60px', color: '#6b7fa3' }}>Loading return order form...</div>}>
      <ReturnOrderPageContent />
    </Suspense>
  )
}
