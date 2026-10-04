'use client'
import { ChangeEvent, Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { metadataAPI, ordersAPI, returnOrderAPI } from '@/lib/api'
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
  const [sourceOrder,setSourceOrder] = useState<any>(null)
  const [selectedQty,setSelectedQty] = useState<Record<string,number>>({})
  const [selectedUnits,setSelectedUnits] = useState<Record<string,string[]>>({})
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
  const loadSourceOrder = async () => {
    if (!orderId.trim()) return
    try {
      const response:any = await ordersAPI.get(orderId.trim())
      const next = response?.order || response?.data?.order || response?.data
      setSourceOrder(next)
      setSelectedQty(Object.fromEntries((next?.items || []).map((item:any) => [item.id, Number(item.quantity || 1)])))
      setSelectedUnits(Object.fromEntries((next?.items || []).map((item:any) => [item.id, (item.garmentUnits || []).map((unit:any) => unit.id)])))
      if (next?.status !== 'DELIVERED') setError('Only delivered orders can enter the return / re-clean workflow')
      else setError('')
    } catch (e:any) {
      setSourceOrder(null)
      setError(e.message || 'Original order not found')
    }
  }
  useEffect(() => { if (sp.get('orderId')) loadSourceOrder() }, [])
  const submit = async () => {
    if(!orderId){setError('Enter the original order ID');return}
    if(!sourceOrder){setError('Load the original order first');return}
    if(sourceOrder.status !== 'DELIVERED'){setError('Only delivered orders can be returned or re-cleaned');return}
    if(reason.toUpperCase() === 'OTHER' && !custom.trim()){setError('Enter the custom return reason');return}
    const lines = (sourceOrder.items || []).map((item:any) => {
      const garmentUnitIds = selectedUnits[item.id] || []
      return { orderItemId:item.id, quantity:garmentUnitIds.length || Number(selectedQty[item.id] || 0), garmentUnitIds:garmentUnitIds.length ? garmentUnitIds : undefined }
    }).filter((line:any) => line.quantity > 0)
    if(!lines.length){setError('Select at least one garment line and quantity');return}
    setLoading(true); setError('')
    try {
      const r:any = await returnOrderAPI.create({
        originalOrderId:orderId.trim(), kind:'RECLEAN', reasonCode:reason.toUpperCase(),
        reasonNarrative:reason.toUpperCase()==='OTHER'?custom.trim():undefined,
        responsibility:'UNDER_REVIEW', disposition:'RECLEAN', priority:'NORMAL', lines,
      })
      if(r.data?.success!==false&&r.data) {
        setSuccess(r.returnOrder || r.data?.returnOrder || r.data)
        toast.success('Return order created')
      } else setError(r.data?.message||'Failed to create return order')
    } catch (e:any) {
      setError(e.message || 'Failed to create return order')
    } finally {
      setLoading(false)
    }
  }
  const inputStyle = {width:'100%',border:'1.5px solid #dce8f0',borderRadius:9,padding:'10px 13px',fontSize:13.5,boxSizing:'border-box' as const,fontFamily:'var(--crm-font-ui)',color:'#1a2332'}
  const labelStyle = {fontSize:12,fontWeight:600,color:'#3d5470',display:'block',marginBottom:7}
  if(success) return (
    <div style={{padding:'60px 36px',maxWidth:520,margin:'0 auto',...s,textAlign:'center'}}>
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
    <div style={{padding:'30px 36px 60px',maxWidth:520,margin:'0 auto',...s}}>
      <button onClick={()=>router.back()} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,color:'#6b7fa3',background:'none',border:'none',cursor:'pointer',marginBottom:18,fontWeight:600,fontFamily:'var(--crm-font-ui)'}}>← Back</button>
      <div style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:24,color:'#023c62',marginBottom:22}}>Return / Re-clean Order</div>
      <div style={{background:'#fff',borderRadius:14,border:'1px solid #e3edf6',padding:22}}>
        <div style={{display:'flex',flexDirection:'column' as const,gap:16}}>
          <div><label style={labelStyle}>Original Order ID *</label>
            <div style={{display:'flex',gap:8}}><input type="text" value={orderId} onChange={(e: ChangeEvent<HTMLInputElement>)=>{setOrderId(e.target.value);setSourceOrder(null)}} placeholder="Paste order ID" readOnly={!!sp.get('orderId')} style={{...inputStyle,fontFamily:'var(--crm-font-mono)'}}/>{!sp.get('orderId')&&<button onClick={loadSourceOrder} style={{padding:'0 14px',border:'none',borderRadius:9,background:'#e8f0f7',color:'#023c62',fontWeight:700,cursor:'pointer'}}>Load</button>}</div></div>
          <div><label style={labelStyle}>Reason *</label>
            <select value={reason} onChange={(e: ChangeEvent<HTMLSelectElement>)=>setReason(e.target.value)} style={inputStyle}>
              {reasons.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
            </select></div>
          {reason.toUpperCase()==='OTHER'&&<div><label style={labelStyle}>Specify</label>
            <input type="text" value={custom} onChange={(e: ChangeEvent<HTMLInputElement>)=>setCustom(e.target.value)} style={inputStyle}/></div>}
          {sourceOrder&&<div><label style={labelStyle}>Garments to Re-clean *</label>
            <div style={{display:'grid',gap:8}}>{(sourceOrder.items||[]).map((item:any)=><div key={item.id} style={{padding:'10px 12px',border:'1px solid #e3edf6',borderRadius:9}}>
              <div><div style={{fontSize:13,fontWeight:700,color:'#182538'}}>{item.serviceName}</div><div style={{fontSize:11,color:'#6b7fa3'}}>{item.variant||item.garmentType||'Garment'} · delivered qty {item.quantity}</div></div>
              {(item.garmentUnits||[]).length ? <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>{item.garmentUnits.map((unit:any)=>{
                const checked=(selectedUnits[item.id]||[]).includes(unit.id)
                return <label key={unit.id} style={{display:'flex',alignItems:'center',gap:5,border:`1px solid ${checked?'#86b4d2':'#dce8f0'}`,background:checked?'#eef7fc':'#fff',borderRadius:7,padding:'5px 8px',fontSize:10,fontFamily:'var(--crm-font-mono)',cursor:'pointer'}}><input type="checkbox" checked={checked} onChange={()=>setSelectedUnits(current=>{const values=current[item.id]||[];return {...current,[item.id]:checked?values.filter(id=>id!==unit.id):[...values,unit.id]}})}/>{unit.tagNumber}</label>
              })}</div> : <input type="number" min="0" max={item.quantity} value={selectedQty[item.id]??0} onChange={e=>setSelectedQty({...selectedQty,[item.id]:Math.max(0,Math.min(Number(item.quantity),Number(e.target.value)||0))})} style={{...inputStyle,padding:'7px 9px',marginTop:8}}/>}
            </div>)}</div>
          </div>}
          {error&&<div style={{background:'#fef2f2',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#991b1b'}}>{error}</div>}
          <div style={{background:'#fefce8',borderRadius:9,padding:'12px 14px',fontSize:13,color:'#854d0e'}}>A new order will be created for re-cleaning at no charge, linked to the original.</div>
          <button onClick={submit} disabled={loading||!sourceOrder||sourceOrder.status!=='DELIVERED'} style={{padding:'12px',background:'#023c62',color:'#fff',borderRadius:9,fontSize:14,fontWeight:700,border:'none',cursor:'pointer',opacity:loading||!sourceOrder||sourceOrder.status!=='DELIVERED'?0.5:1,fontFamily:'var(--crm-font-ui)'}}>{loading?'Creating...':'Open Return Case'}</button>
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
