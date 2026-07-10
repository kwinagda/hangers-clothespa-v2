'use client'
// ─────────────────────────────────────────────────────────────────────────────
// ORDER DETAIL PAGE
//   ✅ Pricing fetched from single source of truth — /api/v1/services
//   ✅ No hardcoded catalog or prices anywhere in this file
//   ✅ TBD shown for items with price = 0
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { authAPI, deliveryAPI, metadataAPI, ordersAPI, staffAPI, servicesAPI } from '@/lib/api'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import PaymentPanel from '@/components/PaymentPanel'
import { AlertTriangle, Bike, CalendarRange, ClipboardList, Clock3, IndianRupee, Lock, MapPin, MessageSquareText, PackageCheck, Printer, Receipt, ScrollText, Shirt, Smartphone, Tag, User } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const getStatusLabel = (status: string, source?: string, labels: Record<string, string> = {}) => {
  if (status === 'FABKLEAN_ORDER_CREATED') return 'Order Created'
  if (status === 'PICKED_UP' && (source === 'counter' || source === 'COUNTER' || source === 'walk-in')) return 'Received'
  return labels[status] || status
}
const EMPTY_WORKFLOW = {
  next: {} as Record<string, string>,
  allowedBackward: {} as Record<string, string[]>,
  crmEditableStatuses: [] as string[],
  plantLockedStatuses: [] as string[],
  requiresItems: [] as string[],
  cancellableStatuses: [] as string[],
  deliveredCorrectionTargets: [] as string[],
  riderAssignableStatuses: [] as string[],
}
const formatCurrency = (value: number) => `₹${(value || 0).toLocaleString('en-IN')}`
const getOutstandingAmount = (order: any) => Math.max(0, (order?.totalAmount || 0) - (order?.paidAmount || 0) - (order?.writeOffAmount || 0))
const getTimelineNote = (notes?: string | null) => {
  if (!notes) return ''

  const trimmed = String(notes).trim()
  if (!trimmed) return ''

  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object') return trimmed

    if (parsed.source === 'FABKLEAN_REPAIR') {
      if (parsed.dateSource === 'orderLog.eventTime') {
        const movement = parsed.from && parsed.to ? `${getStatusLabel(String(parsed.from))} to ${getStatusLabel(String(parsed.to))}` : 'Fabklean status update'
        return parsed.generatedName ? `${movement} by ${parsed.generatedName}` : movement
      }

      if (parsed.dateSource === 'order.actualPickupDate') return 'Fabklean order created date'
      if (parsed.dateSource === 'order.actualDeliveryDate') return 'Fabklean delivery date'
      if (parsed.dateSource === 'order.updatedTime') return 'Fabklean latest status date'
      if (parsed.dateSource === 'challan.plantsentDate') return parsed.challanNo ? `Sent to plant on challan ${parsed.challanNo}` : 'Sent to plant from Fabklean challan'
      if (parsed.dateSource === 'challan.orderDate') return parsed.challanNo ? `Plant challan ${parsed.challanNo}` : 'Fabklean challan date'
      if (parsed.dateSource === 'challan.plantDeliveryDate') return parsed.challanNo ? `Received from plant on challan ${parsed.challanNo}` : 'Received from plant date'

      return 'Fabklean migration date'
    }

    if (parsed.source && String(parsed.source).startsWith('FABKLEAN')) return 'Fabklean migration note'
  } catch {
    return trimmed
  }

  return trimmed
}
const ORDER_TONE = {
  blue: { color: '#023c62', soft: '#e8f0f7', border: '#d6e5f0' },
  amber: { color: '#9a4d00', soft: '#fff4e5', border: '#f1dcc0' },
  green: { color: '#0d7a4e', soft: '#e8f7f0', border: '#cdebdc' },
  violet: { color: '#5b2fb0', soft: '#f0ebff', border: '#dfd3fb' },
} as const

interface CartItem { category: string; name: string; qty: number; price: number }

function OrderShellCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 24,
        border: '1px solid #e4edf5',
        boxShadow: '0 12px 28px rgba(2,60,98,0.06)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '20px 24px 18px',
          borderBottom: '1px solid #edf3f8',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#023c62', fontFamily: 'var(--crm-font-display)' }}>{title}</h2>
          {subtitle && <p style={{ margin: 0, fontSize: 13, color: '#6b7fa3', lineHeight: 1.45 }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </section>
  )
}

