'use client'
// ─────────────────────────────────────────────────────────────────────────────
// ORDER DETAIL PAGE
//   ✅ Pricing fetched from single source of truth — /api/v1/services
//   ✅ No hardcoded catalog or prices anywhere in this file
//   ✅ TBD shown for items with price = 0
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { metadataAPI, ordersAPI, staffAPI, servicesAPI } from '@/lib/api'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import PaymentPanel from '@/components/PaymentPanel'
import { AlertTriangle, Bike, ClipboardList, Clock3, Lock, MessageSquareText, Printer, Receipt, ScrollText, Shirt, Smartphone, Tag, User } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const getStatusLabel = (status: string, source?: string, labels: Record<string, string> = {}) => {
  if (status === 'PICKED_UP' && (source === 'counter' || source === 'COUNTER' || source === 'walk-in')) return 'Received'
  return labels[status] || status
}
const NEXT_STATUS: Record<string,string> = {
  PENDING:'PICKED_UP', PICKED_UP:'PROCESSING', PROCESSING:'WASHING',
  WASHING:'DRYING', DRYING:'IRONING', IRONING:'QC',
  QC:'READY_FOR_DELIVERY', READY_FOR_DELIVERY:'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY:'DELIVERED',
}
const REQUIRES_ITEMS = ['PROCESSING','WASHING','DRYING','IRONING','QC','READY_FOR_DELIVERY','OUT_FOR_DELIVERY','DELIVERED']

interface CartItem { category: string; name: string; qty: number; price: number }

