'use client'
import { Suspense, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { authAPI, ordersAPI, challanAPI, metadataAPI, paymentsAPI } from '@/lib/api'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { CheckSquare, ChevronRight, ClipboardList, Ellipsis, Lock, MessageCircle, Package, Plus, Printer, Search, Square, X } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { InlineLoader, TableLoader } from '@/components/ui/Feedback'
import { PaginationControls } from '@/components/ui/PaginationControls'
import MissingVendorRatesModal from '@/components/MissingVendorRatesModal'
import { itemServiceCode } from '@/lib/serviceCode'
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
const EMPTY_WORKFLOW = {
  next: {} as Record<string, string>,
  allowedForward: {} as Record<string, string[]>,
  allowedBackward: {} as Record<string, string[]>,
  crmEditableStatuses: [] as string[],
  plantLockedStatuses: [] as string[],
  requiresItems: [] as string[],
  directReadyAllowedStatuses: [] as string[],
  directReadyTarget: '',
  cancellableStatuses: [] as string[],
  deliveredCorrectionTargets: [] as string[],
}
const openPrintWindow = (href: string) => {
  const url = new URL(href, window.location.origin)
  url.searchParams.set('autoprint', '1')
  url.searchParams.delete('frame')
  const win = window.open(url.toString(), `hangers-print-${Date.now()}`, 'width=980,height=760,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes')
  if (!win) {
    toast.error('Pop-up blocked. Allow pop-ups for CRM printing.')
    return
  }
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    if (event.data?.type === 'HANGERS_PRINT_DONE') {
      window.removeEventListener('message', onMessage)
    }
    if (event.data?.type === 'HANGERS_PRINT_ERROR') {
      window.removeEventListener('message', onMessage)
      toast.error(event.data?.message || 'Failed to prepare print')
    }
  }
  window.addEventListener('message', onMessage)
}
const formatCurrency = (value: number) => `₹${(value || 0).toLocaleString('en-IN')}`
const orderBalanceDue = (order: any) => {
  const explicit = Number(order?.balanceDue)
  const computed = Number(order?.totalAmount || 0) - Number(order?.paidAmount || 0) - Number(order?.writeOffAmount || 0)
  return Math.max(0, Number((Number.isFinite(explicit) ? explicit : computed).toFixed(2)))
}
const orderTotalQty = (order: any) => (order?.items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0)
const orderItemSummaryText = (order: any) => {
  const items = order?.items || []
  if (!items.length) return 'No garments'
  const visible = items.slice(0, 4).map((item: any) => {
    const name = item.serviceName || item.garmentType || item.service?.name || 'Item'
    const code = itemServiceCode(item)
    const codeSuffix = code && !name.includes(code) ? ` (${code})` : ''
    return `${Number(item.quantity) || 0}x ${name}${codeSuffix}`
  })
  return `${visible.join(', ')}${items.length > visible.length ? ` +${items.length - visible.length} more` : ''}`
}
const phoneNumberStyle = {
  fontSize: 11.5,
  color: '#9dafc8',
  fontFamily: 'var(--crm-font-mono)',
  fontWeight: 800,
  letterSpacing: '0.01em',
  lineHeight: 1.35,
}
type OrderViewMeta = { key: string; label: string; title: string; description: string; metric?: string; statuses?: string[] }
const DEFAULT_ORDER_VIEW: OrderViewMeta = {
  key: 'all',
  label: 'All Orders',
  title: 'All Orders',
  description: 'Complete operational queue.',
  metric: 'Total queue',
}

const normalizeOrderViews = (views: any): OrderViewMeta[] => {
  if (!views || typeof views !== 'object') return [DEFAULT_ORDER_VIEW]
  const normalized = Object.entries(views).map(([key, value]: [string, any]) => ({
    key,
    label: value?.label || key.replace(/_/g, ' '),
    title: value?.title || value?.label || key.replace(/_/g, ' '),
    description: value?.description || '',
    metric: value?.metric || '',
    statuses: Array.isArray(value?.statuses) ? value.statuses : Array.isArray(value) ? value : [],
  }))
  const allView = normalized.find((item) => item.key === 'all')
  return allView ? normalized : [DEFAULT_ORDER_VIEW, ...normalized]
}

const viewFromSearchParams = (params: URLSearchParams, orderViews: OrderViewMeta[]) => {
  const direct = params.get('view') || ''
  if (orderViews.some((item) => item.key === direct)) return direct
  const legacyStatus = params.get('status') || ''
  const matchedView = orderViews.find((item) => item.statuses?.includes(legacyStatus))
  if (matchedView) return matchedView.key
  return 'all'
}

const isReturnOrder = (order: any) => Boolean(order?.isReturn || order?.status === 'RETURNED' || /-RT(?:-|$)/i.test(String(order?.orderNumber || '')))

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

const hasCorrectionAuthority = (staff: any) => {
  const perms = staff?.effectivePermissions || staff?.permissions || []
  return staff?.role === 'SUPER_ADMIN' || staff?.role === 'MANAGER' || perms.includes('*') || perms.includes('orders.edit')
}

const hasHighRiskCorrectionAuthority = (staff: any) => {
  const perms = staff?.effectivePermissions || staff?.permissions || []
  return staff?.role === 'SUPER_ADMIN' || perms.includes('*')
}

