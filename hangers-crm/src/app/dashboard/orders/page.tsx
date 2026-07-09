'use client'
import { Suspense, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { authAPI, ordersAPI, challanAPI, metadataAPI } from '@/lib/api'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { CalendarDays, ClipboardList, Lock, MoreHorizontal, Plus, RefreshCw, Search, X } from 'lucide-react'
import { Badge, PageHeader } from '@/components/ui'
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

const READY_ALLOWED_STATUSES = new Set(['PROCESSING', 'IRONING', 'WASHING', 'DRYING', 'QC'])

function ItemSummary({ items }: { items: any[] }) {
  const summary = summarizeItems(items)
  if (!summary.totalQty) {
    return (
      <div style={{ fontSize: 12, color: '#9dafc8', fontWeight: 600, lineHeight: 1.35 }}>
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
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
      <div
        style={{
          height: 30,
          width: 30,
          borderRadius: 9,
          background: '#e8f0f7',
          color: '#023c62',
          display: 'grid',
          placeItems: 'center',
          fontSize: 12.5,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {summary.totalQty}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: '#26364a', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>
          {itemNames}
          {summary.extraCount > 0 ? ` +${summary.extraCount} more` : ''}
        </div>
        <div style={{ fontSize: 11, color: '#8ba0bb', marginTop: 1 }}>
          {summary.totalQty === 1 ? '1 garment' : `${summary.totalQty} garments`}
        </div>
      </div>
    </div>
  )
}

function SummaryCell({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'warn' }) {
  return (
    <div style={{ padding: '13px 18px', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7c8da5', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1, color: tone === 'warn' ? '#9a4d00' : '#142033', whiteSpace: 'nowrap' }}>
        {value}
      </div>
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
  const [status, setStatus]     = useState(sp.get('status')||'')
  const [statusOptions, setStatusOptions] = useState<Array<{ key: string; label: string }>>([{ key: '', label: 'All Statuses' }])
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
      const r = await ordersAPI.list({ page, limit:pageSize, status:status||undefined, search:search||undefined })
      setOrders(asArray(r.data, ['orders', 'items']))
      setTotal(r.data?.pagination?.total || 0)
    } catch { toast.error('Failed to load orders') }
    finally { setLoading(false) }
  }, [page, pageSize, status, search])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const nextStatus = sp.get('status') || ''
    setStatus((current) => current === nextStatus ? current : nextStatus)
    setPage(1)
  }, [sp])

  const applyStatusFilter = (nextStatus: string) => {
    setStatus(nextStatus)
    setPage(1)
    const params = new URLSearchParams(sp.toString())
    if (nextStatus) params.set('status', nextStatus)
    else params.delete('status')
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  useEffect(() => {
    authAPI.me().then((r:any) => setCurrentStaff(r?.staff || r?.data?.staff || null)).catch(() => setCurrentStaff(null))
    metadataAPI.getAll()
      .then((r: any) => {
        const metadata = r?.metadata || r?.data?.metadata || {}
        const orderStatuses = metadata.orderStatuses || []
        setStatusOptions([{ key: '', label: 'All Statuses' }, ...orderStatuses.filter((item: any) => !HIDDEN_STATUS_CHOICES.has(item.key)).map((item: any) => ({ key: item.key, label: item.label }))])
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
  const selectedValue = selectedOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)
  const visibleValue = orders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)
  const plantLockedCount = orders.filter((order: any) => plantStatuses.includes(order.status)).length
  const noItemsCount = orders.filter((order: any) => !order.items?.length).length

  return (
    <div className="crm-page-enter crm2-page">
      <PageHeader
        breadcrumb={['Workspace', 'Orders']}
        title="Orders"
        subtitle={loading ? 'Loading order queue…' : `${total} order${total === 1 ? '' : 's'} matching the current view`}
        actions={
          <>
            <button onClick={load} className="crm2-btn-secondary" disabled={loading}>
              <RefreshCw size={14} />
              Refresh
            </button>
            <Link href="/dashboard/orders/new" className="crm2-btn-primary">
              <Plus size={15} />
              New Order
            </Link>
          </>
        }
      />

      {/* Toolbar: search + status chips */}
      <section className="crm2-panel" style={{ padding: '13px 14px', marginBottom: 14, display: 'grid', gap: 11 }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} color="#9dafc8" style={{ position: 'absolute', left: 13, top: 11 }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search order #, customer name, phone…"
            style={{
              width: '100%',
              border: '1.5px solid #e3ebf3',
              borderRadius: 10,
              padding: '9px 14px 9px 36px',
              fontSize: 13.5,
              outline: 'none',
              background: '#fbfdff',
            }}
          />
        </div>
        <div className="crm2-chiprow">
          {statusOptions.map((item) => (
            <button
              key={item.key}
              className={`crm2-chip${status === item.key ? ' crm2-chip-active' : ''}`}
              onClick={() => applyStatusFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {/* Summary strip */}
      <section
        className="crm2-panel"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          marginBottom: 14,
          overflow: 'hidden',
        }}
      >
        <SummaryCell label="Matching Orders" value={loading ? '—' : String(total)} />
        <div style={{ borderLeft: '1px solid #eef3f8' }}>
          <SummaryCell label="Page Value" value={loading ? '—' : formatCurrency(visibleValue)} />
        </div>
        <div style={{ borderLeft: '1px solid #eef3f8' }}>
          <SummaryCell label="Sent to Plant" value={loading ? '—' : String(plantLockedCount)} />
        </div>
        <div style={{ borderLeft: '1px solid #eef3f8' }}>
          <SummaryCell label="Needs Items" value={loading ? '—' : String(noItemsCount)} tone={noItemsCount > 0 ? 'warn' : 'default'} />
        </div>
      </section>

      {/* Order table */}
      <div className="crm2-panel orders-table-surface" style={{ overflow: 'visible' }}>
        <table className="crm2-table" style={{ overflow: 'visible' }}>
          <thead>
            <tr>
              <th style={{ width: 36, padding: '10px 10px 10px 16px' }}>
                <input
                  type="checkbox"
                  checked={selected.size === orders.length && orders.length > 0}
                  onChange={toggleAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th>Order</th>
              <th>Customer</th>
              <th>Garments / Service</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Dates</th>
              <th style={{ textAlign: 'right', paddingRight: 18 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={8} style={{ padding: 0 }}><TableLoader rows={6} columns={7} /></td></tr>
              : !orders.length
                ? <tr><td colSpan={8} style={{ padding: 48, textAlign: 'center', color: '#9dafc8', fontSize: 14 }}>
                    No orders found.<br/>
                    <Link href="/dashboard/orders/new" style={{ color: '#023c62', fontWeight: 700 }}>Create the first one →</Link>
                  </td></tr>
                : orders.map((o:any)=>{
                    const isSentToPlant = o.status === 'SENT_TO_PLANT'
                    const statusChoices = getStatusChoices(o.status, editableStatuses, currentStaff)
                    const isLockedToPlantOnly = plantStatuses.includes(o.status) && statusChoices.length <= 1
                    const statusStyle = statusStyles[o.status] || { bg: '#f7f9fc', text: '#023c62', border: '#dce8f0' }
                    return (
                      <tr key={o.id} className={selected.has(o.id) ? 'crm2-row-selected' : undefined}>
                        <td style={{ padding: '13px 10px 13px 16px' }}>
                          <input
                            type="checkbox"
                            checked={selected.has(o.id)}
                            onChange={() => toggleSelect(o.id)}
                            style={{ cursor: 'pointer' }}
                            disabled={isSentToPlant}
                          />
                        </td>
                        <td style={{ minWidth: 128 }}>
                          <Link
                            href={`/dashboard/orders/${o.id}`}
                            style={{ fontFamily: 'var(--crm-font-mono)', fontSize: 13, fontWeight: 800, color: '#023c62', textDecoration: 'none' }}
                          >
                            {o.orderNumber}
                          </Link>
                          {isSentToPlant && (
                            <span style={{ display: 'inline-flex', fontSize: 9.5, background: '#fef9c3', color: '#854d0e', padding: '2px 6px', borderRadius: 5, marginLeft: 6, fontWeight: 700, letterSpacing: '0.04em' }}>
                              AT PLANT
                            </span>
                          )}
                        </td>
                        <td style={{ minWidth: 160 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1a2332', lineHeight: 1.3 }}>{o.customer?.name || '—'}</div>
                          <div style={{ fontSize: 11.5, color: '#8ba0bb', marginTop: 2 }}>+91 {o.customer?.phone}</div>
                        </td>
                        <td style={{ minWidth: 220, maxWidth: 320 }}>
                          <ItemSummary items={o.items || []} />
                        </td>
                        <td style={{ minWidth: 150 }}>
                          {isLockedToPlantOnly
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 9, color: statusStyle.text, background: statusStyle.bg, border: `1px solid ${statusStyle.border}` }}>
                                <Lock size={11} /> {getStatusLabel(o.status, o.source, statusLabels)}
                              </span>
                            : <select
                                value={o.status}
                                onChange={e => updateStatus(o.id, o.status, e.target.value)}
                                style={{
                                  border: `1px solid ${statusStyle.border}`,
                                  cursor: 'pointer',
                                  fontFamily: 'var(--crm-font-ui)',
                                  fontWeight: 700,
                                  fontSize: 12,
                                  outline: 'none',
                                  borderRadius: 9,
                                  padding: '6px 9px',
                                  background: statusStyle.bg,
                                  color: statusStyle.text,
                                  maxWidth: 150,
                                }}
                              >
                                {statusChoices.map(s => <option key={s} value={s}>{getStatusLabel(s, o.source, statusLabels)}</option>)}
                              </select>
                          }
                        </td>
                        <td style={{ minWidth: 110, textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#023c62', fontSize: 14, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                            ₹{o.totalAmount?.toLocaleString('en-IN')}
                          </div>
                          <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
                            <Badge label={o.paymentStatus || 'UNPAID'} status={o.paymentStatus || 'UNPAID'} size="sm" />
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: '#6b7fa3', minWidth: 116 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#31445c', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            <CalendarDays size={12} /> {format(new Date(o.createdAt), 'dd MMM yy')}
                          </div>
                          {o.deliveryDate && <div style={{ marginTop: 4, color: '#0f766e', fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap' }}>Due {format(new Date(o.deliveryDate), 'dd MMM')}</div>}
                        </td>
                        <td style={{ paddingRight: 16, position: 'relative', overflow: 'visible', minWidth: 158 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, position: 'relative', zIndex: 2 }}>
                            {READY_ALLOWED_STATUSES.has(o.status) && (
                              <button
                                onClick={() => markReady(o)}
                                style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid #b7ead4', background: '#ecfdf5', color: '#047857', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                              >
                                Clean
                              </button>
                            )}
                            <Link
                              href={`/dashboard/orders/${o.id}`}
                              style={{ fontSize: 12, color: '#035a8f', fontWeight: 800, textDecoration: 'none', padding: '0 4px' }}
                            >
                              View
                            </Link>
                            <details className="crm-action-menu" style={{ position: 'relative', zIndex: 1000 }}>
                              <summary
                                title="More order actions"
                                aria-label="More order actions"
                                style={{ listStyle: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: '1px solid #e3ebf3', background: '#fff', color: '#6b7fa3' }}
                              >
                                <MoreHorizontal size={15} strokeWidth={2.6} />
                              </summary>
                              <div style={{ position: 'absolute', right: 0, top: 34, minWidth: 190, background: '#fff', border: '1px solid #dce8f0', borderRadius: 12, boxShadow: '0 16px 34px rgba(2,60,98,0.18)', padding: 8, zIndex: 9999 }}>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=receipt`} style={{ display: 'block', padding: '8px 10px', fontSize: 12, color: '#023c62', textDecoration: 'none', borderRadius: 8, background: 'transparent' }}>Print A4 Receipt</Link>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=thermal`} style={{ display: 'block', padding: '8px 10px', fontSize: 12, color: '#023c62', textDecoration: 'none', borderRadius: 8, background: 'transparent' }}>Print 80mm Thermal</Link>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=garment`} style={{ display: 'block', padding: '8px 10px', fontSize: 12, color: '#023c62', textDecoration: 'none', borderRadius: 8, background: 'transparent' }}>Print Garment Tags</Link>
                                <Link href={`/dashboard/print?orderId=${o.id}&type=bag`} style={{ display: 'block', padding: '8px 10px', fontSize: 12, color: '#023c62', textDecoration: 'none', borderRadius: 8, background: 'transparent' }}>Print Bag Tags</Link>
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

      {/* Floating bulk action bar */}
      {selected.size > 0 && (
        <div className="crm2-bulkbar">
          <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
            <strong>{selected.size}</strong> selected · {formatCurrency(selectedValue)}
          </span>
          <button
            onClick={() => setShowChallanModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 15px', background: '#fff', color: '#023c62', borderRadius: 999, fontSize: 12.5, fontWeight: 800, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <ClipboardList size={14} />
            Create Challan
          </button>
          <button
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'rgba(255,255,255,0.14)', color: '#fff', borderRadius: 999, border: 'none', cursor: 'pointer' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Create Challan Modal */}
      {showChallanModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 480, boxShadow: '0 28px 64px rgba(2,60,98,0.22)', border: '1px solid #e3ebf3', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #eef3f8' }}>
              <h2 style={{ fontFamily: 'var(--crm-font-display)', fontWeight: 700, fontSize: 18, margin: '0 0 4px', color: '#142033' }}>Create Delivery Challan</h2>
              <p style={{ fontSize: 13, color: '#6b7fa3', margin: 0, lineHeight: 1.5 }}>
                {selected.size} order{selected.size > 1 ? 's' : ''} will be sent to the plant and locked until the plant marks them as received.
              </p>
            </div>

            <div style={{ padding: 22 }}>
              {/* Selected orders preview */}
              <div style={{ background: '#fbfdff', border: '1px solid #eef3f8', borderRadius: 10, padding: 12, marginBottom: 16, maxHeight: 120, overflowY: 'auto' as const }}>
                {selectedOrders.map((o:any) => (
                  <div key={o.id} style={{ fontSize: 12, color: '#374151', padding: '3px 0', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--crm-font-mono)', color: '#023c62' }}>{o.orderNumber}</span>
                    <span style={{ color: '#6b7fa3' }}>{o.customer?.name}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#51657f', display: 'block', marginBottom: 6 }}>Send to Plant *</label>
                  <select value={challanForm.plant} onChange={(e:any)=>setChallanForm({...challanForm,plant:e.target.value})}
                    style={{ width: '100%', border: '1.5px solid #e3ebf3', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: '#fff' }}>
                    {plantPartners.map((plant) => <option key={plant.value} value={plant.value}>{plant.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#51657f', display: 'block', marginBottom: 6 }}>Driver Name</label>
                  <input type="text" value={challanForm.driverName} onChange={(e:any)=>setChallanForm({...challanForm,driverName:e.target.value})}
                    placeholder="Optional"
                    style={{ width: '100%', border: '1.5px solid #e3ebf3', borderRadius: 10, padding: '9px 12px', fontSize: 13, boxSizing: 'border-box' as const }}/>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#51657f', display: 'block', marginBottom: 6 }}>Vehicle No</label>
                  <input type="text" value={challanForm.vehicleNo} onChange={(e:any)=>setChallanForm({...challanForm,vehicleNo:e.target.value})}
                    placeholder="Optional"
                    style={{ width: '100%', border: '1.5px solid #e3ebf3', borderRadius: 10, padding: '9px 12px', fontSize: 13, boxSizing: 'border-box' as const }}/>
                </div>
              </div>

              <div style={{ background: '#fff9e8', border: '1px solid #f4d5a9', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: 12, color: '#854d0e', lineHeight: 1.5 }}>
                Once sent to plant, orders will be locked from status updates until the plant marks the challan as Received.
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                <button onClick={()=>setShowChallanModal(false)} className="crm2-btn-secondary">
                  Cancel
                </button>
                <button onClick={createChallan} disabled={creatingChallan}
                  style={{ padding: '9px 18px', background: '#166534', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: creatingChallan ? 0.5 : 1 }}>
                  {creatingChallan ? <InlineLoader label="Creating" tone="light" /> : `Send to Plant & Create Challan${selected.size > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {statusModal.open && (() => {
        const meta = getCorrectionMeta(statusModal.kind)
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55, padding: 20 }}>
            <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 18, border: '1px solid #e3ebf3', boxShadow: '0 28px 64px rgba(2,60,98,0.22)', overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px 15px', background: meta.bg, borderBottom: '1px solid #eef3f8' }}>
                <div style={{ fontFamily: 'var(--crm-font-display)', fontWeight: 800, fontSize: 20, color: meta.tone }}>{meta.title}</div>
                <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.55, color: '#51657f' }}>
                  {getStatusLabel(statusModal.currentStatus, '', statusLabels)} → {getStatusLabel(statusModal.target, '', statusLabels)}. {meta.hint}
                </div>
              </div>
              <div style={{ padding: 22 }}>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Reason</label>
                <textarea
                  value={statusModal.reason}
                  onChange={(e)=>setStatusModal((current)=>({...current,reason:e.target.value}))}
                  placeholder="Enter the operational reason for this correction"
                  rows={4}
                  style={{ width: '100%', resize: 'vertical', border: '1.5px solid #e3ebf3', borderRadius: 12, padding: '11px 13px', fontSize: 13.5, lineHeight: 1.5, color: '#142033', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button onClick={()=>setStatusModal({ open:false, orderId:'', currentStatus:'', target:'', kind:'forward', reason:'' })} className="crm2-btn-secondary">
                    Cancel
                  </button>
                  <button onClick={submitStatusModal} className="crm2-btn-primary">
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