// ── Inline Add Items Panel ────────────────────────────────────────────────────
function AddItemsPanel({ orderId, currentTotal, onAdded }: { orderId: string; currentTotal: number; onAdded: () => void }) {
  const [catalog,    setCatalog]    = useState<Record<string, { name: string; price: number }[]>>({})
  const [categories, setCategories] = useState<string[]>([])
  const [activeCat,  setActiveCat]  = useState('')
  const [search,     setSearch]     = useState('')
  const [cart,       setCart]       = useState<CartItem[]>([])
  const [discount,   setDiscount]   = useState(0)
  const [saving,     setSaving]     = useState(false)
  const [loadingCat, setLoadingCat] = useState(true)

  useEffect(() => {
    servicesAPI.getCatalog()
      .then((res: any) => {
        const map: Record<string, { name: string; price: number }[]> = {}
        const items = Array.isArray(res) ? res : (res.catalog ? res.catalog.flatMap((c: any) => c.items.map((i: any) => ({...i, category: c.category}))) : []);
        items.forEach((item: any) => {
          if (!map[item.category]) map[item.category] = [];
          map[item.category].push({ name: item.name, price: item.basePrice || item.price || 0 });
        });
        if (false) {
        } setCatalog(map)
        const cats = Object.keys(map)
        setCategories(cats)
        if (cats.length) setActiveCat(cats[0])
      })
      .catch(() => toast.error('Failed to load catalog'))
      .finally(() => setLoadingCat(false))
  }, [])

  const addToCart = (cat: string, name: string, price: number) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.category === cat && i.name === name)
      if (idx >= 0) { const n=[...prev]; n[idx]={...n[idx],qty:n[idx].qty+1}; return n }
      return [...prev, { category:cat, name, qty:1, price }]
    })
  }
  const updateQty = (idx: number, delta: number) => {
    setCart(prev => {
      const n=[...prev]; const nq=n[idx].qty+delta
      if (nq<=0) return n.filter((_,i)=>i!==idx)
      n[idx]={...n[idx],qty:nq}; return n
    })
  }

  const cartSubtotal = cart.reduce((s,i)=>s+i.qty*i.price, 0)
  const cartTotal    = Math.max(0, cartSubtotal - discount)
  const totalItems   = cart.reduce((s,i)=>s+i.qty, 0)
  const filtered     = (catalog[activeCat]||[]).filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))

  const save = async () => {
    if (!cart.length) { toast.error('Add at least one item'); return }
    setSaving(true)
    try {
      await ordersAPI.addItems(orderId, {
        items: cart.map(i => ({ serviceName:i.name, garmentType:i.category, quantity:i.qty, unitPrice:i.price, subtotal:i.qty*i.price })),
        discount,
      })
      toast.success(`${totalItems} garment${totalItems!==1?'s':''} added to order!`)
      setCart([]); setDiscount(0)
      onAdded()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add items')
    } finally { setSaving(false) }
  }

  if (loadingCat) return (
    <div style={{background:'#fff',borderRadius:20,border:'1.5px solid #023c62',padding:32,textAlign:'center',color:'#9dafc8'}}>
      Loading catalog…
    </div>
  )

  return (
    <div style={{background:'#fff',borderRadius:20,border:'1.5px solid #023c62',overflow:'hidden',boxShadow:'0 4px 20px rgba(2,60,98,0.12)'}}>
      <div style={{background:'linear-gradient(135deg,#023c62,#035a8f)',padding:'16px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{color:'#fff',fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:16}}>＋ Add Garment Items</div>
          <div style={{color:'rgba(184,208,232,0.7)',fontSize:12,marginTop:2}}>Select garments collected during pickup</div>
        </div>
        {cart.length > 0 && (
          <div style={{background:'rgba(255,255,255,0.15)',borderRadius:20,padding:'4px 14px',color:'#fff',fontSize:13,fontWeight:700}}>
            {totalItems} item{totalItems!==1?'s':''} · ₹{cartTotal.toLocaleString('en-IN')}
          </div>
        )}
      </div>

      <div style={{padding:20}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {categories.map(cat => (
            <button key={cat} onClick={()=>{setActiveCat(cat);setSearch('')}}
              style={{padding:'5px 12px',borderRadius:20,border:`1.5px solid ${activeCat===cat?'#023c62':'#dce8f0'}`,background:activeCat===cat?'#023c62':'#fff',color:activeCat===cat?'#fff':'#6b7fa3',fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
              {cat}
            </button>
          ))}
        </div>

        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search item..."
          style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'9px 13px',fontSize:13,outline:'none',marginBottom:10,boxSizing:'border-box'}}/>

        <div style={{maxHeight:260,overflowY:'auto',marginBottom:16}}>
          {filtered.map(item => {
            const inCart = cart.find(i=>i.category===activeCat&&i.name===item.name)
            return (
              <div key={item.name} style={{display:'flex',alignItems:'center',padding:'9px 4px',borderBottom:'1px solid #f0f4f8'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500,color:'#1a2332'}}>{item.name}</div>
                  <div style={{fontSize:11,color:item.price===0?'#f59e0b':'#9dafc8'}}>
                    {item.price===0 ? 'TBD' : `₹${item.price}`} per piece
                  </div>
                </div>
                {inCart ? (
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <button onClick={()=>updateQty(cart.indexOf(inCart),-1)}
                      style={{width:28,height:28,borderRadius:7,background:'#023c62',border:'none',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:16,lineHeight:'1'}}>−</button>
                    <span style={{fontWeight:700,color:'#023c62',minWidth:18,textAlign:'center',fontSize:14}}>{inCart.qty}</span>
                    <button onClick={()=>updateQty(cart.indexOf(inCart),+1)}
                      style={{width:28,height:28,borderRadius:7,background:'#023c62',border:'none',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:16,lineHeight:'1'}}>+</button>
                  </div>
                ) : (
                  <button onClick={()=>addToCart(activeCat,item.name,item.price)}
                    style={{background:'#f0f5fa',border:'1.5px solid #023c62',borderRadius:8,padding:'5px 14px',color:'#023c62',fontWeight:700,cursor:'pointer',fontSize:12}}>
                    + Add
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {cart.length > 0 && (
          <div style={{background:'#f7f9fc',borderRadius:14,padding:16,borderTop:'2px solid #e8f0f7'}}>
            <div style={{fontWeight:700,color:'#023c62',fontSize:14,marginBottom:10}}>
              Cart — {totalItems} garment{totalItems!==1?'s':''}
            </div>
            {cart.map((it,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'4px 0',borderBottom:'1px solid #e8f0f7'}}>
                <span style={{color:'#6b7fa3'}}>{it.name} <span style={{fontSize:11}}>({it.category})</span></span>
                <span style={{fontWeight:600}}>
                  {it.price===0 ? `×${it.qty} = TBD` : `×${it.qty} = ₹${it.qty*it.price}`}
                </span>
              </div>
            ))}
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:10}}>
              <label style={{fontSize:12,color:'#6b7fa3',flexShrink:0}}>Discount (₹)</label>
              <input type="number" value={discount} onChange={e=>setDiscount(Number(e.target.value)||0)} min={0}
                style={{width:80,border:'1.5px solid #dce8f0',borderRadius:8,padding:'5px 8px',fontSize:13,textAlign:'right',outline:'none'}}/>
            </div>
            <div style={{marginTop:10,display:'flex',justifyContent:'space-between',fontWeight:700,color:'#023c62',fontSize:15}}>
              <span>Order Total</span>
              <span>₹{(currentTotal + cartTotal).toLocaleString('en-IN')}</span>
            </div>
            <button onClick={save} disabled={saving}
              style={{width:'100%',marginTop:12,background:'#023c62',color:'#fff',border:'none',borderRadius:12,padding:'13px',fontWeight:700,cursor:'pointer',fontSize:14,fontFamily:"var(--crm-font-ui)"}}>
              {saving ? 'Saving…' : `Save ${totalItems} Item${totalItems!==1?'s':''} to Order`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Order Detail Page
// ─────────────────────────────────────────────────────────────────────────────
export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [order,            setOrder]            = useState<any>(null)
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({})
  const [plantStatuses, setPlantStatuses] = useState<string[]>([])
  const [crmStatuses, setCrmStatuses] = useState<string[]>([])
  const [deliveryRoles, setDeliveryRoles] = useState<string[]>([])
  const [loading,          setLoading]          = useState(true)
  const [updating,         setUpdating]         = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(false)
  const [riders,           setRiders]           = useState<any[]>([])
  const [assigning,        setAssigning]        = useState(false)

  const loadOrder = useCallback(async () => {
    try {
      const [orderR, staffR]: [any, any] = await Promise.all([
        ordersAPI.get(params.id),
        staffAPI.list(),
      ])
      setOrder(orderR.data?.order || orderR.data)
      const allStaff = staffR.data?.staff || []
      setRiders(allStaff.filter((s: any) =>
        deliveryRoles.includes(s.role) && s.isActive
      ))
    } catch {
      toast.error('Order not found')
      router.push('/dashboard/orders')
    } finally { setLoading(false) }
  }, [deliveryRoles, params.id])

  useEffect(() => { loadOrder() }, [loadOrder])
  useEffect(() => {
    metadataAPI.getAll().then((r:any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      const orderStatuses = metadata.orderStatuses || []
      setStatusLabels(orderStatuses.reduce((acc: Record<string, string>, item: any) => {
        acc[item.key] = item.label || item.key
        return acc
      }, {}))
      setPlantStatuses(orderStatuses.filter((item: any) => item.plantManaged).map((item: any) => item.key))
      setCrmStatuses(orderStatuses.filter((item: any) => item.crmEditable && item.key !== 'RETURNED' && item.key !== 'SENT_TO_PLANT').map((item: any) => item.key))
      setDeliveryRoles((metadata.staffRoles || []).filter((item: any) => String(item.value || '').startsWith('DELIVERY_')).map((item: any) => item.value))
    }).catch(() => {})
  }, [])

  const noItems     = !order?.items?.length
  const isAppOrder  = order?.source === 'APP'
  const canProgress = (targetStatus: string) => !(REQUIRES_ITEMS.includes(targetStatus) && noItems)
  const statusLabel = (status: string) => getStatusLabel(status, order?.source, statusLabels)

  const updateStatus = async (status: string) => {
    if (!canProgress(status)) {
      toast.error('Add garment items first — cannot move to processing without items', { duration: 4000 })
      return
    }
    setUpdating(true)
    try {
      const r: any = await ordersAPI.updateStatus(params.id, status)
      setOrder(r.data?.order || r.data)
      toast.success(`Status updated → ${statusLabel(status)}`)
    } catch (e: any) {
      if (e?.message?.includes('items') || e?.message?.includes('ITEMS_REQUIRED')) {
        toast.error('Add garment items before moving to processing', { duration: 4000 })
      } else {
        toast.error(e?.message || 'Failed to update status')
      }
    } finally { setUpdating(false) }
  }

  const assignRider = async (riderId: string) => {
    if (!riderId) return
    setAssigning(true)
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}/delivery/orders/${params.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${document.cookie.match(/crm_token=([^;]+)/)?.[1] || ''}` },
        body: JSON.stringify({ riderId }),
      })
      await loadOrder()
      const rider = riders.find((r: any) => r.id === riderId)
      toast.success(`Order assigned to ${rider?.name}`)
    } catch {
      toast.error('Failed to assign rider')
    } finally { setAssigning(false) }
  }

  if (loading) return <div style={{padding:64,textAlign:'center',color:'#9dafc8',fontFamily:"var(--crm-font-ui)",fontSize:16}}>Loading order…</div>
  if (!order)  return null

  const isReturnedOriginal = order.status === 'CANCELLED' && order.notes?.includes('[RETURNED')
  const isLocked       = order.status === 'RETURNED' || isReturnedOriginal
  const nextSt         = NEXT_STATUS[order.status]
  const nextBlocked    = nextSt && !canProgress(nextSt)
  const showItemsPanel = !order.isReturn && ['PENDING','PICKED_UP','PROCESSING'].includes(order.status) && noItems

  return (
    <div style={{padding:'32px 36px',maxWidth:1100,margin:'0 auto',fontFamily:"var(--crm-font-ui)"}}>

      {/* Returned banner */}

      {order.status === 'RETURNED' && (

        <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',marginBottom:16,fontSize:13,color:'#991b1b'}}>

          This order has been returned. {order.notes?.includes('[RETURNED') && <span>{order.notes.match(/[RETURNED[^]]+]/)?.[0]?.replace(/[[]]/g,'')}</span>}

        </div>

      )}

      {order.isReturn && order.originalOrderId && (

        <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'12px 16px',marginBottom:16,fontSize:13,color:'#1d4ed8'}}>

          ↩ Return / Re-clean order — <Link href={'/dashboard/orders/'+order.originalOrderId} style={{color:'#1d4ed8',fontWeight:600}}>View original order</Link>

        </div>

      )}

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <Link href="/dashboard/orders" style={{padding:'8px 16px',borderRadius:10,border:'1.5px solid #dce8f0',background:'#fff',color:'#6b7fa3',textDecoration:'none',fontSize:14}}>
            ← Orders
          </Link>
          <div>
            <h1 style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:24,color:'#023c62',margin:'0 0 4px'}}>
              {order.orderNumber}
              {isAppOrder && <span style={{fontSize:11,background:'#dbeafe',color:'#1d4ed8',borderRadius:20,padding:'2px 10px',fontWeight:700,marginLeft:10,verticalAlign:'middle',display:'inline-flex',alignItems:'center',gap:6}}><Smartphone size={11} />App Pickup</span>}
            </h1>
            <p style={{fontSize:13,color:'#6b7fa3',margin:0}}>
              Created {format(new Date(order.createdAt),'dd MMM yyyy, h:mm a')}
            </p>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:13,padding:'6px 14px',borderRadius:20,background:'#e8f0f7',color:'#023c62',fontWeight:700}}>
            {statusLabel(order.status)}
          </span>
          {nextSt && !isLocked && !order.isReturn && (
            <button onClick={() => updateStatus(nextSt)} disabled={updating}
              title={nextBlocked ? 'Add items first before moving to processing' : ''}
              style={{background:nextBlocked?'#f0f4f8':'#023c62',color:nextBlocked?'#9dafc8':'#fff',border:nextBlocked?'1.5px dashed #dce8f0':'none',borderRadius:10,padding:'10px 18px',fontSize:13,fontWeight:700,cursor:nextBlocked?'not-allowed':'pointer',fontFamily:"var(--crm-font-ui)",display:'flex',alignItems:'center',gap:8}}>
              {nextBlocked && <AlertTriangle size={14} color="#f59e0b" />}
              {updating ? 'Updating…' : `→ Mark as ${statusLabel(nextSt)}`}
            </button>
          )}
        </div>
      </div>

      {/* Warning banner */}
      {noItems && !['DELIVERED','CANCELLED'].includes(order.status) && (
        <div style={{background:'#fff8e6',border:'1.5px solid #f59e0b',borderRadius:14,padding:'14px 20px',marginBottom:20,display:'flex',alignItems:'flex-start',gap:14}}>
          <AlertTriangle size={22} color="#f59e0b" style={{flexShrink:0}} />
          <div>
            <div style={{fontWeight:700,color:'#92400e',fontSize:15,marginBottom:4}}>No garments logged — add items before processing</div>
            <div style={{fontSize:13,color:'#b45309',lineHeight:1.7}}>
              {isAppOrder
                ? 'This order was booked via the customer app as a pickup request. Please add the garments collected during pickup before moving the order forward.'
                : 'This order has no garment items. Please add items using the panel below before advancing the status.'}
            </div>
            <div style={{marginTop:8,fontSize:12,color:'#b45309',background:'rgba(245,158,11,0.1)',borderRadius:8,padding:'6px 12px',display:'inline-block'}}>
              Status cannot advance past "Picked Up" until items are added
            </div>
          </div>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:24,alignItems:'start'}}>
        <div style={{display:'flex',flexDirection:'column',gap:20}}>

          {showItemsPanel && (
            <AddItemsPanel orderId={order.id} currentTotal={order.totalAmount || 0} onAdded={loadOrder} />
          )}

          {/* Customer */}
          <div style={{background:'#fff',borderRadius:20,padding:24,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
            <h3 style={{fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:15,color:'#023c62',margin:'0 0 14px',display:'flex',alignItems:'center',gap:8}}><User size={16} />Customer</h3>
            <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontSize:12,color:'#6b7fa3',marginBottom:3}}>Name</div>
                <div style={{fontSize:16,fontWeight:600,color:'#1a2332'}}>{order.customer?.name||'—'}</div>
              </div>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontSize:12,color:'#6b7fa3',marginBottom:3}}>Phone</div>
                <div style={{fontSize:16,fontWeight:600,color:'#023c62'}}>+91 {order.customer?.phone}</div>
              </div>
              {order.pickupAddress && (
                <div style={{flex:2,minWidth:200}}>
                  <div style={{fontSize:12,color:'#6b7fa3',marginBottom:3}}>Pickup Address</div>
                  <div style={{fontSize:13,color:'#1a2332',lineHeight:1.5}}>{order.pickupAddress}</div>
                </div>
              )}
              <div style={{display:'flex',alignItems:'flex-end'}}>
                <Link href={`/dashboard/customers/${order.customer?.id}`} style={{fontSize:13,color:'#035a8f',fontWeight:500,textDecoration:'none',padding:'8px 14px',border:'1px solid #dce8f0',borderRadius:8,display:'inline-block'}}>
                  View Profile →
                </Link>
                {!['PENDING','CANCELLED','SENT_TO_PLANT'].includes(order.status) && !order.isReturn && (
                  <Link href={'/dashboard/orders/return?orderId=' + params.id} style={{fontSize:13,color:'#991b1b',fontWeight:500,textDecoration:'none',padding:'8px 14px',border:'1px solid #fca5a5',borderRadius:8,display:'inline-block',marginLeft:8}}>
                    Return / Re-clean
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Garments */}
          <div style={{background:'#fff',borderRadius:20,padding:24,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <h3 style={{fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:15,color:'#023c62',margin:0}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:8}}><Shirt size={16} />Garments {order.items?.length > 0 ? `(${order.items.length})` : ''}</span>
              </h3>
              {noItems && <span style={{fontSize:12,color:'#b45309',background:'#fff8e6',border:'1px solid #f59e0b',borderRadius:20,padding:'3px 12px',fontWeight:600}}>No items yet</span>}
            </div>
            {noItems ? (
              <div style={{textAlign:'center',padding:'28px 0',color:'#9dafc8'}}>
                <div style={{fontSize:36,marginBottom:10,display:'flex',justifyContent:'center'}}><ClipboardList size={36} color="#9dafc8" /></div>
                <div style={{fontSize:14,fontWeight:500,color:'#6b7fa3',marginBottom:4}}>No garments logged yet</div>
                <div style={{fontSize:13,color:'#9dafc8'}}>
                  {showItemsPanel ? 'Use the "Add Garment Items" panel above to log what was collected' : 'Items were not added to this order'}
                </div>
              </div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:'#f7f9fc'}}>
                    {['#','Item / Service','Category','Qty','Unit Price','Total'].map(h=>(
                      <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it:any,i:number)=>(
                    <tr key={it.id} style={{borderBottom:'1px solid #f0f4f8'}}>
                      <td style={{padding:'11px 14px',color:'#9dafc8',fontSize:13}}>{i+1}</td>
                      <td style={{padding:'11px 14px',fontSize:14,fontWeight:500}}>{it.serviceName}</td>
                      <td style={{padding:'11px 14px',fontSize:13,color:'#6b7fa3'}}>{it.garmentType}</td>
                      <td style={{padding:'11px 14px',fontSize:14}}>{it.quantity}</td>
                      <td style={{padding:'11px 14px',fontSize:14,color:'#6b7fa3'}}>₹{it.unitPrice}</td>
                      <td style={{padding:'11px 14px',fontSize:14,fontWeight:600,color:'#023c62'}}>₹{it.subtotal||it.unitPrice*it.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Timeline */}
          {!order.isReturn && <div style={{background:'#fff',borderRadius:20,padding:24,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h3 style={{fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:15,color:'#023c62',margin:0,display:'flex',alignItems:'center',gap:8}}><Clock3 size={16} />Status Timeline</h3>
              {(order.stages?.length||0) > 3 && (
                <button onClick={()=>setTimelineExpanded(v=>!v)}
                  style={{fontSize:12,color:'#035a8f',fontWeight:600,background:'#f0f5fa',border:'1px solid #dce8f0',borderRadius:20,padding:'4px 12px',cursor:'pointer'}}>
                  {timelineExpanded ? '▲ Show less' : `▼ Show all ${order.stages.length} entries`}
                </button>
              )}
            </div>
            {(()=>{
              const stages  = order.stages || []
              const visible = timelineExpanded ? stages : stages.slice(-3)
              const hidden  = stages.length - visible.length
              return (
                <>
                  {hidden > 0 && !timelineExpanded && (
                    <button onClick={()=>setTimelineExpanded(true)}
                      style={{width:'100%',background:'#f7f9fc',border:'1px dashed #dce8f0',borderRadius:10,padding:'8px',fontSize:12,color:'#6b7fa3',cursor:'pointer',marginBottom:14,fontWeight:500}}>
                      ↑ {hidden} earlier {hidden===1?'entry':'entries'} hidden — click to expand
                    </button>
                  )}
                  {visible.map((st:any,i:number)=>(
                    <div key={st.id} style={{display:'flex',gap:14,marginBottom:i<visible.length-1?14:0}}>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                        <div style={{width:10,height:10,borderRadius:'50%',background:i===visible.length-1?'#023c62':'#b8d0e8',marginTop:4,flexShrink:0}}/>
                        {i<visible.length-1&&<div style={{width:2,flex:1,background:'#e8f0f7',margin:'3px 0'}}/>}
                      </div>
                      <div style={{paddingBottom:i<visible.length-1?14:0}}>
                        <div style={{fontSize:13,fontWeight:i===visible.length-1?700:500,color:i===visible.length-1?'#023c62':'#1a2332'}}>{statusLabel(st.stage)}</div>
                        <div style={{fontSize:11,color:'#9dafc8',marginTop:2}}>{format(new Date(st.createdAt),'dd MMM yyyy, h:mm a')}{st.notes&&<span style={{color:'#6b7fa3'}}> · {st.notes}</span>}</div>
                      </div>
                    </div>
                  ))}
                </>
              )
            })()}
            <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid #e8f0f7'}}>
              <div style={{fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Update Status</div>
              {plantStatuses.includes(order.status) ? (
                <div style={{fontSize:13,color:'#1e40af',background:'#dbeafe',borderRadius:10,padding:'12px 16px',lineHeight:1.6,display:'flex',alignItems:'center',gap:10}}>
                  <Lock size={18} color="#1e40af" />
                  <div>
                    <div style={{fontWeight:700,marginBottom:2}}>Order is at the Plant</div>
                    <div style={{fontSize:12,color:'#3b82f6'}}>Status can only be updated by the plant team via the Staff App.</div>
                  </div>
                </div>
              ) : (
                <>
                {noItems && (
                  <div style={{fontSize:12,color:'#b45309',background:'#fff8e6',borderRadius:8,padding:'7px 12px',marginBottom:10,lineHeight:1.5}}>
                    Processing statuses are locked — add items first
                  </div>
                )}
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {crmStatuses.map(s => {
                  const isCurrent = s === order.status
                  const isBlocked = !isCurrent && !canProgress(s)
                  return (
                    <button key={s} onClick={() => updateStatus(s)} disabled={isCurrent || updating}
                      title={isBlocked ? 'Add items first' : ''}
                      style={{padding:'6px 12px',borderRadius:8,fontSize:11,fontWeight:600,cursor:isCurrent||updating?'default':isBlocked?'not-allowed':'pointer',border:`1px solid ${isCurrent?'#023c62':isBlocked?'#f59e0b':'#dce8f0'}`,background:isCurrent?'#023c62':isBlocked?'#fff8e6':'#fff',color:isCurrent?'#fff':isBlocked?'#b45309':'#6b7fa3',opacity:updating?0.6:1}}>
                      {isBlocked ? 'Locked: ' : ''}{statusLabel(s)}
                    </button>
                  )
                })}
              </div>
              </>
            )}
            </div>
          </div>}

          {order.notes && (
            <div style={{background:'#fff',borderRadius:20,padding:24,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
              <h3 style={{fontFamily:"var(--crm-font-ui)",fontWeight:700,fontSize:15,color:'#023c62',margin:'0 0 10px',display:'flex',alignItems:'center',gap:8}}><MessageSquareText size={16} />Notes</h3>
              <p style={{fontSize:14,color:'#6b7fa3',margin:0,lineHeight:1.6}}>{order.notes}</p>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          <div style={{background:'linear-gradient(135deg,#023c62,#035a8f)',borderRadius:20,padding:24,color:'#fff'}}>
            <div style={{fontSize:11,color:'rgba(184,208,232,0.7)',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:16}}>Payment Summary</div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,fontSize:14,color:'rgba(184,208,232,0.8)'}}>
              <span>Subtotal</span><span>₹{order.subtotal?.toLocaleString('en-IN') || 0}</span>
            </div>
            {order.discount>0&&(
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8,fontSize:14,color:'rgba(184,208,232,0.8)'}}>
                <span>Discount</span><span>−₹{order.discount?.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div style={{borderTop:'1px solid rgba(184,208,232,0.2)',paddingTop:12,display:'flex',justifyContent:'space-between',fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:24}}>
              <span>Total</span><span>₹{order.totalAmount?.toLocaleString('en-IN') || 0}</span>
            </div>
            <div style={{marginTop:12,fontSize:13,color:order.paidAmount>=(order.totalAmount||0)?'#4ade80':'#fbbf24'}}>
              {((order.paidAmount||0) + (order.writeOffAmount||0)) >= (order.totalAmount||0) ? 'Fully Paid' : `Pending: ₹${Math.max(0,(order.totalAmount||0)-(order.paidAmount||0)-(order.writeOffAmount||0)).toLocaleString('en-IN')}`}
            </div>
            {noItems && order.totalAmount===0 && (
              <div style={{marginTop:10,fontSize:11,color:'rgba(184,208,232,0.5)',fontStyle:'italic'}}>Total will update once items are added</div>
            )}
          </div>

          <PaymentPanel orderId={order.id} customerId={order.customer?.id} totalAmount={order.totalAmount||0} paidAmount={order.paidAmount||0} paymentStatus={order.paymentStatus||'UNPAID'} writeOffAlreadyDone={order.writeOffAmount||0} onPaymentRecorded={loadOrder} />

          {['READY_FOR_DELIVERY','OUT_FOR_DELIVERY','PENDING','PICKED_UP'].includes(order.status) && (
            <div style={{background:'#fff',borderRadius:20,padding:24,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
              <div style={{fontSize:11,color:'#6b7fa3',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:14,display:'flex',alignItems:'center',gap:6}}><Bike size={12} />Assign Delivery Rider</div>
              {order.assignedTo ? (
                <div style={{background:'#e8f0f7',borderRadius:12,padding:'10px 14px',marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:'#023c62'}}>{order.assignedTo.name}</div>
                    <div style={{fontSize:11,color:'#6b7fa3',marginTop:2}}>{order.assignedTo.phone} · {order.assignedTo.role.replace('_',' ')}</div>
                  </div>
                  <span style={{fontSize:11,background:'#d1fae5',color:'#065f46',fontWeight:700,padding:'3px 10px',borderRadius:20}}>Assigned</span>
                </div>
              ) : (
                <div style={{fontSize:12,color:'#f59e0b',background:'#fff8e6',borderRadius:8,padding:'7px 12px',marginBottom:12}}>No rider assigned yet</div>
              )}
              {riders.length === 0 ? (
                <div style={{fontSize:12,color:'#9dafc8'}}>No active delivery riders found. Add riders in Staff Management.</div>
              ) : (
                <select defaultValue={order.assignedToId||''} onChange={e=>assignRider(e.target.value)} disabled={assigning}
                  style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'10px 12px',fontSize:13,outline:'none',color:'#1a2332',background:'#f4f7fb',cursor:'pointer',opacity:assigning?0.6:1}}>
                  <option value="">— Select a rider —</option>
                  {riders.map((r:any) => <option key={r.id} value={r.id}>{r.name} · {r.role.replace('_',' ')}</option>)}
                </select>
              )}
            </div>
          )}

          <div style={{background:'#fff',borderRadius:20,padding:24,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
            <div style={{fontSize:11,color:'#6b7fa3',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:16}}>Order Info</div>
            {[
              {l:'Order #', v:order.orderNumber},
              {l:'Source',  v:order.source==='APP'?'App Pickup':order.source==='COUNTER'?'Walk-in':order.source},
              {l:'Status',  v:statusLabel(order.status)},
              {l:'Created', v:format(new Date(order.createdAt),'dd MMM yyyy')},
              ...(order.pickupDate?[{l:'Pickup Date',v:format(new Date(order.pickupDate),'dd MMM yyyy')}]:[]),
              ...(order.pickupSlot?[{l:'Pickup Slot',v:order.pickupSlot}]:[]),
              ...(order.deliveryDate?[{l:'Delivery',v:format(new Date(order.deliveryDate),'dd MMM')}]:[]),
            ].map(row=>(
              <div key={row.l} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #f0f4f8',fontSize:13}}>
                <span style={{color:'#6b7fa3'}}>{row.l}</span>
                <span style={{fontWeight:500,color:'#1a2332',fontFamily:row.l==='Order #'?"var(--crm-font-mono)":"var(--crm-font-ui)",textAlign:'right',maxWidth:160}}>{row.v}</span>
              </div>
            ))}
          </div>

          <div style={{background:'#fff',borderRadius:20,padding:24,border:'1px solid #e8f0f7',boxShadow:'0 2px 12px rgba(2,60,98,0.06)'}}>
            <div style={{fontSize:11,color:'#6b7fa3',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:16,display:'flex',alignItems:'center',gap:6}}><Printer size={12} />Print</div>
            <div style={{display:'grid',gap:10}}>
              <Link href={`/dashboard/print?orderId=${order.id}&type=receipt`} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,border:'1px solid #dce8f0',textDecoration:'none',color:'#023c62',fontSize:13,fontWeight:600}}>
                <Receipt size={15} /> A4 Receipt
              </Link>
              <Link href={`/dashboard/print?orderId=${order.id}&type=thermal`} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,border:'1px solid #dce8f0',textDecoration:'none',color:'#023c62',fontSize:13,fontWeight:600}}>
                <ScrollText size={15} /> 80mm Thermal Receipt
              </Link>
              <Link href={`/dashboard/print?orderId=${order.id}&type=garment`} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,border:'1px solid #dce8f0',textDecoration:'none',color:'#023c62',fontSize:13,fontWeight:600}}>
                <Tag size={15} /> Garment Tags
              </Link>
              <Link href={`/dashboard/print?orderId=${order.id}&type=bag`} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,border:'1px solid #dce8f0',textDecoration:'none',color:'#023c62',fontSize:13,fontWeight:600}}>
                <ClipboardList size={15} /> Bag Tags
              </Link>
            </div>
          </div>

          {noItems && !['DELIVERED','CANCELLED'].includes(order.status) && (
            <div style={{background:'#fff8e6',borderRadius:16,padding:18,border:'1px solid #f59e0b'}}>
              <div style={{fontWeight:700,color:'#92400e',fontSize:13,marginBottom:10,display:'flex',alignItems:'center',gap:6}}><ClipboardList size={14} />Next Steps</div>
              <div style={{fontSize:12,color:'#b45309',lineHeight:1.8}}>
                <div>1. Pickup confirmed — status is "{statusLabel(order.status)}"</div>
                <div>2. Use the panel to add garments</div>
                <div>3. Processing statuses unlock automatically</div>
                <div>4. Payment amount updates with items</div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
