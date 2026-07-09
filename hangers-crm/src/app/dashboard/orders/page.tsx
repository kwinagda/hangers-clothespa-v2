'use client'
import { Suspense, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { authAPI, ordersAPI, challanAPI, metadataAPI } from '@/lib/api'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { ArrowRight, CalendarDays, ClipboardList, IndianRupee, Lock, MoreHorizontal, PackageCheck, Plus, Search, Truck } from 'lucide-react'
import { InlineLoader, TableLoader } from '@/components/ui/Feedback'
import { PaginationControls } from '@/components/ui/PaginationControls'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

const getStatusLabel = (status: string, source: string, labels: Record<string, string>) => {
  if (status === 'PICKED_UP' && (source === 'counter' || source === 'COUNTER' || source === 'walk-in')) return 'Received'
  return labels[status] || status
}
const BACKWARD_TRANSITIONS: Record<string, string[]> = {
  PICKED_UP: ['PENDING'],
  PROCESSING: ['PICKED_UP'],
  IRONING: ['PROCESSING'],
  READY_FOR_DELIVERY: ['IRONING', 'PROCESSING'],
  OUT_FOR_DELIVERY: ['READY_FOR_DELIVERY'],
  CANCELLED: ['PENDING'],
}
const DELIVERED_CORRECTION_TARGETS = ['READY_FOR_DELIVERY']
const CANCELLABLE_STATUSES = ['PENDING', 'PICKED_UP', 'PROCESSING', 'READY_FOR_DELIVERY']
const formatCurrency = (value: number) => `₹${(value || 0).toLocaleString('en-IN')}`
const NEXT_STATUS: Record<string, string> = {
  PENDING: 'PICKED_UP',
  PICKED_UP: 'PROCESSING',
  PROCESSING: 'IRONING',
  IRONING: 'READY_FOR_DELIVERY',
  READY_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
}
const HIDDEN_STATUS_CHOICES = new Set(['WASHING', 'DRYING', 'QC', 'RETURNED'])
const ORDER_VIEWS = [
  { key: 'all', label: 'All Orders', title: 'All Orders', description: 'Complete operational queue across every order status.', metric: 'Total queue' },
  { key: 'in_process', label: 'In Process', title: 'In-Process Orders', description: 'Orders currently being processed, sent to plant, or pending ironing.', metric: 'Working queue' },
  { key: 'ready', label: 'Ready', title: 'Ready Orders', description: 'Orders cleaned, packed, and ready for delivery.', metric: 'Ready queue' },
  { key: 'delivered', label: 'Delivered', title: 'Delivered Orders', description: 'Completed orders delivered to customers.', metric: 'Delivered queue' },
  { key: 'cancelled', label: 'Cancelled / Returns', title: 'Cancelled / Return Orders', description: 'Cancelled orders and imported return records.', metric: 'Closed exceptions' },
]

const viewFromSearchParams = (params: URLSearchParams) => {
  const direct = params.get('view') || ''
  if (ORDER_VIEWS.some((item) => item.key === direct)) return direct
  const legacyStatus = params.get('status') || ''
  if (legacyStatus === 'PROCESSING') return 'in_process'
  if (legacyStatus === 'READY_FOR_DELIVERY') return 'ready'
  if (legacyStatus === 'DELIVERED') return 'delivered'
  if (legacyStatus === 'CANCELLED' || legacyStatus === 'RETURNED') return 'cancelled'
  return 'all'
}

const isReturnOrder = (order: any) => Boolean(order?.isReturn || order?.status === 'RETURNED' || /-RT(?:-|$)/i.test(String(order?.orderNumber || '')))

const getTransitionKind = (currentStatus: string, nextStatus: string) => {
  if (currentStatus === nextStatus) return 'noop'
  if (currentStatus === 'DELIVERED') {
    if (nextStatus === 'CANCELLED') return 'forbidden_delivered_cancel'
    return DELIVERED_CORRECTION_TARGETS.includes(nextStatus) ? 'delivered_correction' : 'forbidden_delivered_change'
  }
  if (currentStatus === 'CANCELLED') return nextStatus === 'PENDING' ? 'restore' : 'forbidden_cancelled_change'
  if (nextStatus === 'CANCELLED') return 'cancel'
  if (BACKWARD_TRANSITIONS[currentStatus]?.includes(nextStatus)) return 'backward'
  return 'forward'
}

const getCorrectionMeta = (kind: string) => {
  if (kind === 'cancel') return { title: 'Cancel Order', hint: 'A cancellation reason will be saved to the order history.', tone: '#991b1b', bg: '#fff1f2' }
  if (kind === 'restore') return { title: 'Restore Order', hint: 'Explain why this cancelled order is being restored to Pending.', tone: '#1d4ed8', bg: '#eff6ff' }
  if (kind === 'delivered_correction') return { title: 'High-Risk Correction', hint: 'This delivered order is being moved back to Ready for Delivery. A clear reason is required.', tone: '#9a3412', bg: '#fff7ed' }
  return { title: 'Workflow Correction', hint: 'Explain why this order needs to move backward in the workflow.', tone: '#5b21b6', bg: '#f5f3ff' }
}

const hasCorrectionAuthority = (staff: any) => {
  const perms = staff?.effectivePermissions || staff?.permissions || []
  return staff?.role === 'SUPER_ADMIN' || staff?.role === 'MANAGER' || perms.includes('*') || perms.includes('orders.edit')
}

const hasHighRiskCorrectionAuthority = (staff: any) => {
  const perms = staff?.effectivePermissions || staff?.permissions || []
  return staff?.role === 'SUPER_ADMIN' || perms.includes('*')
}

const getStatusChoices = (currentStatus: string, baseStatuses: string[], staff: any) => {
  const next = new Set<string>([currentStatus])
  const forwardStatus = NEXT_STATUS[currentStatus]
  if (forwardStatus && baseStatuses.includes(forwardStatus)) {
    next.add(forwardStatus)
  }
  if (hasCorrectionAuthority(staff)) {
    ;(BACKWARD_TRANSITIONS[currentStatus] || []).forEach((status) => next.add(status))
    if (baseStatuses.includes('CANCELLED') && CANCELLABLE_STATUSES.includes(currentStatus)) {
      next.add('CANCELLED')
    }
  }
  if (currentStatus === 'DELIVERED' && hasHighRiskCorrectionAuthority(staff)) {
    DELIVERED_CORRECTION_TARGETS.forEach((status) => next.add(status))
  }
  return Array.from(next)
}

const summarizeItems = (items: any[] = []) => {
  const totalQty = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  const visible = items.slice(0, 3)
  return {
    totalQty,
    visible,
    extraCount: Math.max(0, items.length - visible.length),
  }
}

const paymentTone = (status: string) => {
  if (status === 'PAID') return { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' }
  if (status === 'PARTIAL') return { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' }
  return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
}

const READY_ALLOWED_STATUSES = new Set(['PROCESSING', 'IRONING', 'WASHING', 'DRYING', 'QC'])

function ItemSummary({ items }: { items: any[] }) {
  const summary = summarizeItems(items)
  if (!summary.totalQty) {
    return (
      <div style={{fontSize:12,color:'#9dafc8',fontWeight:600,lineHeight:1.35}}>
        No garments added
      </div>
    )
  }

  const itemNames = summary.visible
    .map((item: any) => {
      const name = item.garmentType || item.serviceName || item.service?.name || 'Item'
      return Number(item.quantity) > 1 ? `${item.quantity}x ${name}` : name
    })
    .join(', ')

  return (
    <div style={{display:'grid',gridTemplateColumns:'46px minmax(0,1fr)',gap:10,alignItems:'center',minWidth:0}}>
      <div style={{height:34,width:34,borderRadius:10,background:'#eef7ff',border:'1px solid #cfe3f4',color:'#035a8f',display:'grid',placeItems:'center',fontSize:13,fontWeight:800}}>
        {summary.totalQty}
      </div>
      <div style={{minWidth:0}}>
        <div style={{fontSize:13,color:'#26364a',fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',lineHeight:1.35}}>
          {itemNames}{summary.extraCount > 0 ? ` +${summary.extraCount} more` : ''}
        </div>
        <div style={{fontSize:11,color:'#8ba0bb',marginTop:2}}>
          {summary.totalQty === 1 ? '1 garment' : `${summary.totalQty} garments`}
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 22, border: '1px solid #e4edf5', padding: '18px 18px 16px', boxShadow: '0 10px 24px rgba(2,60,98,0.05)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7fa3', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: '#142033' }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#8ba0bb', lineHeight: 1.45 }}>{note}</div>
    </div>
  )
}

function OrdersPageContent() {
  const sp                      = useSearchParams()
  const router                  = useRouter()
  const pathname                = usePathname()
  const [orders, setOrders]     = useState<any[]>([])
  const [total,  setTotal]      = useState(0)
  const [loading,setLoading]    = useState(true)
  const [search, setSearch]     = useState('')
  const [view, setView]         = useState(viewFromSearchParams(sp))
  const [plantStatuses, setPlantStatuses] = useState<string[]>([])
  const [editableStatuses, setEditableStatuses] = useState<string[]>([])
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({})
  const [statusStyles, setStatusStyles] = useState<Record<string, { bg: string; text: string; border: string }>>({})
  const [plantPartners, setPlantPartners] = useState<Array<{ value: string; label: string }>>([])
  const [currentStaff, setCurrentStaff] = useState<any>(null)
  const [statusModal, setStatusModal] = useState<{ open: boolean; orderId: string; currentStatus: string; target: string; kind: string; reason: string }>({
    open: false,
    orderId: '',
    currentStatus: '',
    target: '',
    kind: 'forward',
    reason: '',
  })
  const [page,   setPage]       = useState(1)
  const [pageSize, setPageSize] = useState(30)

  // Bulk select state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showChallanModal, setShowChallanModal] = useState(false)
  const [challanForm, setChallanForm] = useState({ plant: '', driverName: '', vehicleNo: '' })
  const [creatingChallan, setCreatingChallan] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await ordersAPI.list({ page, limit:pageSize, view, search:search||undefined })
      setOrders(asArray(r.data, ['orders', 'items']))
      setTotal(r.data?.pagination?.total || 0)
    } catch { toast.error('Failed to load orders') }
    finally { setLoading(false) }
  }, [page, pageSize, view, search])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const nextView = viewFromSearchParams(sp)
    setView((current) => current === nextView ? current : nextView)
    setPage(1)
  }, [sp])

  const applyOrderView = (nextView: string) => {
    setView(nextView)
    setPage(1)
    const params = new URLSearchParams(sp.toString())
    if (nextView && nextView !== 'all') params.set('view', nextView)
    else params.delete('view')
    params.delete('status')
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  useEffect(() => {
    authAPI.me().then((r:any) => setCurrentStaff(r?.staff || r?.data?.staff || null)).catch(() => setCurrentStaff(null))
    metadataAPI.getAll()
      .then((r: any) => {
        const metadata = r?.metadata || r?.data?.metadata || {}
        const orderStatuses = metadata.orderStatuses || []
        setPlantStatuses(orderStatuses.filter((item: any) => item.plantManaged).map((item: any) => item.key))
        setEditableStatuses(orderStatuses.filter((item: any) => item.crmEditable && !HIDDEN_STATUS_CHOICES.has(item.key)).map((item: any) => item.key))
        setStatusLabels(Object.fromEntries(orderStatuses.map((item: any) => [item.key, item.label])))
        setStatusStyles(Object.fromEntries(orderStatuses.map((item: any) => [item.key, {
          bg: item.bg || '#f7f9fc',
          text: item.color || '#023c62',
          border: item.border || '#dce8f0',
        }])))
        const nextPlantPartners = metadata.plantPartners || []
        setPlantPartners(nextPlantPartners)
        if (nextPlantPartners.length) {
          setChallanForm((prev) => ({ ...prev, plant: prev.plant || nextPlantPartners[0].value }))
        }
      })
      .catch(() => {
        toast.error('Failed to load order metadata')
      })
  }, [])

  const updateStatus = async (id: string, currentStatus: string, newStatus: string) => {
    const transitionKind = getTransitionKind(currentStatus, newStatus)
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
      setStatusModal({ open: true, orderId: id, currentStatus, target: newStatus, kind: transitionKind, reason: '' })
      return
    }
    try {
      await ordersAPI.updateStatus(id, newStatus)
      toast.success('Status updated')
      load()
    } catch(e:any) { toast.error(e.message) }
  }

  const markReady = (order: any) => {
    if (!READY_ALLOWED_STATUSES.has(order.status)) return
    updateStatus(order.id, order.status, 'READY_FOR_DELIVERY')
  }

  const submitStatusModal = async () => {
    if (!statusModal.reason.trim()) {
      toast.error('Reason is required for this status correction')
      return
    }
    try {
      await ordersAPI.updateStatus(statusModal.orderId, statusModal.target, statusModal.reason.trim())
      toast.success('Status updated')
      setStatusModal({ open: false, orderId: '', currentStatus: '', target: '', kind: 'forward', reason: '' })
      load()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update status')
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleAll = () => {
    if (selected.size === orders.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(orders.map((o:any) => o.id)))
    }
  }

  const createChallan = async () => {
    if (selected.size === 0) { toast.error('Select at least one order'); return }
    setCreatingChallan(true)
    try {
      const selectedOrders = orders.filter((o:any) => selected.has(o.id))
      await challanAPI.create({
        plant: challanForm.plant,
        orderIds: selectedOrders.map((o:any) => o.id),
        driverName: challanForm.driverName,
        vehicleNo: challanForm.vehicleNo,
      })

      toast.success(`${selected.size} challan${selected.size > 1 ? 's' : ''} created — orders sent to plant`)
      setSelected(new Set())
      setShowChallanModal(false)
      setChallanForm({ plant: plantPartners[0]?.value || '', driverName: '', vehicleNo: '' })
      load()
    } catch(e:any) {
      toast.error(e.message || 'Failed to create challans')
    }
    setCreatingChallan(false)
  }

  const selectedOrders = orders.filter((o:any) => selected.has(o.id))
  const visibleValue = orders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)
  const plantLockedCount = orders.filter((order: any) => plantStatuses.includes(order.status)).length
  const noItemsCount = orders.filter((order: any) => !order.items?.length).length
  const activeView = ORDER_VIEWS.find((item) => item.key === view) || ORDER_VIEWS[0]

  return (
    <div className="crm-page-enter" style={{padding:'30px 34px',maxWidth:1380,margin:'0 auto'}}>
      <section style={{background:'linear-gradient(135deg,#022f50 0%,#035a8f 58%,#0b6f84 100%)',borderRadius:28,padding:'26px 28px',color:'#fff',boxShadow:'0 22px 52px rgba(2,60,98,0.18)',marginBottom:22}}>
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.45fr) minmax(320px,0.85fr)',gap:20,alignItems:'stretch'}}>
          <div>
            <h1 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:32,color:'#fff',margin:'0 0 8px'}}>{activeView.title}</h1>
            <p style={{fontSize:14,color:'rgba(232,240,247,0.88)',margin:'0 0 16px',lineHeight:1.6,maxWidth:720}}>
              {activeView.description}
            </p>
            <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
              <span style={{display:'inline-flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:14,background:'rgba(255,255,255,0.12)',fontSize:13,color:'#eaf3fb'}}>
                <PackageCheck size={14} />
                {total} {activeView.metric.toLowerCase()} orders
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:14,background:'rgba(255,255,255,0.12)',fontSize:13,color:'#eaf3fb'}}>
                <Truck size={14} />
                {plantLockedCount} sent to plant
              </span>
              <span style={{display:'inline-flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:14,background:'rgba(255,255,255,0.12)',fontSize:13,color:'#eaf3fb'}}>
                <IndianRupee size={14} />
                Visible value {formatCurrency(visibleValue)}
              </span>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:12,justifyContent:'space-between',background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.16)',borderRadius:24,padding:20}}>
            <div>
              <div style={{fontSize:11,color:'rgba(232,240,247,0.72)',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6}}>Primary Action</div>
              <div style={{fontSize:15,fontWeight:700,lineHeight:1.5,color:'#fff'}}>Create a fresh counter order or batch selected orders into a plant challan.</div>
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <Link href="/dashboard/orders/new" className="crm-card-hover" style={{display:'inline-flex',alignItems:'center',gap:8,background:'#fff',color:'#023c62',textDecoration:'none',padding:'12px 18px',borderRadius:14,fontWeight:800,fontFamily:"var(--crm-font-ui)",fontSize:14}}>
                <Plus size={16} /> New Order
              </Link>
              {selected.size > 0 && (
                <button onClick={() => setShowChallanModal(true)} style={{display:'inline-flex',alignItems:'center',gap:8,background:'#166534',color:'#fff',padding:'12px 18px',borderRadius:14,fontWeight:800,fontFamily:"var(--crm-font-ui)",fontSize:14,border:'none',cursor:'pointer'}}>
                  <ClipboardList size={16} /> Create Challan ({selected.size})
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:18,marginBottom:22}}>
        <MetricCard label={activeView.metric} value={String(total)} note="Orders loaded from this dedicated backend view." />
        <MetricCard label="Visible Value" value={formatCurrency(visibleValue)} note="Combined billed amount across the loaded page." />
        <MetricCard label="Sent to Plant" value={String(plantLockedCount)} note="Orders locked until they are received back." />
        <MetricCard label="Needs Items" value={String(noItemsCount)} note="Orders on this page with no garment lines yet." />
      </div>

      <section style={{background:'#fff',borderRadius:24,border:'1px solid #e4edf5',boxShadow:'0 12px 28px rgba(2,60,98,0.06)',padding:22,marginBottom:18}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:10,marginBottom:18}}>
          {ORDER_VIEWS.map((item) => {
            const active = item.key === view
            return (
              <button
                key={item.key}
                onClick={() => applyOrderView(item.key)}
                style={{
                  textAlign:'left',
                  border:active?'1.5px solid #035a8f':'1px solid #dce8f0',
                  background:active?'#eef7ff':'#fff',
                  color:active?'#023c62':'#52677f',
                  borderRadius:12,
                  padding:'11px 12px',
                  cursor:'pointer',
                  fontWeight:800,
                  fontSize:12,
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:16,flexWrap:'wrap'}}>
          <div>
            <h2 style={{margin:'0 0 4px',fontFamily:'var(--crm-font-display)',fontWeight:700,fontSize:19,color:'#023c62'}}>{activeView.label} Search</h2>
            <p style={{margin:0,fontSize:13,color:'#6b7fa3'}}>Search and batch-select only the orders in this view.</p>
          </div>
          {selected.size > 0 && <div style={{fontSize:13,color:'#023c62',fontWeight:700,background:'#e8f0f7',borderRadius:999,padding:'8px 14px'}}>{selected.size} selected</div>}
        </div>
        <div style={{display:'flex',gap:12,flexWrap:'wrap' as const}}>
          <div style={{flex:1,minWidth:220,position:'relative'}}>
            <Search size={16} color="#9dafc8" style={{position:'absolute',left:14,top:12}} />
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search order #, name, phone..."
              style={{width:'100%',border:'1.5px solid #dce8f0',borderRadius:10,padding:'10px 14px 10px 38px',fontSize:14,outline:'none',background:'#fff'}}/>
          </div>
          <button onClick={load}
            style={{padding:'10px 20px',borderRadius:10,background:'#e8f0f7',border:'1px solid #dce8f0',color:'#023c62',fontWeight:600,fontSize:14,cursor:'pointer'}}>
            Refresh
          </button>
        </div>
      </section>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{background:'#023c62',borderRadius:16,padding:'12px 16px',marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:13,color:'#fff'}}>
          <span><strong>{selected.size}</strong> order{selected.size > 1 ? 's' : ''} selected</span>
          <div style={{display:'flex',gap:8}}>
            <button onClick={() => setShowChallanModal(true)}
              style={{padding:'6px 14px',background:'#fff',color:'#023c62',borderRadius:8,fontSize:12,fontWeight:700,border:'none',cursor:'pointer'}}>
              Create Challan & Send to Plant
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{padding:'6px 14px',background:'rgba(255,255,255,0.15)',color:'#fff',borderRadius:8,fontSize:12,border:'none',cursor:'pointer'}}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="crm-surface orders-table-surface" style={{borderRadius:24,overflow:'visible',boxShadow:'0 12px 28px rgba(2,60,98,0.06)'}}>
        <div style={{padding:'18px 22px',borderBottom:'1px solid #edf3f8',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',background:'#fff'}}>
          <div>
            <h2 style={{margin:'0 0 4px',fontFamily:'var(--crm-font-display)',fontWeight:700,fontSize:19,color:'#023c62'}}>{activeView.title}</h2>
            <p style={{margin:0,fontSize:13,color:'#6b7fa3'}}>This table is loaded from the dedicated {activeView.label.toLowerCase()} API view.</p>
          </div>
          <Link href="/dashboard/orders/new" style={{display:'inline-flex',alignItems:'center',gap:6,textDecoration:'none',color:'#035a8f',fontSize:13,fontWeight:700}}>
            Create new order <ArrowRight size={14} />
          </Link>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',overflow:'visible'}}>
          <thead><tr style={{background:'#fbfcfe'}}>
            <th style={{padding:'12px 12px 12px 18px',borderBottom:'1px solid #e8f0f7',width:34}}>
              <input type="checkbox" checked={selected.size === orders.length && orders.length > 0}
                onChange={toggleAll} style={{cursor:'pointer'}}/>
            </th>
            {['Order','Customer','Garments / Service','Status','Payment','Dates','Actions'].map(h=>(
              <th key={h} style={{padding:'12px 14px',textAlign:'left',fontSize:11,fontWeight:800,color:'#7c8da5',letterSpacing:'0.08em',textTransform:'uppercase' as const,borderBottom:'1px solid #e8f0f7'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={8} style={{padding:0}}><TableLoader rows={6} columns={7} /></td></tr>
              : !orders.length
                ? <tr><td colSpan={8} style={{padding:48,textAlign:'center',color:'#9dafc8',fontSize:15}}>
                    No orders found.<br/>
                    <Link href="/dashboard/orders/new" style={{color:'#023c62',fontWeight:600}}>Create the first one →</Link>
                  </td></tr>
                : orders.map((o:any,i:number)=>{
                    const isSentToPlant = o.status === 'SENT_TO_PLANT'
                    const orderIsReturn = isReturnOrder(o)
                    const statusChoices = getStatusChoices(o.status, editableStatuses, currentStaff)
                    const isLockedToPlantOnly = (plantStatuses.includes(o.status) && statusChoices.length <= 1) || orderIsReturn
                    const statusStyle = orderIsReturn
                      ? { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' }
                      : statusStyles[o.status] || { bg: '#f7f9fc', text: '#023c62', border: '#dce8f0' }
                    const displayStatusLabel = orderIsReturn ? 'Return Order' : getStatusLabel(o.status, o.source, statusLabels)
                    return (
                      <tr key={o.id} className="crm-table-row" style={{borderBottom:'1px solid #edf3f8',background:selected.has(o.id)?'#eff6ff':'#fff',position:'relative'}}>
                        <td style={{padding:'16px 12px 16px 18px'}}>
                          <input type="checkbox" checked={selected.has(o.id)}
                            onChange={() => toggleSelect(o.id)} style={{cursor:'pointer'}}
	                            disabled={isSentToPlant || orderIsReturn}/>
                        </td>
                        <td style={{padding:'16px 14px',minWidth:132}}>
                          <Link href={`/dashboard/orders/${o.id}`}
                            style={{fontFamily:"var(--crm-font-mono)",fontSize:14,fontWeight:800,color:'#023c62',textDecoration:'none'}}>
                            {o.orderNumber}
                          </Link>
                          {isSentToPlant && <span style={{fontSize:10,background:'#fef9c3',color:'#854d0e',padding:'2px 6px',borderRadius:4,marginLeft:6,fontWeight:600}}>AT PLANT</span>}
                        </td>
                        <td style={{padding:'16px 14px',minWidth:180}}>
                          <div style={{fontSize:14,fontWeight:700,color:'#1a2332',lineHeight:1.35}}>{o.customer?.name||'—'}</div>
                          <div style={{fontSize:12,color:'#8ba0bb',marginTop:3}}>+91 {o.customer?.phone}</div>
                        </td>
                        <td style={{padding:'16px 14px',fontSize:13,color:'#31445c',minWidth:280,maxWidth:340}}>
                          <ItemSummary items={o.items || []} />
                        </td>
                        <td style={{padding:'16px 14px',minWidth:160}}>
                          {isLockedToPlantOnly
                            ? <span style={{fontSize:12,fontWeight:800,padding:'7px 10px',borderRadius:10,color:statusStyle.text,background:statusStyle.bg,border:`1px solid ${statusStyle.border}`}}>
	                                <span style={{display:'inline-flex',alignItems:'center',gap:6}}><Lock size={12} /> {displayStatusLabel}</span>
                              </span>
                            : <select value={o.status} onChange={e=>updateStatus(o.id, o.status, e.target.value)}
                                style={{border:`1px solid ${statusStyle.border}`,cursor:'pointer',fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:12,outline:'none',borderRadius:10,padding:'7px 10px',background:statusStyle.bg,color:statusStyle.text,maxWidth:150}}>
	                                {statusChoices.map(s=><option key={s} value={s}>{s === o.status ? displayStatusLabel : getStatusLabel(s, o.source, statusLabels)}</option>)}
                              </select>
                          }
                        </td>
                        <td style={{padding:'16px 14px',minWidth:118}}>
                          <div style={{fontWeight:900,color:'#023c62',fontSize:15,lineHeight:1.2}}>₹{o.totalAmount?.toLocaleString('en-IN')}</div>
                          <span style={{display:'inline-flex',marginTop:6,fontSize:10,fontWeight:800,padding:'3px 7px',borderRadius:7,border:`1px solid ${paymentTone(o.paymentStatus).border}`,background:paymentTone(o.paymentStatus).bg,color:paymentTone(o.paymentStatus).color}}>
                            {o.paymentStatus || 'UNPAID'}
                          </span>
                        </td>
                        <td style={{padding:'16px 14px',fontSize:12,color:'#6b7fa3',minWidth:124}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,color:'#31445c',fontWeight:800}}><CalendarDays size={13} /> {format(new Date(o.createdAt),'dd MMM yy')}</div>
                          {o.deliveryDate && <div style={{marginTop:5,color:'#0f766e',fontWeight:700}}>Due {format(new Date(o.deliveryDate),'dd MMM')}</div>}
                        </td>
                        <td style={{padding:'16px 18px 16px 14px',position:'relative',overflow:'visible',minWidth:166}}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,position:'relative',zIndex:2}}>
                            {READY_ALLOWED_STATUSES.has(o.status) && (
                              <button
                                onClick={() => markReady(o)}
                                style={{height:32,padding:'0 13px',borderRadius:9,border:'1px solid #b7ead4',background:'#ecfdf5',color:'#047857',fontSize:12,fontWeight:900,cursor:'pointer'}}
                              >
                                Clean
                              </button>
                            )}
                            <Link href={`/dashboard/orders/${o.id}`}
                              style={{fontSize:12,color:'#035a8f',fontWeight:800,textDecoration:'none',padding:'0 4px'}}>
                              View
                            </Link>
                            <details className="crm-action-menu" style={{position:'relative',zIndex:1000}}>
                              <summary
                                title="More order actions"
                                aria-label="More order actions"
                                style={{listStyle:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:8,border:'1px solid #dce8f0',background:'#fff',color:'#6b7fa3'}}
                              >
                                <MoreHorizontal size={16} strokeWidth={2.6} />
                              </summary>
                              <div style={{position:'absolute',right:0,top:36,minWidth:190,background:'#fff',border:'1px solid #dce8f0',borderRadius:12,boxShadow:'0 16px 34px rgba(2,60,98,0.18)',padding:8,zIndex:9999}}>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=receipt`} style={{display:'block',padding:'8px 10px',fontSize:12,color:'#023c62',textDecoration:'none',borderRadius:8,background:'transparent'}}>Print A4 Receipt</Link>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=thermal`} style={{display:'block',padding:'8px 10px',fontSize:12,color:'#023c62',textDecoration:'none',borderRadius:8,background:'transparent'}}>Print 80mm Thermal</Link>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=garment`} style={{display:'block',padding:'8px 10px',fontSize:12,color:'#023c62',textDecoration:'none',borderRadius:8,background:'transparent'}}>Print Garment Tags</Link>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=bag`} style={{display:'block',padding:'8px 10px',fontSize:12,color:'#023c62',textDecoration:'none',borderRadius:8,background:'transparent'}}>Print Bag Tags</Link>
                              </div>
                            </details>
                          </div>
                        </td>
                      </tr>
                    )
                  })
            }
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalItems={total}
        itemLabel="orders"
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        pageSizeOptions={[10, 20, 30, 50, 100]}
      />

      {/* Create Challan Modal */}
      {showChallanModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
          <div style={{background:'#fff',borderRadius:16,padding:24,width:'100%',maxWidth:480,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
            <h2 style={{fontFamily:"var(--crm-font-display)",fontWeight:700,fontSize:18,marginBottom:4}}>Create Delivery Challan</h2>
            <p style={{fontSize:13,color:'#6b7fa3',marginBottom:20}}>
              {selected.size} order{selected.size > 1 ? 's' : ''} will be sent to the plant and locked until the plant marks them as received.
            </p>

            {/* Selected orders preview */}
            <div style={{background:'#f8fafc',borderRadius:8,padding:12,marginBottom:16,maxHeight:120,overflowY:'auto' as const}}>
              {selectedOrders.map((o:any) => (
                <div key={o.id} style={{fontSize:12,color:'#374151',padding:'3px 0',display:'flex',justifyContent:'space-between'}}>
                  <span style={{fontFamily:'monospace',color:'#023c62'}}>{o.orderNumber}</span>
                  <span style={{color:'#6b7fa3'}}>{o.customer?.name}</span>
                </div>
              ))}
            </div>

            <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
              <div>
                <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Send to Plant *</label>
                <select value={challanForm.plant} onChange={(e:any)=>setChallanForm({...challanForm,plant:e.target.value})}
                  style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                  {plantPartners.map((plant) => <option key={plant.value} value={plant.value}>{plant.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Driver Name</label>
                <input type="text" value={challanForm.driverName} onChange={(e:any)=>setChallanForm({...challanForm,driverName:e.target.value})}
                  placeholder="Optional"
                  style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
              <div>
                <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Vehicle No</label>
                <input type="text" value={challanForm.vehicleNo} onChange={(e:any)=>setChallanForm({...challanForm,vehicleNo:e.target.value})}
                  placeholder="Optional"
                  style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/>
              </div>
            </div>

            <div style={{background:'#fef9c3',borderRadius:8,padding:'10px 14px',marginTop:14,fontSize:12,color:'#854d0e'}}>
              Once sent to plant, orders will be locked from status updates until the plant marks the challan as Received.
            </div>

            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
              <button onClick={()=>setShowChallanModal(false)}
                style={{padding:'8px 16px',fontSize:13,color:'#6b7fa3',background:'none',border:'none',cursor:'pointer'}}>
                Cancel
              </button>
              <button onClick={createChallan} disabled={creatingChallan}
                style={{padding:'10px 20px',background:'#166534',color:'#fff',borderRadius:8,fontSize:13,fontWeight:700,border:'none',cursor:'pointer',opacity:creatingChallan?0.5:1}}>
                {creatingChallan ? <InlineLoader label="Creating" tone="light" /> : `Send to Plant & Create Challan${selected.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {statusModal.open && (() => {
        const meta = getCorrectionMeta(statusModal.kind)
        return (
          <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.42)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:55,padding:20}}>
            <div style={{width:'100%',maxWidth:560,background:'#fff',borderRadius:24,border:'1px solid #e4edf5',boxShadow:'0 28px 64px rgba(2,60,98,0.22)',overflow:'hidden'}}>
              <div style={{padding:'20px 24px 16px',background:meta.bg,borderBottom:'1px solid #edf3f8'}}>
                <div style={{fontFamily:'var(--crm-font-display)',fontWeight:800,fontSize:22,color:meta.tone}}>{meta.title}</div>
                <div style={{marginTop:6,fontSize:13,lineHeight:1.55,color:'#51657f'}}>
                  {getStatusLabel(statusModal.currentStatus, '', statusLabels)} → {getStatusLabel(statusModal.target, '', statusLabels)}. {meta.hint}
                </div>
              </div>
              <div style={{padding:24}}>
                <label style={{display:'block',fontSize:12,fontWeight:700,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Reason</label>
                <textarea
                  value={statusModal.reason}
                  onChange={(e)=>setStatusModal((current)=>({...current,reason:e.target.value}))}
                  placeholder="Enter the operational reason for this correction"
                  rows={4}
                  style={{width:'100%',resize:'vertical',border:'1.5px solid #dce8f0',borderRadius:14,padding:'12px 14px',fontSize:14,lineHeight:1.5,color:'#142033',outline:'none',boxSizing:'border-box'}}
                />
                <div style={{marginTop:16,display:'flex',justifyContent:'flex-end',gap:10}}>
                  <button onClick={()=>setStatusModal({ open:false, orderId:'', currentStatus:'', target:'', kind:'forward', reason:'' })} style={{padding:'11px 16px',borderRadius:12,border:'1px solid #dce8f0',background:'#fff',color:'#51657f',fontWeight:700,cursor:'pointer'}}>
                    Cancel
                  </button>
                  <button onClick={submitStatusModal} style={{padding:'11px 16px',borderRadius:12,border:'none',background:'#023c62',color:'#fff',fontWeight:800,cursor:'pointer'}}>
                    Confirm Change
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

export default function OrdersPage() {
  return (
    <Suspense fallback={<div style={{ padding: '32px 36px', color: '#6b7fa3' }}><InlineLoader label="Loading orders" /></div>}>
      <OrdersPageContent />
    </Suspense>
  )
}