const getStatusChoices = (currentStatus: string, workflow: typeof EMPTY_WORKFLOW, staff: any) => {
  const next = new Set<string>([currentStatus])
  ;(workflow.allowedForward[currentStatus] || []).forEach((status) => {
    if (workflow.crmEditableStatuses.includes(status)) next.add(status)
  })
  const forwardStatus = workflow.next[currentStatus]
  if (forwardStatus && workflow.crmEditableStatuses.includes(forwardStatus)) next.add(forwardStatus)
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
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e3edf6', padding: '18px 20px' }}>
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
  const returnTo                = `${pathname}${sp.toString() ? `?${sp.toString()}` : ''}`
  const [orders, setOrders]     = useState<any[]>([])
  const [total,  setTotal]      = useState(0)
  const [loading,setLoading]    = useState(true)
  const [search, setSearch]     = useState('')
  const [view, setView]         = useState(viewFromSearchParams(sp, [DEFAULT_ORDER_VIEW]))
  const [plantStatuses, setPlantStatuses] = useState<string[]>([])
  const [orderWorkflow, setOrderWorkflow] = useState(EMPTY_WORKFLOW)
  const [orderViews, setOrderViews] = useState<OrderViewMeta[]>([DEFAULT_ORDER_VIEW])
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({})
  const [statusStyles, setStatusStyles] = useState<Record<string, { bg: string; text: string; border: string }>>({})
  const [plantPartners, setPlantPartners] = useState<Array<{ id?: string; value: string; label: string; isDefault?: boolean }>>([])
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
  const [challanForm, setChallanForm] = useState({ plant: '', challanDate: new Date().toISOString().slice(0, 10), driverName: '', vehicleNo: '' })
  const [creatingChallan, setCreatingChallan] = useState(false)
  const [missingRates, setMissingRates] = useState<{ plant: string; services: any[] } | null>(null)
  const [bulkUpdating, setBulkUpdating] = useState('')
  const [paymentMethods, setPaymentMethods] = useState<Array<{ value: string; label: string }>>([])
  const [showBulkPayModal, setShowBulkPayModal] = useState(false)
  const [bulkPayBusy, setBulkPayBusy] = useState(false)
  const [bulkPayForm, setBulkPayForm] = useState({ method: '', reference: '', notes: '', amount: '' })
  const [whatsAppModal, setWhatsAppModal] = useState<{ open: boolean; order: any | null; type: 'ORDER_DETAILS' | 'PAYMENT_REMINDER_ORDER' | 'PAYMENT_REMINDER_SUMMARY'; confirm: boolean }>({
    open: false,
    order: null,
    type: 'ORDER_DETAILS',
    confirm: false,
  })
  const [whatsAppBusy, setWhatsAppBusy] = useState(false)
  const [whatsAppPreview, setWhatsAppPreview] = useState<any>(null)
  const [whatsAppPreviewLoading, setWhatsAppPreviewLoading] = useState(false)
  const [whatsAppCooldownTick, setWhatsAppCooldownTick] = useState(0)
  const [mobileActionOrder, setMobileActionOrder] = useState<any | null>(null)

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
    const nextView = viewFromSearchParams(sp, orderViews)
    setView((current) => current === nextView ? current : nextView)
    setPage(1)
  }, [sp, orderViews])

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
        const workflow = { ...EMPTY_WORKFLOW, ...(metadata.orderWorkflow || {}) }
        setOrderWorkflow(workflow)
        setOrderViews(normalizeOrderViews(workflow.views))
        setPlantStatuses(workflow.plantLockedStatuses || orderStatuses.filter((item: any) => item.plantManaged).map((item: any) => item.key))
        setStatusLabels(Object.fromEntries(orderStatuses.map((item: any) => [item.key, item.label])))
        setStatusStyles(Object.fromEntries(orderStatuses.map((item: any) => [item.key, {
          bg: item.bg || '#f7f9fc',
          text: item.color || '#023c62',
          border: item.border || '#dce8f0',
        }])))
        const nextPlantPartners = metadata.plantPartners || []
        const nextPaymentMethods = metadata.collectablePaymentMethods || []
        setPaymentMethods(nextPaymentMethods)
        if (nextPaymentMethods.length) {
          setBulkPayForm((prev) => ({ ...prev, method: prev.method || nextPaymentMethods[0].value }))
        }
        setPlantPartners(nextPlantPartners)
        if (nextPlantPartners.length) {
          const defaultPlant = nextPlantPartners.find((p: any) => p.isDefault)?.value || nextPlantPartners[0].value
          setChallanForm((prev) => ({ ...prev, plant: prev.plant || defaultPlant }))
        }
      })
      .catch(() => {
        toast.error('Failed to load order metadata')
      })
  }, [])

  const updateStatus = async (id: string, currentStatus: string, newStatus: string) => {
    const transitionKind = getTransitionKind(currentStatus, newStatus, orderWorkflow)
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
      const expectedVersion = Number(orders.find((order: any) => order.id === id)?.version || 1)
      await ordersAPI.updateStatus(id, newStatus, undefined, expectedVersion)
      toast.success('Status updated')
      load()
    } catch(e:any) { toast.error(e.message) }
  }

  const markReady = (order: any) => {
    if (!orderWorkflow.directReadyAllowedStatuses.includes(order.status)) return
    if (!orderWorkflow.directReadyTarget) return
    updateStatus(order.id, order.status, orderWorkflow.directReadyTarget)
  }

  const submitStatusModal = async () => {
    if (!statusModal.reason.trim()) {
      toast.error('Reason is required for this status correction')
      return
    }
    try {
      const expectedVersion = Number(orders.find((order: any) => order.id === statusModal.orderId)?.version || 1)
      await ordersAPI.updateStatus(statusModal.orderId, statusModal.target, statusModal.reason.trim(), expectedVersion)
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
        challanDate: challanForm.challanDate,
        orderIds: selectedOrders.map((o:any) => o.id),
        driverName: challanForm.driverName,
        vehicleNo: challanForm.vehicleNo,
      })

      toast.success(`${selected.size} challan${selected.size > 1 ? 's' : ''} created — orders sent to plant`)
      setSelected(new Set())
      setShowChallanModal(false)
      setChallanForm({ plant: plantPartners.find((p: any) => p.isDefault)?.value || plantPartners[0]?.value || '', challanDate: new Date().toISOString().slice(0, 10), driverName: '', vehicleNo: '' })
      load()
    } catch(e:any) {
      if (e.details?.code === 'UNPRICED_VENDOR_SERVICES') {
        setMissingRates({ plant: e.details.plant || challanForm.plant, services: e.details.services || [] })
      } else {
        toast.error(e.message || 'Failed to create challans')
      }
    }
    setCreatingChallan(false)
  }

  const bulkTargetOptions = [
    { status: 'READY_FOR_DELIVERY', label: 'Bulk Mark Ready' },
    { status: 'OUT_FOR_DELIVERY', label: 'Bulk Out for Delivery' },
    { status: 'DELIVERED', label: 'Bulk Delivered' },
  ]
  const canBulkMove = (order: any, targetStatus: string) => {
    if (!order || order.status === targetStatus || isReturnOrder(order) || plantStatuses.includes(order.status)) return false
    if (orderWorkflow.requiresItems.includes(targetStatus) && !order.items?.length) return false
    return getTransitionKind(order.status, targetStatus, orderWorkflow) === 'forward'
  }
  const bulkEligibleOrders = (targetStatus: string) => selectedOrders.filter((order: any) => canBulkMove(order, targetStatus))
  const bulkUpdateStatus = async (targetStatus: string) => {
    const eligible = bulkEligibleOrders(targetStatus)
    if (!eligible.length) {
      toast.error(`No selected orders can move to ${getStatusLabel(targetStatus, '', statusLabels)}`)
      return
    }
    setBulkUpdating(targetStatus)
    try {
      for (const order of eligible) {
        await ordersAPI.updateStatus(order.id, targetStatus, undefined, Number(order.version || 1))
      }
      toast.success(`${eligible.length} order${eligible.length > 1 ? 's' : ''} marked ${getStatusLabel(targetStatus, '', statusLabels)}`)
      setSelected(new Set())
      load()
    } catch (e: any) {
      toast.error(e?.message || 'Bulk status update failed')
      load()
    } finally {
      setBulkUpdating('')
    }
  }

  const openBulkPayModal = () => {
    const payable = selectedOrders.filter((order: any) => orderBalanceDue(order) > 0 && !['CANCELLED', 'RETURNED'].includes(order.status))
    if (!payable.length) {
      toast.error('Selected orders have no payable balance')
      return
    }
    const customerIds = new Set(payable.map((order: any) => order.customer?.id || order.customerId).filter(Boolean))
    if (customerIds.size !== 1) {
      toast.error('Bulk payment can only be recorded for one customer at a time')
      return
    }
    const totalDue = payable.reduce((sum: number, order: any) => sum + orderBalanceDue(order), 0)
    setBulkPayForm((prev) => ({ ...prev, amount: totalDue.toFixed(2), method: prev.method || paymentMethods[0]?.value || 'CASH' }))
    setShowBulkPayModal(true)
  }

  const submitBulkPayment = async () => {
    const amount = Number(bulkPayForm.amount)
    const payable = selectedOrders
      .filter((order: any) => orderBalanceDue(order) > 0 && !['CANCELLED', 'RETURNED'].includes(order.status))
      .sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
    const totalDue = payable.reduce((sum: number, order: any) => sum + orderBalanceDue(order), 0)
    if (!(amount > 0)) {
      toast.error('Enter received amount')
      return
    }
    if (amount > totalDue) {
      toast.error(`Amount cannot exceed selected outstanding ${formatCurrency(totalDue)}`)
      return
    }
    if (!bulkPayForm.method) {
      toast.error('Select payment method')
      return
    }

    setBulkPayBusy(true)
    try {
      let remaining = amount
      for (const order of payable) {
        if (remaining <= 0) break
        const allocation = Math.min(orderBalanceDue(order), remaining)
        if (allocation > 0) {
          await paymentsAPI.record({
            orderId: order.id,
            amount: Number(allocation.toFixed(2)),
            method: bulkPayForm.method,
            reference: bulkPayForm.reference || undefined,
            notes: bulkPayForm.notes || `Bulk payment allocated to ${order.orderNumber}`,
          })
          remaining = Number((remaining - allocation).toFixed(2))
        }
      }
      toast.success('Bulk payment recorded')
      setSelected(new Set())
      setShowBulkPayModal(false)
      setBulkPayForm((prev) => ({ ...prev, reference: '', notes: '', amount: '' }))
      load()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to record bulk payment')
    } finally {
      setBulkPayBusy(false)
    }
  }

  const openWhatsAppModal = (order: any) => {
    setWhatsAppModal({ open: true, order, type: 'ORDER_DETAILS', confirm: false })
  }

  useEffect(() => {
    if (!whatsAppModal.open || !whatsAppModal.order?.id) {
      setWhatsAppPreview(null)
      return
    }
    let cancelled = false
    setWhatsAppPreviewLoading(true)
    ordersAPI.previewManualNotification(whatsAppModal.order.id, { type: whatsAppModal.type })
      .then((response: any) => {
        if (cancelled) return
        const nextPreview = response?.data || response
        setWhatsAppPreview(nextPreview)
        setWhatsAppCooldownTick(Number(nextPreview?.cooldown?.waitSeconds || 0))
      })
      .catch((e: any) => {
        if (cancelled) return
        setWhatsAppPreview({ error: e?.message || 'Failed to load WhatsApp preview' })
      })
      .finally(() => {
        if (!cancelled) setWhatsAppPreviewLoading(false)
      })
    return () => { cancelled = true }
  }, [whatsAppModal.open, whatsAppModal.order?.id, whatsAppModal.type])

  useEffect(() => {
    if (!whatsAppModal.open || !whatsAppPreview?.cooldown?.waitSeconds) return
    const startedAt = Date.now()
    const interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const remaining = Math.max(0, Number(whatsAppPreview.cooldown.waitSeconds || 0) - elapsed)
      setWhatsAppCooldownTick(remaining)
      if (remaining <= 0) {
        window.clearInterval(interval)
        if (whatsAppModal.order?.id) {
          setWhatsAppPreviewLoading(true)
          ordersAPI.previewManualNotification(whatsAppModal.order.id, { type: whatsAppModal.type })
            .then((response: any) => {
              const nextPreview = response?.data || response
              setWhatsAppPreview(nextPreview)
              setWhatsAppCooldownTick(Number(nextPreview?.cooldown?.waitSeconds || 0))
            })
            .catch((e: any) => setWhatsAppPreview({ error: e?.message || 'Failed to load WhatsApp preview' }))
            .finally(() => setWhatsAppPreviewLoading(false))
        }
      }
    }, 1000)
    return () => window.clearInterval(interval)
  }, [whatsAppModal.open, whatsAppModal.order?.id, whatsAppModal.type, whatsAppPreview?.cooldown?.waitSeconds])

  const submitManualWhatsApp = async () => {
    const order = whatsAppModal.order
    if (!order) return
    if (!whatsAppModal.confirm) {
      toast.error('Confirm before sending WhatsApp')
      return
    }
    if (whatsAppPreview?.cooldown?.waitSeconds) {
      toast.error(`Wait ${Math.max(1, whatsAppCooldownTick || whatsAppPreview.cooldown.waitSeconds)}s before sending again`)
      return
    }
    setWhatsAppBusy(true)
    try {
      if (!whatsAppPreview || whatsAppPreview.error) {
        toast.error('Preview must load before sending')
        return
      }
      await ordersAPI.sendManualNotification(order.id, { type: whatsAppModal.type })
      toast.success('WhatsApp request sent')
      setWhatsAppModal({ open: false, order: null, type: 'ORDER_DETAILS', confirm: false })
      load()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send WhatsApp')
      load()
    } finally {
      setWhatsAppBusy(false)
    }
  }

  const selectedOrders = orders.filter((o:any) => selected.has(o.id))
  const selectedPayableOrders = selectedOrders.filter((order: any) => orderBalanceDue(order) > 0 && !['CANCELLED', 'RETURNED'].includes(order.status))
  const selectedPayableTotal = selectedPayableOrders.reduce((sum: number, order: any) => sum + orderBalanceDue(order), 0)
  const selectedCustomerCount = new Set(selectedPayableOrders.map((order: any) => order.customer?.id || order.customerId).filter(Boolean)).size
  const selectedGarmentTotal = selectedOrders.reduce((sum: number, order: any) => sum + orderTotalQty(order), 0)
  const visibleValue = orders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)
  const plantLockedCount = orders.filter((order: any) => plantStatuses.includes(order.status)).length
  const noItemsCount = orders.filter((order: any) => !order.items?.length).length
  const activeView = orderViews.find((item) => item.key === view) || orderViews[0] || DEFAULT_ORDER_VIEW
  const whatsAppCooldownRemaining = whatsAppModal.open && whatsAppPreview?.cooldown?.waitSeconds
    ? Math.max(0, whatsAppCooldownTick || Number(whatsAppPreview.cooldown.waitSeconds || 0))
    : 0

  return (
    <div className="crm-page-enter crm-orders-page" style={{padding:'30px 36px 60px',maxWidth:1360,margin:'0 auto'}}>
      <section className="crm-orders-mobile" aria-label={activeView.title}>
        <header className="crm-mobile-page-head">
          <div><h1>{activeView.title}</h1><p>{total} matching orders</p></div>
          <Link href="/dashboard/orders/new"><Plus size={19} /> New</Link>
        </header>
        <div className="crm-mobile-filterbar">
          <label><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Order, customer or phone" /></label>
          <select value={view} onChange={(event) => applyOrderView(event.target.value)} aria-label="Order view">
            {orderViews.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </div>
        {selected.size > 0 && (
          <div className="crm-mobile-selection-bar">
            <strong>{selected.size} selected</strong>
            <button onClick={() => setShowChallanModal(true)}>Challan</button>
            {selectedPayableOrders.length > 0 && <button onClick={openBulkPayModal}>{selectedPayableOrders.length === 1 ? 'Payment' : 'Bulk pay'}</button>}
            <button onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
        <div className="crm-mobile-order-list">
          {loading ? <div className="crm-mobile-list-state">Loading orders…</div> : !orders.length ? <div className="crm-mobile-list-state"><Package size={25} /><strong>No orders found</strong><span>Change the filter or create a new order.</span></div> : orders.map((order: any) => {
            const selectedOrder = selected.has(order.id)
            const locked = plantStatuses.includes(order.status) || isReturnOrder(order)
            const statusStyle = statusStyles[order.status] || { bg: '#f2f6f9', text: '#31506a', border: '#d7e3eb' }
            const itemCount = orderTotalQty(order)
            return <article key={order.id} className={selectedOrder ? 'selected' : ''}>
              <button className="crm-mobile-select" disabled={locked} onClick={() => toggleSelect(order.id)} aria-label={selectedOrder ? 'Deselect order' : 'Select order'}>{selectedOrder ? <CheckSquare size={21} /> : <Square size={21} />}</button>
              <Link className="crm-mobile-order-main" href={`/dashboard/orders/${order.id}?returnTo=${encodeURIComponent(returnTo)}`}>
                <div className="crm-mobile-order-title"><strong>{order.orderNumber}</strong><span style={{background:statusStyle.bg,color:statusStyle.text,borderColor:statusStyle.border}}>{getStatusLabel(order.status, order.source, statusLabels)}</span></div>
                <div className="crm-mobile-order-customer"><strong>{order.customer?.name || 'Unnamed customer'}</strong><span>{order.customer?.phone || 'No mobile'}</span></div>
                <p>{orderItemSummaryText(order)}</p>
                <div className="crm-mobile-order-meta"><span>{itemCount} pcs</span><span>{order.deliveryDate ? `Due ${format(new Date(order.deliveryDate), 'dd MMM')}` : 'No due date'}</span><strong>{formatCurrency(order.totalAmount || 0)}</strong><em>{order.paymentStatus || 'UNPAID'}</em></div>
              </Link>
              <button className="crm-mobile-row-actions" onClick={() => setMobileActionOrder(order)} aria-label={`Actions for ${order.orderNumber}`}><Ellipsis size={21} /></button>
            </article>
          })}
        </div>
        <PaginationControls page={page} pageSize={pageSize} totalItems={total} itemLabel="orders" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} pageSizeOptions={[10,20,30,50]} />
      </section>

      {mobileActionOrder && (
        <div className="crm-mobile-action-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMobileActionOrder(null)}>
          <section className="crm-mobile-action-sheet" role="dialog" aria-modal="true" aria-label={`Actions for ${mobileActionOrder.orderNumber}`}>
            <header><div><strong>{mobileActionOrder.orderNumber}</strong><span>{mobileActionOrder.customer?.name || 'Customer'} · {formatCurrency(orderBalanceDue(mobileActionOrder))} due</span></div><button onClick={() => setMobileActionOrder(null)}><X size={20} /></button></header>
            <Link href={`/dashboard/orders/${mobileActionOrder.id}?returnTo=${encodeURIComponent(returnTo)}`}><Package size={19} /><span>Open order</span><ChevronRight size={18} /></Link>
            {orderWorkflow.directReadyAllowedStatuses.includes(mobileActionOrder.status) && <button onClick={() => { markReady(mobileActionOrder); setMobileActionOrder(null) }}><CheckSquare size={19} /><span>Mark cleaned</span></button>}
            <button onClick={() => { openWhatsAppModal(mobileActionOrder); setMobileActionOrder(null) }}><MessageCircle size={19} /><span>Send WhatsApp</span></button>
            <button onClick={() => { openPrintWindow(`/dashboard/print?orderId=${mobileActionOrder.id}&type=receipt&autoprint=1`); setMobileActionOrder(null) }}><Printer size={19} /><span>Print receipt</span></button>
            <div className="crm-mobile-status-actions">
              <small>Move order</small>
              {getStatusChoices(mobileActionOrder.status, orderWorkflow, currentStaff).filter((status) => status !== mobileActionOrder.status).map((status) => <button key={status} onClick={() => { updateStatus(mobileActionOrder.id, mobileActionOrder.status, status); setMobileActionOrder(null) }}>{getStatusLabel(status, mobileActionOrder.source, statusLabels)}</button>)}
            </div>
          </section>
        </div>
      )}

      <div className="crm-orders-desktop">
      <PageHeader
        title={activeView.title}
        subtitle={activeView.description}
        actions={<div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
          <Link href="/dashboard/orders/new" style={{display:'inline-flex',alignItems:'center',gap:8,background:'#1a3c5e',color:'#fff',textDecoration:'none',padding:'9px 18px',borderRadius:10,fontWeight:700,fontSize:13}}><Plus size={14}/> New Order</Link>
          {selected.size > 0 && <button onClick={() => setShowChallanModal(true)} style={{display:'inline-flex',alignItems:'center',gap:8,background:'#166534',color:'#fff',padding:'9px 18px',borderRadius:10,fontWeight:700,fontSize:13,border:'none',cursor:'pointer'}}><ClipboardList size={14}/> Challan ({selected.size})</button>}
        </div>}
      />

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:18,marginBottom:22}}>
        <MetricCard label="Matching Orders" value={String(total)} note="current filters" />
        <MetricCard label="Visible Value" value={formatCurrency(visibleValue)} note="Combined billed amount across the loaded page." />
        <MetricCard label="Sent to Plant" value={String(plantLockedCount)} note="Orders locked until they are received back." />
        <MetricCard label="Needs Items" value={String(noItemsCount)} note="Orders on this page with no garment lines yet." />
      </div>

      <div style={{display:'flex',gap:12,marginBottom:18,flexWrap:'wrap' as const}}>
        <div style={{flex:1,minWidth:240,display:'flex',alignItems:'center',gap:9,padding:'10px 14px',borderRadius:10,border:'1.5px solid #dce8f0',background:'#fff'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9dafc8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="6.5"/><path d="M19 19l-4.3-4.3"/></svg>
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search order #, name, phone…"
            style={{border:'none',outline:'none',fontSize:13.5,color:'#1a2332',width:'100%',fontFamily:'var(--crm-font-ui)'}}/>
        </div>
        <select value={view} onChange={e=>applyOrderView(e.target.value)} style={{padding:'10px 14px',borderRadius:10,border:'1.5px solid #dce8f0',background:'#fff',fontSize:13.5,color:'#1a2332',minWidth:170,fontFamily:'var(--crm-font-ui)'}}>
          {orderViews.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <button onClick={load} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:10,border:'1.5px solid #dce8f0',background:'#fff',color:'#023c62',fontSize:13.5,fontWeight:600,cursor:'pointer',fontFamily:'var(--crm-font-ui)'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 0 1 13.6-5.7L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.6 5.7L4 16"/><path d="M4 20v-4h4"/></svg>
          Refresh
        </button>
      </div>

      {/* Bulk action bar */}
	      {selected.size > 0 && !showChallanModal && !showBulkPayModal && (
        <>
          <div style={{height:64, marginBottom:14}} />
          <div style={{position:'fixed' as const,top:72,left:'50%',transform:'translateX(-50%)',width:'min(calc(100vw - 32px), 1320px)',zIndex:1000,background:'#023c62',borderRadius:16,padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap' as const,fontSize:13,color:'#fff',boxShadow:'0 18px 42px rgba(2,60,98,0.26)'}}>
            <span><strong>{selected.size}</strong> order{selected.size > 1 ? 's' : ''} selected</span>
            <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
              {bulkTargetOptions.map((option) => {
                const count = bulkEligibleOrders(option.status).length
                if (!count) return null
                return (
                  <button key={option.status} onClick={() => bulkUpdateStatus(option.status)} disabled={Boolean(bulkUpdating)}
                    style={{padding:'6px 14px',background:'#fff',color:'#023c62',borderRadius:8,fontSize:12,fontWeight:700,border:'none',cursor:bulkUpdating?'wait':'pointer'}}>
                    {bulkUpdating === option.status ? 'Updating...' : `${option.label} (${count})`}
                  </button>
                )
              })}
	              <button onClick={() => setShowChallanModal(true)}
	                style={{padding:'6px 14px',background:'#fff',color:'#023c62',borderRadius:8,fontSize:12,fontWeight:700,border:'none',cursor:'pointer'}}>
	                Create Challan & Send to Plant
	              </button>
	              {selectedPayableOrders.length > 0 && (
	                <button onClick={openBulkPayModal}
	                  style={{padding:'6px 14px',background:'#fff',color:'#023c62',borderRadius:8,fontSize:12,fontWeight:700,border:'none',cursor:'pointer'}}>
	                  {selectedPayableOrders.length === 1 ? 'Record Payment' : 'Bulk Pay'} {formatCurrency(selectedPayableTotal)}
	                </button>
	              )}
	              <button onClick={() => setSelected(new Set())}
	                style={{padding:'6px 14px',background:'rgba(255,255,255,0.15)',color:'#fff',borderRadius:8,fontSize:12,border:'none',cursor:'pointer'}}>
                Clear
              </button>
            </div>
          </div>
        </>
      )}

      {/* Table */}
      <div style={{background:'#fff',border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden'}}>
        <div style={{overflowX:'auto' as const}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'#f7f9fc'}}>
            <th style={{padding:'11px 12px 11px 18px',textAlign:'left' as const,fontSize:10.5,fontWeight:700,color:'#6b7fa3',letterSpacing:'0.07em',textTransform:'uppercase' as const,borderBottom:'1px solid #e8f0f7',width:34}}>
              <input type="checkbox" checked={selected.size === orders.length && orders.length > 0}
                onChange={toggleAll} style={{cursor:'pointer'}}/>
            </th>
            {['Order','Customer','Items','Delivery','Status','Total','Update'].map(h=>(
              <th key={h} style={{padding:'11px 18px',textAlign:'left' as const,fontSize:10.5,fontWeight:700,color:'#6b7fa3',letterSpacing:'0.07em',textTransform:'uppercase' as const,borderBottom:'1px solid #e8f0f7'}}>{h}</th>
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
                    const statusChoices = getStatusChoices(o.status, orderWorkflow, currentStaff)
                    const isLockedToPlantOnly = (plantStatuses.includes(o.status) && statusChoices.length <= 1) || orderIsReturn
                    const statusStyle = orderIsReturn
                      ? { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' }
                      : statusStyles[o.status] || { bg: '#f7f9fc', text: '#023c62', border: '#dce8f0' }
                    const displayStatusLabel = orderIsReturn ? 'Return Order' : getStatusLabel(o.status, o.source, statusLabels)
                    const totalQty = (o.items || []).reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0)
                    return (
                      <tr key={o.id} style={{borderBottom:'1px solid #eef4f8',background:selected.has(o.id)?'#eff6ff':'#fff'}}>
                        {/* Checkbox */}
                        <td style={{padding:'13px 12px 13px 18px'}}>
                          <input type="checkbox" checked={selected.has(o.id)}
                            onChange={() => toggleSelect(o.id)} style={{cursor:'pointer'}}
                            disabled={isSentToPlant || orderIsReturn}/>
                        </td>
                        {/* Order */}
                        <td style={{padding:'13px 18px',minWidth:110}}>
                          <Link href={`/dashboard/orders/${o.id}?returnTo=${encodeURIComponent(returnTo)}`}
                            style={{fontFamily:'var(--crm-font-mono)',fontWeight:700,color:'#023c62',textDecoration:'none',fontSize:13.5}}>
                            {o.orderNumber}
                          </Link>
                          {isSentToPlant && <span style={{display:'block',fontSize:10,background:'#fef9c3',color:'#854d0e',padding:'2px 6px',borderRadius:4,marginTop:2,fontWeight:600,width:'fit-content'}}>AT PLANT</span>}
                          <div style={{fontSize:11.5,color:'#9dafc8',marginTop:3}}>{o.createdAt ? format(new Date(o.createdAt),'dd MMM yy') : '—'}</div>
                        </td>
                        {/* Customer */}
                        <td style={{padding:'13px 18px',minWidth:140}}>
                          <div style={{fontWeight:600,color:'#1a2332',fontSize:13.5}}>{o.customer?.name || '—'}</div>
                          <div style={{...phoneNumberStyle,marginTop:3}}>{o.customer?.phone || 'No mobile'}</div>
                        </td>
                        {/* Items */}
                        <td style={{padding:'13px 18px',minWidth:220}}>
                          {(o.items || []).slice(0,3).map((item: any, idx: number) => {
                            const itemName = item.serviceName || item.garmentType || 'Item'
                            const code = itemServiceCode(item)
                            const itemCode = code && !itemName.includes(code) ? ` (${code})` : ''
                            return (
                              <div key={idx} style={{fontSize:13,color:'#1a2332',lineHeight:1.6}}>
                                {itemName}{itemCode} × {item.quantity}
                              </div>
                            )
                          })}
                          {(o.items || []).length > 3 && <div style={{fontSize:11.5,color:'#9dafc8'}}>+{(o.items || []).length - 3} more</div>}
                          {totalQty > 0 && <div style={{fontSize:11.5,color:'#6b7fa3',marginTop:3}}>Qty <strong style={{color:'#023c62'}}>{totalQty}</strong></div>}
                          {!(o.items?.length) && <div style={{fontSize:12,color:'#9dafc8',fontStyle:'italic'}}>No garments</div>}
                        </td>
                        {/* Delivery */}
                        <td style={{padding:'13px 18px',minWidth:110}}>
                          {o.deliveryDate ? (
                            <>
                              <div style={{fontSize:13.5,color:'#1a2332',fontWeight:600}}>{format(new Date(o.deliveryDate),'dd MMM')}</div>
                              <div style={{fontSize:11.5,color:'#9dafc8',marginTop:3}}>{format(new Date(o.deliveryDate),'h:mm a')}</div>
                            </>
                          ) : <span style={{color:'#c3ccd8'}}>—</span>}
                        </td>
                        {/* Status */}
                        <td style={{padding:'13px 18px',minWidth:150}}>
                          {isLockedToPlantOnly
                            ? <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,fontWeight:800,padding:'7px 10px',borderRadius:10,color:statusStyle.text,background:statusStyle.bg,border:`1px solid ${statusStyle.border}`}}>
                                <Lock size={12}/> {displayStatusLabel}
                              </span>
                            : <select value={o.status} onChange={e=>updateStatus(o.id, o.status, e.target.value)}
                                style={{border:`1px solid ${statusStyle.border}`,cursor:'pointer',fontFamily:'var(--crm-font-ui)',fontWeight:800,fontSize:12,outline:'none',borderRadius:10,padding:'7px 10px',background:statusStyle.bg,color:statusStyle.text,maxWidth:160}}>
                                {statusChoices.map(s=><option key={s} value={s}>{s === o.status ? displayStatusLabel : getStatusLabel(s, o.source, statusLabels)}</option>)}
                              </select>
                          }
                          {o.staff && (
                            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:8,fontSize:11.5,color:'#3d5470',fontWeight:600}}>
                              <span style={{width:20,height:20,borderRadius:999,background:'#dce8f0',color:'#023c62',fontSize:9,fontWeight:700,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                {(o.staff?.name || 'S').split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                              </span>
                              {o.staff?.name?.split(' ')[0] || 'Staff'}
                            </div>
                          )}
                        </td>
                        {/* Total */}
                        <td style={{padding:'13px 18px',minWidth:105}}>
                          <div style={{fontFamily:'var(--crm-font-mono)',fontWeight:800,color:'#023c62',fontSize:14.5}}>₹{(o.totalAmount||0).toLocaleString('en-IN')}</div>
                          <span style={{display:'inline-flex',marginTop:6,fontSize:10,fontWeight:800,padding:'3px 7px',borderRadius:7,border:`1px solid ${paymentTone(o.paymentStatus).border}`,background:paymentTone(o.paymentStatus).bg,color:paymentTone(o.paymentStatus).color}}>
                            {o.paymentStatus || 'UNPAID'}
                          </span>
                        </td>
                        {/* Update */}
                        <td style={{padding:'13px 18px',minWidth:152}}>
                          {orderWorkflow.directReadyAllowedStatuses.includes(o.status) && (
                            <button onClick={()=>markReady(o)} style={{display:'block',width:'100%',textAlign:'center',padding:'7px 10px',borderRadius:8,background:'#e8f7f0',color:'#0d7a4e',fontSize:12,fontWeight:700,border:'1px solid #bfe6d2',marginBottom:6,cursor:'pointer',fontFamily:'var(--crm-font-ui)'}}>
                              Mark Cleaned
                            </button>
                          )}
                          <details className="crm-action-menu" style={{position:'relative'}}>
                            <summary style={{listStyle:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'7px 10px',borderRadius:8,background:'#fff',color:'#3d5470',fontSize:12,fontWeight:600,border:'1px solid #dce8f0',marginBottom:6}}>
                              Actions <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                            </summary>
                            <div style={{position:'absolute',right:0,top:36,minWidth:190,background:'#fff',border:'1px solid #dce8f0',borderRadius:12,boxShadow:'0 16px 34px rgba(2,60,98,0.18)',padding:8,zIndex:9999}}>
	                              <Link href={`/dashboard/orders/${o.id}?returnTo=${encodeURIComponent(returnTo)}`} style={{display:'block',padding:'8px 10px',fontSize:12,color:'#023c62',textDecoration:'none',borderRadius:8}}>View Order</Link>
	                              <button onClick={() => openPrintWindow(`/dashboard/print?orderId=${o.id}&type=receipt&autoprint=1`)} style={{display:'block',width:'100%',textAlign:'left',padding:'8px 10px',fontSize:12,color:'#023c62',background:'transparent',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'var(--crm-font-ui)'}}>Print A4 Receipt</button>
	                              <button onClick={() => openPrintWindow(`/dashboard/print?orderId=${o.id}&type=thermal&autoprint=1`)} style={{display:'block',width:'100%',textAlign:'left',padding:'8px 10px',fontSize:12,color:'#023c62',background:'transparent',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'var(--crm-font-ui)'}}>Print 80mm Thermal</button>
	                              <button onClick={() => openPrintWindow(`/dashboard/print?orderId=${o.id}&type=garment&autoprint=1`)} style={{display:'block',width:'100%',textAlign:'left',padding:'8px 10px',fontSize:12,color:'#023c62',background:'transparent',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'var(--crm-font-ui)'}}>Print Garment Tags</button>
	                              <button onClick={() => openPrintWindow(`/dashboard/print?orderId=${o.id}&type=label&autoprint=1`)} style={{display:'block',width:'100%',textAlign:'left',padding:'8px 10px',fontSize:12,color:'#023c62',background:'transparent',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'var(--crm-font-ui)'}}>Print Label Tags</button>
	                              <button onClick={() => openPrintWindow(`/dashboard/print?orderId=${o.id}&type=bag&autoprint=1`)} style={{display:'block',width:'100%',textAlign:'left',padding:'8px 10px',fontSize:12,color:'#023c62',background:'transparent',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'var(--crm-font-ui)'}}>Print Bag Tags</button>
                            </div>
                          </details>
                          <div style={{display:'flex',gap:6}}>
                            <span title="Record payment" style={{width:28,height:28,borderRadius:7,background:'#fff',border:'1px solid #dce8f0',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#3d5470',cursor:'pointer',flexShrink:0}}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>
                            </span>
	                            <button onClick={() => openWhatsAppModal(o)} title="Send WhatsApp message" style={{width:28,height:28,borderRadius:7,background:'#e8f7ef',border:'1px solid #bfe6d2',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#0d7a4e',flexShrink:0,cursor:'pointer'}}>
	                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l1.3-3.9A7.5 7.5 0 1 1 9 18.5L4 20z"/></svg>
	                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
            }
          </tbody>
        </table>
        </div>
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
      </div>

      {whatsAppModal.open && whatsAppModal.order && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.42)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60,padding:'18px',boxSizing:'border-box'}}>
          <div style={{width:'min(720px,100%)',maxHeight:'min(760px,calc(100vh - 36px))',background:'#fff',borderRadius:18,border:'1px solid #e4edf5',boxShadow:'0 28px 64px rgba(2,60,98,0.22)',overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid #edf3f8',flexShrink:0}}>
              <div style={{fontSize:18,fontWeight:900,color:'#023c62'}}>Send WhatsApp</div>
              <div style={{fontSize:12.5,color:'#6b7fa3',marginTop:4}}>
                {whatsAppModal.order.orderNumber} · {whatsAppModal.order.customer?.name || 'Customer'} · Balance {formatCurrency(orderBalanceDue(whatsAppModal.order))}
              </div>
            </div>
            <div style={{padding:22,display:'grid',gap:12,overflowY:'auto',minHeight:0}}>
              {[
                { type: 'ORDER_DETAILS', title: 'Resend order details', detail: 'Sends the current order status/details with invoice link.' },
                { type: 'PAYMENT_REMINDER_ORDER', title: 'Payment reminder for this order', detail: 'Sends this order outstanding amount with payment details.' },
                { type: 'PAYMENT_REMINDER_SUMMARY', title: 'Customer full O/S summary', detail: 'Sends customer-level pending order count and total outstanding.' },
              ].map((option: any) => (
                <label key={option.type} style={{display:'grid',gridTemplateColumns:'18px 1fr',gap:10,padding:12,border:'1px solid #dce8f0',borderRadius:12,cursor:'pointer',background:whatsAppModal.type === option.type ? '#eff6ff' : '#fff'}}>
                  <input type="radio" checked={whatsAppModal.type === option.type} onChange={() => setWhatsAppModal((current) => ({ ...current, type: option.type, confirm: false }))} />
                  <span>
                    <strong style={{display:'block',fontSize:13.5,color:'#142033'}}>{option.title}</strong>
                    <span style={{display:'block',fontSize:12,color:'#6b7fa3',marginTop:2,lineHeight:1.4}}>{option.detail}</span>
                  </span>
                </label>
              ))}
              <label style={{display:'flex',gap:9,alignItems:'flex-start',fontSize:12.5,color:'#51657f',lineHeight:1.45}}>
                <input type="checkbox" checked={whatsAppModal.confirm} onChange={(e) => setWhatsAppModal((current) => ({ ...current, confirm: e.target.checked }))} />
                I confirm this will send a WhatsApp template to the customer and create a timeline log.
              </label>
              <div style={{border:'1px solid #dce8f0',borderRadius:12,background:'#f8fafc',padding:12,minHeight:260}}>
                <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:800,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em'}}>Message Preview</div>
                  {whatsAppPreviewLoading && <div style={{fontSize:11.5,color:'#6b7fa3',fontWeight:800}}>Updating...</div>}
                </div>
                {whatsAppPreview?.error ? (
                  <div style={{fontSize:12,color:'#b91c1c',fontWeight:700}}>{whatsAppPreview.error}</div>
                ) : (
                  <>
                    {whatsAppPreview?.qrImage && <img src={whatsAppPreview.qrImage} alt="Payment QR preview" style={{width:96,height:96,objectFit:'contain',border:'1px solid #dce8f0',borderRadius:10,background:'#fff',marginBottom:10}} />}
                    {whatsAppCooldownRemaining > 0 && (
                      <div style={{border:'1px solid #fde68a',background:'#fffbeb',borderRadius:10,padding:10,marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:12,color:'#92400e',fontWeight:900}}>
                          <span>Cooldown active</span>
                          <span>{whatsAppCooldownRemaining}s</span>
                        </div>
                        <div style={{height:5,background:'#fde68a',borderRadius:999,overflow:'hidden',marginTop:8}}>
                          <div style={{height:'100%',width:`${Math.max(0, Math.min(100, (whatsAppCooldownRemaining / Number(whatsAppPreview.cooldown.waitSeconds || 60)) * 100))}%`,background:'#f59e0b',borderRadius:999,transition:'width 1s linear'}} />
                        </div>
                        <div style={{fontSize:11.5,color:'#a16207',marginTop:7,lineHeight:1.35}}>Send will unlock only after the CRM rechecks the server.</div>
                      </div>
                    )}
                    <pre style={{whiteSpace:'pre-wrap',margin:0,fontFamily:'var(--crm-font-ui)',fontSize:12.5,lineHeight:1.5,color:'#142033',maxHeight:220,overflowY:'auto',background:'#fff',border:'1px solid #edf3f8',borderRadius:10,padding:12}}>{whatsAppPreview?.body || 'Preview not available'}</pre>
                    <div style={{marginTop:10,fontSize:12,color:'#023c62',fontWeight:800}}>Button: {whatsAppPreview?.buttonLabel || 'View Invoice'}</div>
                  </>
                )}
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,padding:'14px 22px',borderTop:'1px solid #edf3f8',background:'#f8fafc',flexShrink:0}}>
              <button onClick={() => setWhatsAppModal({ open:false, order:null, type:'ORDER_DETAILS', confirm:false })} disabled={whatsAppBusy}
                style={{padding:'9px 14px',borderRadius:10,border:'1px solid #dce8f0',background:'#fff',color:'#51657f',fontWeight:700,cursor:whatsAppBusy?'wait':'pointer'}}>
                Cancel
              </button>
              <button onClick={submitManualWhatsApp} disabled={whatsAppBusy || !whatsAppModal.confirm || whatsAppPreviewLoading || Boolean(whatsAppPreview?.error) || whatsAppCooldownRemaining > 0}
                style={{padding:'9px 16px',borderRadius:10,border:'none',background:'#0d7a4e',color:'#fff',fontWeight:800,cursor:whatsAppBusy?'wait':'pointer',opacity:(!whatsAppModal.confirm || whatsAppBusy || whatsAppCooldownRemaining > 0)?0.6:1}}>
                {whatsAppBusy ? 'Sending...' : whatsAppCooldownRemaining > 0 ? `Wait ${whatsAppCooldownRemaining}s` : 'Send WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkPayModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.42)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60,padding:20}}>
          <div style={{width:'100%',maxWidth:620,background:'#fff',borderRadius:18,border:'1px solid #e4edf5',boxShadow:'0 28px 64px rgba(2,60,98,0.22)',overflow:'hidden'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid #edf3f8'}}>
              <div style={{fontSize:18,fontWeight:900,color:'#023c62'}}>Bulk Record Payment</div>
              <div style={{fontSize:12.5,color:'#6b7fa3',marginTop:4}}>
                {selectedPayableOrders.length} payable order{selectedPayableOrders.length === 1 ? '' : 's'} · Selected O/S {formatCurrency(selectedPayableTotal)}
              </div>
            </div>
            <div style={{padding:22}}>
              {selectedCustomerCount > 1 && (
                <div style={{background:'#fff7ed',border:'1px solid #fed7aa',color:'#9a3412',padding:12,borderRadius:12,fontSize:13,fontWeight:700,marginBottom:14}}>
                  Select orders of one customer only before recording bulk payment.
                </div>
              )}
              <div style={{maxHeight:180,overflowY:'auto',border:'1px solid #e3edf6',borderRadius:12,marginBottom:14}}>
                {selectedPayableOrders.map((order: any) => (
                  <div key={order.id} style={{display:'grid',gridTemplateColumns:'120px 1fr 90px',gap:10,padding:'10px 12px',borderBottom:'1px solid #eef4f8',fontSize:12.5}}>
                    <strong style={{fontFamily:'var(--crm-font-mono)',color:'#023c62'}}>{order.orderNumber}</strong>
                    <span style={{color:'#51657f',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{order.customer?.name || 'Customer'}</span>
                    <strong style={{color:'#142033',textAlign:'right'}}>{formatCurrency(orderBalanceDue(order))}</strong>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Amount Received</label>
                  <input type="number" min="0" step="0.01" value={bulkPayForm.amount} onChange={(e)=>setBulkPayForm((prev)=>({...prev,amount:e.target.value}))}
                    style={{width:'100%',border:'1px solid #dce8f0',borderRadius:10,padding:'10px 12px',boxSizing:'border-box'}} />
                </div>
                <div>
                  <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Payment Method</label>
                  <select value={bulkPayForm.method} onChange={(e)=>setBulkPayForm((prev)=>({...prev,method:e.target.value}))}
                    style={{width:'100%',border:'1px solid #dce8f0',borderRadius:10,padding:'10px 12px',boxSizing:'border-box',background:'#fff'}}>
                    {paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Reference</label>
                  <input value={bulkPayForm.reference} onChange={(e)=>setBulkPayForm((prev)=>({...prev,reference:e.target.value}))}
                    placeholder="Optional" style={{width:'100%',border:'1px solid #dce8f0',borderRadius:10,padding:'10px 12px',boxSizing:'border-box'}} />
                </div>
                <div>
                  <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Notes</label>
                  <input value={bulkPayForm.notes} onChange={(e)=>setBulkPayForm((prev)=>({...prev,notes:e.target.value}))}
                    placeholder="Optional" style={{width:'100%',border:'1px solid #dce8f0',borderRadius:10,padding:'10px 12px',boxSizing:'border-box'}} />
                </div>
              </div>
              <div style={{fontSize:12,color:'#6b7fa3',lineHeight:1.45,marginTop:12}}>
                Allocation is applied to the oldest selected outstanding order first. Each allocation creates the normal payment and timeline entry.
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:10,padding:'14px 22px',borderTop:'1px solid #edf3f8',background:'#f8fafc'}}>
              <button onClick={() => setShowBulkPayModal(false)} disabled={bulkPayBusy}
                style={{padding:'9px 14px',borderRadius:10,border:'1px solid #dce8f0',background:'#fff',color:'#51657f',fontWeight:700,cursor:bulkPayBusy?'wait':'pointer'}}>
                Cancel
              </button>
              <button onClick={submitBulkPayment} disabled={bulkPayBusy || selectedCustomerCount !== 1}
                style={{padding:'9px 16px',borderRadius:10,border:'none',background:'#023c62',color:'#fff',fontWeight:800,cursor:bulkPayBusy?'wait':'pointer',opacity:(bulkPayBusy || selectedCustomerCount !== 1)?0.6:1}}>
                {bulkPayBusy ? 'Recording...' : 'Record Bulk Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Challan Modal */}
      {showChallanModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.46)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:20}}>
	          <div style={{background:'#fff',borderRadius:16,width:'min(920px, 100%)',maxHeight:'min(760px, calc(100vh - 40px))',boxShadow:'0 24px 70px rgba(2,60,98,0.22)',display:'flex',flexDirection:'column' as const,overflow:'hidden'}}>
            <div style={{padding:'20px 24px 16px',borderBottom:'1px solid #e8f0f7',background:'#fff'}}>
              <h2 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:19,margin:'0 0 5px',color:'#023c62'}}>Create Delivery Challan</h2>
              <p style={{fontSize:13,color:'#6b7fa3',margin:0,lineHeight:1.45}}>
                Review selected orders, choose plant details, then send them to plant.
              </p>
            </div>

            <div style={{padding:24,overflowY:'auto' as const,display:'grid',gridTemplateColumns:'minmax(0,1fr) 300px',gap:18,alignItems:'start'}}>
              <div style={{minWidth:0}}>
	              <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:10,marginBottom:14}}>
	                <div style={{background:'#f8fafc',border:'1px solid #e3edf6',borderRadius:12,padding:12}}>
	                  <div style={{fontSize:10,fontWeight:800,color:'#6b7fa3',textTransform:'uppercase'}}>Orders</div>
	                  <div style={{fontSize:22,fontWeight:900,color:'#023c62',marginTop:3}}>{selectedOrders.length}</div>
	                </div>
	                <div style={{background:'#f8fafc',border:'1px solid #e3edf6',borderRadius:12,padding:12}}>
	                  <div style={{fontSize:10,fontWeight:800,color:'#6b7fa3',textTransform:'uppercase'}}>Garments</div>
	                  <div style={{fontSize:22,fontWeight:900,color:'#023c62',marginTop:3}}>{selectedGarmentTotal}</div>
	                </div>
	                <div style={{background:'#f8fafc',border:'1px solid #e3edf6',borderRadius:12,padding:12}}>
	                  <div style={{fontSize:10,fontWeight:800,color:'#6b7fa3',textTransform:'uppercase'}}>Plant</div>
	                  <div style={{fontSize:14,fontWeight:800,color:'#023c62',marginTop:7,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
	                    {plantPartners.find((plant) => plant.value === challanForm.plant)?.label || challanForm.plant || 'Select plant'}
	                  </div>
	                </div>
	              </div>

	              <div style={{border:'1px solid #e3edf6',borderRadius:14,overflow:'hidden',background:'#fff'}}>
                  <div style={{padding:'10px 12px',background:'#f8fafc',borderBottom:'1px solid #e3edf6',display:'grid',gridTemplateColumns:'118px minmax(0,1fr) 76px',gap:10,fontSize:10,fontWeight:900,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                    <span>Order</span>
                    <span>Customer / Garments</span>
                    <span style={{textAlign:'right'}}>Pieces</span>
                  </div>
	                <div style={{maxHeight:'calc(100vh - 390px)',minHeight:180,overflowY:'auto' as const}}>
	                  {selectedOrders.map((o:any) => (
	                    <div key={o.id} style={{fontSize:12,color:'#374151',padding:'10px 12px',display:'grid',gridTemplateColumns:'118px minmax(0,1fr) 76px',gap:10,borderBottom:'1px solid #eef4f8',alignItems:'center'}}>
	                      <span style={{fontFamily:'monospace',color:'#023c62',fontWeight:900}}>{o.orderNumber}</span>
	                      <span style={{minWidth:0}}>
	                        <strong style={{display:'block',color:'#1a2332',fontSize:12.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{o.customer?.name || 'Customer'}</strong>
	                        <span style={{display:'block',color:'#6b7fa3',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginTop:2}}>{orderItemSummaryText(o)}</span>
	                      </span>
	                      <span style={{color:'#023c62',fontWeight:900,textAlign:'right'}}>{orderTotalQty(o)} pcs</span>
	                    </div>
	                  ))}
	                </div>
	              </div>
              </div>

              <div style={{border:'1px solid #e3edf6',borderRadius:14,padding:14,background:'#fbfdff',position:'sticky' as const,top:0}}>
                <div style={{fontSize:11,fontWeight:900,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Plant Details</div>
                <div style={{display:'flex',flexDirection:'column' as const,gap:13}}>
                  <div>
                    <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6,fontWeight:800}}>Send to Plant *</label>
                    <select value={challanForm.plant} onChange={(e:any)=>setChallanForm({...challanForm,plant:e.target.value})}
                      style={{width:'100%',border:'1px solid #dce8f0',borderRadius:9,padding:'9px 11px',fontSize:13,background:'#fff'}}>
                      {plantPartners.map((plant) => <option key={plant.value} value={plant.value}>{plant.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6,fontWeight:800}}>Challan Date *</label>
                    <input type="date" value={challanForm.challanDate} max={new Date().toISOString().slice(0, 10)}
                      onChange={(e:any)=>setChallanForm({...challanForm,challanDate:e.target.value})}
                      style={{width:'100%',border:'1px solid #dce8f0',borderRadius:9,padding:'9px 11px',fontSize:13,boxSizing:'border-box' as const,background:'#fff'}}/>
                  </div>
                  <div>
                    <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6,fontWeight:800}}>Driver Name</label>
                    <input type="text" value={challanForm.driverName} onChange={(e:any)=>setChallanForm({...challanForm,driverName:e.target.value})}
                      placeholder="Optional"
                      style={{width:'100%',border:'1px solid #dce8f0',borderRadius:9,padding:'9px 11px',fontSize:13,boxSizing:'border-box' as const,background:'#fff'}}/>
                  </div>
                  <div>
                    <label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6,fontWeight:800}}>Vehicle No</label>
                    <input type="text" value={challanForm.vehicleNo} onChange={(e:any)=>setChallanForm({...challanForm,vehicleNo:e.target.value})}
                      placeholder="Optional"
                      style={{width:'100%',border:'1px solid #dce8f0',borderRadius:9,padding:'9px 11px',fontSize:13,boxSizing:'border-box' as const,background:'#fff'}}/>
                  </div>
                </div>
                <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,padding:'10px 12px',marginTop:14,fontSize:12,color:'#9a3412',lineHeight:1.45}}>
                  Orders stay locked for regular status changes until the plant marks the challan as received.
                </div>
              </div>
            </div>

            <div style={{display:'flex',gap:8,justifyContent:'flex-end',padding:'14px 24px',borderTop:'1px solid #e8f0f7',background:'#fff'}}>
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

      <MissingVendorRatesModal
        open={!!missingRates}
        plant={missingRates?.plant || challanForm.plant}
        plantLabel={plantPartners.find((p) => p.value === (missingRates?.plant || challanForm.plant))?.label}
        services={missingRates?.services || []}
        onClose={() => setMissingRates(null)}
        onSaved={() => { setMissingRates(null); createChallan() }}
      />
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div style={{ padding: '30px 36px 60px', color: '#6b7fa3' }}><InlineLoader label="Loading orders" /></div>}>
      <OrdersPageContent />
    </Suspense>
  )
}