function OrderMetric({
  icon: Icon,
  label,
  value,
  note,
  tone = 'blue',
}: {
  icon: any
  label: string
  value: string
  note: string
  tone?: keyof typeof ORDER_TONE
}) {
  const palette = ORDER_TONE[tone]
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 22,
        border: `1px solid ${palette.border}`,
        padding: '18px 18px 16px',
        boxShadow: '0 10px 24px rgba(2,60,98,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ width: 42, height: 42, borderRadius: 14, background: palette.soft, color: palette.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} />
        </div>
        <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7fa3', fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: 30, lineHeight: 1, fontWeight: 800, color: '#142033' }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: '#8ba0bb' }}>{note}</div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '10px 0', borderBottom: '1px solid #edf3f8', fontSize: 13 }}>
      <span style={{ color: '#6b7fa3' }}>{label}</span>
      <span style={{ color: '#142033', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const getTransitionKind = (currentStatus: string, nextStatus: string, workflow: typeof EMPTY_WORKFLOW) => {
  if (currentStatus === nextStatus) return 'noop'
  if (currentStatus === 'DELIVERED') {
    if (nextStatus === 'CANCELLED') return 'forbidden_delivered_cancel'
    return workflow.deliveredCorrectionTargets.includes(nextStatus) ? 'delivered_correction' : 'forbidden_delivered_change'
  }
  if (currentStatus === 'CANCELLED') return nextStatus === 'PENDING' ? 'restore' : 'forbidden_cancelled_change'
  if (nextStatus === 'CANCELLED') return 'cancel'
  if (workflow.allowedBackward[currentStatus]?.includes(nextStatus)) return 'backward'
  return 'forward'
}

const getCorrectionMeta = (kind: string) => {
  if (kind === 'cancel') return { title: 'Cancel Order', hint: 'A cancellation reason will be saved to the order history.', tone: '#991b1b', bg: '#fff1f2' }
  if (kind === 'restore') return { title: 'Restore Order', hint: 'Explain why this cancelled order is being restored to Pending.', tone: '#1d4ed8', bg: '#eff6ff' }
  if (kind === 'delivered_correction') return { title: 'High-Risk Correction', hint: 'This delivered order is being moved back to Ready for Delivery. A clear reason is required.', tone: '#9a3412', bg: '#fff7ed' }
  return { title: 'Workflow Correction', hint: 'Explain why this order needs to move backward in the workflow.', tone: '#5b21b6', bg: '#f5f3ff' }
}

const renderStageNote = (note?: string | null) => {
  if (!note) return null
  const match = note.match(/^\[(REVERSAL|CANCELLED|RESTORED|HIGH_RISK_CORRECTION)\]\s*(.*)$/)
  if (!match) return <span style={{ color: '#6b7fa3' }}> · {note}</span>
  const labels: Record<string, string> = {
    REVERSAL: 'Reversal',
    CANCELLED: 'Cancelled',
    RESTORED: 'Restored',
    HIGH_RISK_CORRECTION: 'High-risk correction',
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '2px 7px', background: '#edf3f8', color: '#42556f', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {labels[match[1]]}
      </span>
      {match[2] ? <span style={{ color: '#6b7fa3' }}>{match[2]}</span> : null}
    </span>
  )
}

const hasCorrectionAuthority = (staff: any) => {
  const perms = staff?.effectivePermissions || staff?.permissions || []
  return staff?.role === 'SUPER_ADMIN' || staff?.role === 'MANAGER' || perms.includes('*') || perms.includes('orders.edit')
}

const hasHighRiskCorrectionAuthority = (staff: any) => {
  const perms = staff?.effectivePermissions || staff?.permissions || []
  return staff?.role === 'SUPER_ADMIN' || perms.includes('*')
}

const getStatusChoices = (
  currentStatus: string,
  workflow: typeof EMPTY_WORKFLOW,
  staff: any
) => {
  const next = new Set<string>([currentStatus])
  const forwardStatus = workflow.next[currentStatus]
  if (forwardStatus && workflow.crmEditableStatuses.includes(forwardStatus)) {
    next.add(forwardStatus)
  }
  if (hasCorrectionAuthority(staff)) {
    ;(workflow.allowedBackward[currentStatus] || []).forEach((status) => next.add(status))
    if (workflow.crmEditableStatuses.includes('CANCELLED') && workflow.cancellableStatuses.includes(currentStatus)) {
      next.add('CANCELLED')
    }
  }
  if (currentStatus === 'DELIVERED' && hasHighRiskCorrectionAuthority(staff)) {
    workflow.deliveredCorrectionTargets.forEach((status) => next.add(status))
  }
  return Array.from(next)
}

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
export default function OrderDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const orderId = typeof params?.id === 'string' ? params.id : ''
  const [order,            setOrder]            = useState<any>(null)
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({})
  const [plantStatuses, setPlantStatuses] = useState<string[]>([])
  const [orderWorkflow, setOrderWorkflow] = useState(EMPTY_WORKFLOW)
  const [deliveryRoles, setDeliveryRoles] = useState<string[]>([])
  const [currentStaff, setCurrentStaff] = useState<any>(null)
  const [loading,          setLoading]          = useState(true)
  const [updating,         setUpdating]         = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(false)
  const [showPaymentPanel, setShowPaymentPanel] = useState(false)
  const [riders,           setRiders]           = useState<any[]>([])
  const [assigning,        setAssigning]        = useState(false)
  const leftColumnRef = useRef<HTMLDivElement>(null)
  const [leftColumnHeight, setLeftColumnHeight] = useState(0)
  const [statusModal, setStatusModal] = useState<{ open: boolean; target: string; kind: string; reason: string }>({
    open: false,
    target: '',
    kind: 'forward',
    reason: '',
  })

  const loadOrder = useCallback(async () => {
    if (!orderId) return
    try {
      const [orderR, staffR]: [any, any] = await Promise.all([
        ordersAPI.get(orderId),
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
  }, [deliveryRoles, orderId])

  useEffect(() => { loadOrder() }, [loadOrder])
  useEffect(() => {
    const node = leftColumnRef.current
    if (!node) return

    const updateHeight = () => setLeftColumnHeight(Math.ceil(node.getBoundingClientRect().height))
    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)
    window.addEventListener('resize', updateHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [order, showPaymentPanel])

  useEffect(() => {
    authAPI.me().then((r:any) => setCurrentStaff(r?.staff || r?.data?.staff || null)).catch(() => setCurrentStaff(null))
    metadataAPI.getAll().then((r:any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      const orderStatuses = metadata.orderStatuses || []
      setStatusLabels(orderStatuses.reduce((acc: Record<string, string>, item: any) => {
        acc[item.key] = item.label || item.key
        return acc
      }, {}))
      const workflow = { ...EMPTY_WORKFLOW, ...(metadata.orderWorkflow || {}) }
      setOrderWorkflow(workflow)
      setPlantStatuses(workflow.plantLockedStatuses || orderStatuses.filter((item: any) => item.plantManaged).map((item: any) => item.key))
      setDeliveryRoles((metadata.staffRoles || []).filter((item: any) => String(item.value || '').startsWith('DELIVERY_')).map((item: any) => item.value))
    }).catch(() => {
      setStatusLabels({})
      setPlantStatuses([])
      setOrderWorkflow(EMPTY_WORKFLOW)
      setDeliveryRoles([])
      toast.error('Failed to load order metadata')
    })
  }, [])

  const noItems     = !order?.items?.length
  const isAppOrder  = order?.source === 'APP'
  const canProgress = (targetStatus: string) => !(orderWorkflow.requiresItems.includes(targetStatus) && noItems)
  const statusChoices = getStatusChoices(order?.status, orderWorkflow, currentStaff)
  const statusLabel = (status: string) => getStatusLabel(status, order?.source, statusLabels)

  const updateStatus = async (status: string) => {
    if (!canProgress(status)) {
      toast.error('Add garment items first — cannot move to processing without items', { duration: 4000 })
      return
    }
    const transitionKind = getTransitionKind(order.status, status, orderWorkflow)
    if (transitionKind === 'forbidden_delivered_cancel') {
      toast.error('Delivered orders cannot be cancelled. Use the return / re-clean flow instead.')
      return
    }
    if (transitionKind === 'forbidden_delivered_change') {
      toast.error('Delivered orders can only be corrected back to Ready for Delivery by Super Admin.')
      return
    }
    if (transitionKind === 'forbidden_cancelled_change') {
      toast.error('Cancelled orders can only be restored back to Pending.')
      return
    }

    if (['backward', 'cancel', 'restore', 'delivered_correction'].includes(transitionKind)) {
      setStatusModal({ open: true, target: status, kind: transitionKind, reason: '' })
      return
    }
    setUpdating(true)
    try {
      await ordersAPI.updateStatus(orderId, status)
      await loadOrder()
      toast.success(`Status updated → ${statusLabel(status)}`)
    } catch (e: any) {
      if (e?.message?.includes('items') || e?.message?.includes('ITEMS_REQUIRED')) {
        toast.error('Add garment items before moving to processing', { duration: 4000 })
      } else {
        toast.error(e?.message || 'Failed to update status')
      }
    } finally { setUpdating(false) }
  }

  const submitStatusModal = async () => {
    if (!statusModal.reason.trim()) {
      toast.error('Reason is required for this status correction')
      return
    }
    setUpdating(true)
    try {
      await ordersAPI.updateStatus(orderId, statusModal.target, statusModal.reason.trim())
      await loadOrder()
      setStatusModal({ open: false, target: '', kind: 'forward', reason: '' })
      toast.success(`Status updated → ${statusLabel(statusModal.target)}`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update status')
    } finally {
      setUpdating(false)
    }
  }

  const assignRider = async (riderId: string) => {
    if (!riderId) return
    setAssigning(true)
    try {
      await deliveryAPI.assignOrder(orderId, riderId)
      await loadOrder()
      const rider = riders.find((r: any) => r.id === riderId)
      toast.success(`Order assigned to ${rider?.name}`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to assign rider')
    } finally { setAssigning(false) }
  }

  if (loading) return <div style={{padding:64,textAlign:'center',color:'#9dafc8',fontFamily:"var(--crm-font-ui)",fontSize:16}}>Loading order…</div>
  if (!order)  return null

  const isReturnedOriginal = order.status === 'CANCELLED' && order.notes?.includes('[RETURNED')
  const isLocked       = order.status === 'RETURNED' || isReturnedOriginal
  const nextSt         = orderWorkflow.next[order.status]
  const nextBlocked    = Boolean(nextSt && !canProgress(nextSt))
  const showItemsPanel = !order.isReturn && !isLocked && !plantStatuses.includes(order.status) && noItems && statusChoices.some((status) => orderWorkflow.requiresItems.includes(status))
  const canAssignRider = orderWorkflow.riderAssignableStatuses.includes(order.status)
  const outstandingAmount = getOutstandingAmount(order)
  const totalPieces = order.items?.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0

  return (
    <div style={{padding:'30px 36px 60px',maxWidth:1180,margin:'0 auto',fontFamily:"var(--crm-font-ui)"}}>
      {order.status === 'RETURNED' && (
        <div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:14,padding:'12px 16px',marginBottom:16,fontSize:13,color:'#991b1b'}}>
          This order has been returned. {order.notes?.includes('[RETURNED') && <span>{order.notes.match(/[RETURNED[^]]+]/)?.[0]?.replace(/[[]]/g,'')}</span>}
        </div>
      )}

      {order.isReturn && order.originalOrderId && (
        <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:14,padding:'12px 16px',marginBottom:16,fontSize:13,color:'#1d4ed8'}}>
          ↩ Return / Re-clean order — <Link href={'/dashboard/orders/'+order.originalOrderId} style={{color:'#1d4ed8',fontWeight:600}}>View original order</Link>
        </div>
      )}

      <div style={{marginBottom:22}}>
        <Link href="/dashboard/orders" style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,color:'#6b7fa3',fontWeight:600,textDecoration:'none',marginBottom:18}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Back to Orders
        </Link>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:20,flexWrap:'wrap' as const}}>
          <div>
            <div style={{fontFamily:'var(--crm-font-display)',fontWeight:800,fontSize:26,color:'#023c62',lineHeight:1.1}}>{order.orderNumber}</div>
            <div style={{fontSize:13,color:'#6b7fa3',marginTop:4}}>
              Placed {format(new Date(order.createdAt),'d MMM yyyy, h:mm a')} · {order.createdBy?.name || order.customer?.name || 'Staff'}
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' as const}}>
            <span className={`status-badge status-${order.status}`}>{statusLabel(order.status)}</span>
            {outstandingAmount > 0
              ? <span style={{padding:'4px 10px',borderRadius:999,fontSize:12,fontWeight:700,background:'#fee2e2',color:'#991b1b'}}>Unpaid</span>
              : <span style={{padding:'4px 10px',borderRadius:999,fontSize:12,fontWeight:700,background:'#dcfce7',color:'#166534'}}>Paid</span>
            }
            {isAppOrder && <span style={{padding:'4px 10px',borderRadius:999,fontSize:12,fontWeight:700,background:'#eff6ff',color:'#1d4ed8'}}>App Pickup</span>}
          </div>
        </div>
      </div>

      {showItemsPanel && (
        <div style={{background:'#fff8e6',border:'1.5px solid #f59e0b',borderRadius:18,padding:'16px 20px',marginBottom:22,display:'flex',alignItems:'flex-start',gap:14}}>
          <AlertTriangle size={22} color="#f59e0b" style={{flexShrink:0}} />
          <div>
            <div style={{fontWeight:800,color:'#92400e',fontSize:15,marginBottom:4}}>No garments logged yet</div>
            <div style={{fontSize:13,color:'#b45309',lineHeight:1.7}}>
              {isAppOrder
                ? 'This order started as an app pickup request. Log the garments collected during pickup before pushing it deeper into processing.'
                : 'This order does not have garment items yet. Add them before moving ahead in the workflow.'}
            </div>
          </div>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:14,marginBottom:20}}>
        <OrderMetric icon={IndianRupee} label="Order Total" value={formatCurrency(order.totalAmount || 0)} note="Current billed total from the order record." tone="blue" />
        <OrderMetric icon={PackageCheck} label="Garments" value={String(totalPieces)} note={noItems ? 'Items still need to be logged.' : `${order.items?.length || 0} distinct item line(s) added.`} tone="amber" />
        <OrderMetric icon={Receipt} label="Collected" value={formatCurrency((order.paidAmount || 0) + (order.writeOffAmount || 0))} note={order.writeOffAmount ? `Includes write-off of ${formatCurrency(order.writeOffAmount)}` : 'Payments and approved write-offs booked so far.'} tone="green" />
        <OrderMetric icon={Clock3} label="Outstanding" value={formatCurrency(outstandingAmount)} note={outstandingAmount === 0 ? 'No pending collection remains.' : 'Remaining amount still to be collected.'} tone="violet" />
      </div>

      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.6fr) minmax(340px,1fr)',gap:20,alignItems:'start'}}>
        {/* LEFT COLUMN */}
        <div ref={leftColumnRef} style={{minWidth:0}}>
          {showItemsPanel && (
            <AddItemsPanel orderId={order.id} currentTotal={order.totalAmount || 0} onAdded={loadOrder} />
          )}

          {/* Customer panel */}
          <div style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,marginBottom:20}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #edf3f8',fontFamily:'var(--crm-font-display)',fontWeight:700,fontSize:15,color:'#023c62',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              Customer
              <Link href={'/dashboard/customers/'+(order.customer?.id||'')} style={{fontSize:12.5,fontWeight:600,color:'#035a8f',textDecoration:'none'}}>View Profile</Link>
            </div>
            {[
              ['Name', order.customer?.name || '—'],
              ['Phone', order.customer?.phone ? '+91 '+order.customer.phone : '—'],
              ['Address', order.pickupAddress || 'No address on file'],
            ].map(([label,val]:any) => (
              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'10px 20px',fontSize:13.5,borderBottom:'1px solid #f3f7fa'}}>
                <span style={{color:'#6b7fa3'}}>{label}</span>
                <span style={{color:'#1a2332',fontWeight:600,textAlign:'right' as const,maxWidth:'60%'}}>{val}</span>
              </div>
            ))}
          </div>

          {/* Items panel */}
          <div style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,marginBottom:20}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #edf3f8',fontFamily:'var(--crm-font-display)',fontWeight:700,fontSize:15,color:'#023c62',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              {'Items'+(order.items?.length>0?' ('+order.items.length+')':'')}
              {noItems && <span style={{fontSize:12,padding:'4px 10px',background:'#fff8e6',color:'#b45309',borderRadius:20,fontWeight:700}}>No items yet</span>}
            </div>
            {noItems ? (
              <div style={{padding:'28px 20px',textAlign:'center' as const,color:'#9dafc8',fontSize:13}}>No garments logged yet</div>
            ) : (
              <>
                {order.items.map((it:any) => (
                  <div key={it.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 20px',borderBottom:'1px solid #f3f7fa'}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13.5,color:'#1a2332'}}>{it.serviceName}</div>
                      <div style={{fontSize:11.5,color:'#9dafc8',marginTop:2}}>Qty {it.quantity} · ₹{it.unitPrice} each</div>
                    </div>
                    <div style={{fontFamily:'var(--crm-font-mono)',fontWeight:700,color:'#023c62',fontSize:13.5}}>₹{(it.subtotal||it.unitPrice*it.quantity).toLocaleString('en-IN')}</div>
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'12px 20px',fontSize:14}}>
                  <span style={{color:'#6b7fa3'}}>Subtotal</span>
                  <span style={{fontFamily:'var(--crm-font-mono)'}}>₹{(order.subtotal||order.totalAmount||0).toLocaleString('en-IN')}</span>
                </div>
                {(order.discount||0)>0 && (
                  <div style={{display:'flex',justifyContent:'space-between',padding:'12px 20px',fontSize:14}}>
                    <span style={{color:'#6b7fa3'}}>Discount</span>
                    <span style={{fontFamily:'var(--crm-font-mono)'}}>−₹{order.discount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',padding:'14px 20px',fontSize:16,fontFamily:'var(--crm-font-display)',fontWeight:700,color:'#023c62',borderTop:'2px solid #023c62'}}>
                  <span>Total</span>
                  <span style={{fontFamily:'var(--crm-font-mono)'}}>₹{(order.totalAmount||0).toLocaleString('en-IN')}</span>
                </div>
              </>
            )}
          </div>

          {/* Delivery panel */}
          <div style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #edf3f8',fontFamily:'var(--crm-font-display)',fontWeight:700,fontSize:15,color:'#023c62'}}>Delivery</div>
            {[
              ['Pickup Date', order.pickupDate ? format(new Date(order.pickupDate),'d MMM yyyy') : 'Not scheduled'],
              ['Expected Delivery', order.deliveryDate ? format(new Date(order.deliveryDate),'d MMM yyyy') : 'Not scheduled'],
              ['Assigned Staff', order.assignedTo?.name || '—'],
            ].map(([label,val]:any) => (
              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'10px 20px',fontSize:13.5,borderBottom:'1px solid #f3f7fa'}}>
                <span style={{color:'#6b7fa3'}}>{label}</span>
                <span style={{color:'#1a2332',fontWeight:600}}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div
          className="order-detail-sidebox"
          style={{
            display:'flex',
            flexDirection:'column' as const,
            gap:12,
            height:leftColumnHeight ? leftColumnHeight : undefined,
            maxHeight:leftColumnHeight ? leftColumnHeight : undefined,
          }}
        >
          {/* Actions panel */}
          <div style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #edf3f8',fontFamily:'var(--crm-font-display)',fontWeight:700,fontSize:15,color:'#023c62'}}>Actions</div>
            <div style={{padding:16,display:'flex',flexDirection:'column' as const,gap:8}}>
              {nextSt && !isLocked && !order.isReturn && (
                <button onClick={()=>updateStatus(nextSt)} disabled={updating||nextBlocked}
                  style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',padding:11,borderRadius:9,fontSize:13.5,fontWeight:700,border:'none',cursor:nextBlocked?'not-allowed':'pointer',background:nextBlocked?'#f1f5f9':'#023c62',color:nextBlocked?'#9dafc8':'#fff',opacity:updating?0.6:1,whiteSpace:'normal' as const,lineHeight:1.35}}>
                  {nextBlocked && <AlertTriangle size={14} color="#f59e0b"/>}
                  {updating ? 'Updating…' : 'Mark as '+statusLabel(nextSt)}
                </button>
              )}
              {outstandingAmount>0 && (
                <button onClick={()=>setShowPaymentPanel(v=>!v)}
                  style={{display:'flex',alignItems:'center',justifyContent:'center',width:'100%',padding:11,borderRadius:9,fontSize:13.5,fontWeight:700,background:'#fff',color:'#023c62',border:'1.5px solid #dce8f0',cursor:'pointer'}}>
                  {showPaymentPanel ? 'Hide Payment Panel' : 'Record Payment'}
                </button>
              )}
              <div style={{display:'flex',gap:8}}>
                {order.customer?.phone && (
                  <a href={'https://wa.me/91'+order.customer.phone}
                    target="_blank" rel="noreferrer"
                    style={{flex:'1 1 0',minWidth:0,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:9,borderRadius:8,background:'#fff',border:'1px solid #dce8f0',color:'#3d5470',fontSize:12,fontWeight:600,textDecoration:'none'}}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l1.3-3.9A7.5 7.5 0 1 1 9 18.5L4 20z"/></svg>
                    Message
                  </a>
                )}
                <Link href={'/dashboard/print?orderId='+order.id+'&type=receipt'}
                  style={{flex:'1 1 0',minWidth:0,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:9,borderRadius:8,background:'#fff',border:'1px solid #dce8f0',color:'#3d5470',fontSize:12,fontWeight:600,textDecoration:'none'}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V4h12v5"/><path d="M6 18h12v3H6z"/><path d="M4 9h16v7H4z"/></svg>
                  Print
                </Link>
              </div>
              {orderWorkflow.cancellableStatuses.includes(order.status)&&!order.isReturn&&(
                <button onClick={()=>updateStatus('CANCELLED')}
                  style={{display:'flex',alignItems:'center',justifyContent:'center',width:'100%',padding:11,borderRadius:9,fontSize:13.5,fontWeight:700,background:'#fff',color:'#c0392b',border:'1.5px solid #f3c7bf',cursor:'pointer',marginTop:4}}>
                  Cancel Order
                </button>
              )}
            </div>
          </div>

          {/* Timeline panel */}
          <div style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #edf3f8',fontFamily:'var(--crm-font-display)',fontWeight:700,fontSize:15,color:'#023c62'}}>Timeline</div>
            <div style={{paddingTop:16}}>
              {!order.stages?.length ? (
                <div style={{padding:'20px',color:'#9dafc8',fontSize:13}}>No timeline entries yet</div>
              ) : (order.stages||[]).map((st:any,i:number,arr:any[])=>{
                const timelineNote = getTimelineNote(st.notes)
                return (
	                <div key={st.id} style={{display:'flex',gap:12,padding:'0 20px 18px',position:'relative' as const,minWidth:0}}>
                    <div style={{display:'flex',flexDirection:'column' as const,alignItems:'center'}}>
                      <div style={{width:10,height:10,borderRadius:999,background:'#023c62',marginTop:4,flexShrink:0}}/>
                      {i<arr.length-1&&<div style={{width:2,flex:1,background:'#e3edf6',margin:'3px 0'}}/>}
                    </div>
	                  <div style={{minWidth:0,flex:1}}>
	                    <div style={{fontSize:13,fontWeight:700,color:'#142033'}}>{statusLabel(st.stage)}</div>
	                    <div style={{fontSize:11.5,color:'#9dafc8',marginTop:2,overflowWrap:'anywhere' as const,lineHeight:1.45}}>{format(new Date(st.createdAt),'d MMM, h:mm a')}{timelineNote ? ` · ${timelineNote}` : ''}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Payment panel (toggled) */}
          {showPaymentPanel && (
            <PaymentPanel orderId={order.id} customerId={order.customer?.id} totalAmount={order.totalAmount||0} paidAmount={order.paidAmount||0} paymentStatus={order.paymentStatus||'UNPAID'} writeOffAlreadyDone={order.writeOffAmount||0} onPaymentRecorded={loadOrder} />
          )}

          {/* Rider assignment */}
          {canAssignRider && riders.length>0 && (
            <div style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,padding:16}}>
              <div style={{fontSize:11,color:'#6b7fa3',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase' as const,marginBottom:12}}>Assign Rider</div>
              <select defaultValue={order.assignedToId||''} onChange={e=>assignRider(e.target.value)} disabled={assigning}
                style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'10px 12px',fontSize:13,color:'#1a2332',opacity:assigning?0.6:1}}>
                <option value="">— Select a rider —</option>
                {riders.map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          {/* Status correction */}
          {statusChoices.length>1 && (
            <div style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,padding:16}}>
              <div style={{fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:10}}>Correct Status</div>
              {noItems && (
                <div style={{fontSize:12,color:'#b45309',background:'#fff8e6',borderRadius:8,padding:'7px 12px',marginBottom:10}}>Add items first to unlock processing statuses</div>
              )}
              <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
                {statusChoices.map((s:string)=>{
                  const isCurrent=s===order.status; const isBlocked=!isCurrent&&!canProgress(s)
                  return (
                    <button key={s} onClick={()=>updateStatus(s)} disabled={isCurrent||updating}
                      style={{padding:'6px 12px',borderRadius:8,fontSize:11,fontWeight:600,cursor:isCurrent||updating?'default':isBlocked?'not-allowed':'pointer',border:'1px solid '+(isCurrent?'#023c62':isBlocked?'#f59e0b':'#dce8f0'),background:isCurrent?'#023c62':isBlocked?'#fff8e6':'#fff',color:isCurrent?'#fff':isBlocked?'#b45309':'#6b7fa3',opacity:updating?0.6:1}}>
                      {statusLabel(s)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Print options */}
          <div style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,padding:16}}>
            <div style={{fontSize:11,fontWeight:600,color:'#6b7fa3',textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:10}}>More Print Options</div>
            <div style={{display:'grid',gap:8}}>
              {([
                ['/dashboard/print?orderId='+order.id+'&type=thermal','80mm Thermal'],
                ['/dashboard/print?orderId='+order.id+'&type=garment','Garment Tags'],
                ['/dashboard/print?orderId='+order.id+'&type=bag','Bag Tags'],
              ] as Array<[string, string]>).map(([href,label])=>(
                <Link key={href} href={href} style={{display:'flex',alignItems:'center',padding:'9px 12px',borderRadius:10,border:'1px solid #dce8f0',textDecoration:'none',color:'#023c62',fontSize:13,fontWeight:600}}>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
      {statusModal.open && (() => {
        const meta = getCorrectionMeta(statusModal.kind)
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.42)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:80, padding:20 }}>
            <div style={{ width:'100%', maxWidth:560, background:'#fff', borderRadius:24, border:'1px solid #e4edf5', boxShadow:'0 28px 64px rgba(2,60,98,0.22)', overflow:'hidden' }}>
              <div style={{ padding:'20px 24px 16px', background:meta.bg, borderBottom:'1px solid #edf3f8' }}>
                <div style={{ fontFamily:'var(--crm-font-display)', fontWeight:800, fontSize:22, color:meta.tone }}>{meta.title}</div>
                <div style={{ marginTop:6, fontSize:13, lineHeight:1.55, color:'#51657f' }}>
                  {statusLabel(order.status)} → {statusLabel(statusModal.target)}. {meta.hint}
                </div>
              </div>
              <div style={{ padding:24 }}>
                <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#6b7fa3', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
                  Reason
                </label>
                <textarea
                  value={statusModal.reason}
                  onChange={(e) => setStatusModal((current) => ({ ...current, reason: e.target.value }))}
                  placeholder="Enter the operational reason for this correction"
                  rows={4}
                  style={{ width:'100%', resize:'vertical', border:'1.5px solid #dce8f0', borderRadius:14, padding:'12px 14px', fontSize:14, lineHeight:1.5, color:'#142033', outline:'none', boxSizing:'border-box' }}
                />
                <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end', gap:10 }}>
                  <button
                    onClick={() => setStatusModal({ open: false, target: '', kind: 'forward', reason: '' })}
                    style={{ padding:'11px 16px', borderRadius:12, border:'1px solid #dce8f0', background:'#fff', color:'#51657f', fontWeight:700, cursor:'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitStatusModal}
                    disabled={updating}
                    style={{ padding:'11px 16px', borderRadius:12, border:'none', background:'#023c62', color:'#fff', fontWeight:800, cursor:'pointer', opacity: updating ? 0.65 : 1 }}
                  >
                    {updating ? 'Saving…' : 'Confirm Change'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
