'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CheckCircle2, ChevronDown, Clock3, History, MapPin, MessageCircle, PackageCheck, Phone, RotateCcw, Search, Truck, X, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { pickupRequestsAPI } from '@/lib/api'

const formatDate = (value?: string | null, withTime = false) => {
  if (!value) return 'Not specified'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not specified'
  return date.toLocaleString('en-IN', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
}

const pickupTimelineEntries = (events: any[] = []) => {
  const failureCountByOutbox = new Map<string, number>()
  events.forEach((event) => {
    if (event.action !== 'PICKUP_REQUEST_WHATSAPP_FAILED') return
    const key = event.notification?.outboxEventId || event.metadata?.outboxEventId || event.id
    failureCountByOutbox.set(key, (failureCountByOutbox.get(key) || 0) + 1)
  })
  const shownFailures = new Set<string>()
  const shownSuccesses = new Set<string>()
  return events.flatMap((event) => {
    if (['PICKUP_REQUEST_CUSTOMER_WHATSAPP_SENT', 'PICKUP_REQUEST_WHATSAPP_SENT'].includes(event.action)) {
      const key = event.notification?.outboxEventId || event.metadata?.outboxEventId || event.id
      if (shownSuccesses.has(key)) return []
      shownSuccesses.add(key)
    }
    if (event.action !== 'PICKUP_REQUEST_WHATSAPP_FAILED') return [event]
    const key = event.notification?.outboxEventId || event.metadata?.outboxEventId || event.id
    if (shownFailures.has(key)) return []
    shownFailures.add(key)
    return [{ ...event, failureCount: failureCountByOutbox.get(key) || 1 }]
  })
}

const timelinePresentation = (event: any) => {
  if (event.action === 'PICKUP_REQUEST_WHATSAPP_FAILED') return { title: 'WhatsApp Failed', tone: 'failed', icon: XCircle }
  if (['PICKUP_REQUEST_CUSTOMER_WHATSAPP_SENT', 'PICKUP_REQUEST_WHATSAPP_SENT'].includes(event.action)) return { title: 'WhatsApp Sent', tone: 'sent', icon: CheckCircle2 }
  if (event.action === 'PICKUP_REQUEST_WHATSAPP_PENDING' || event.action === 'PICKUP_REQUEST_WHATSAPP_RETRY_QUEUED') return { title: 'WhatsApp Queued', tone: 'pending', icon: MessageCircle }
  return { title: event.description, tone: 'default', icon: null }
}

const timelineDetail = (event: any) => {
  if (event.action === 'PICKUP_REQUEST_WHATSAPP_FAILED') {
    return event.notification?.lastError || event.description?.replace(/^.*failed:\s*/i, '') || 'The provider did not accept the message.'
  }
  if (event.action === 'PICKUP_REQUEST_CUSTOMER_WHATSAPP_SENT') return 'Customer pickup confirmation delivered to the WhatsApp provider.'
  if (event.action === 'PICKUP_REQUEST_WHATSAPP_SENT') return event.description
  if (event.action === 'PICKUP_REQUEST_WHATSAPP_PENDING') return event.description
  if (event.action === 'PICKUP_REQUEST_WHATSAPP_RETRY_QUEUED') return 'The failed message has been queued for another delivery attempt.'
  return ''
}

export default function PickupRequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<any[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [statusConfig, setStatusConfig] = useState<any[]>([])
  const [contactMethods, setContactMethods] = useState<any[]>([])
  const [pickupTimeSlots, setPickupTimeSlots] = useState<any[]>([])
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState('')
  const [cancelRequest, setCancelRequest] = useState<any>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [actionRequest, setActionRequest] = useState<any>(null)
  const [actionTarget, setActionTarget] = useState<any>(null)
  const [actionForm, setActionForm] = useState({ contactMethod: '', preferredDate: '', preferredSlot: '', note: '' })
  const [expandedId, setExpandedId] = useState('')
  const [timelineById, setTimelineById] = useState<Record<string, any[]>>({})
  const [retryingActivityId, setRetryingActivityId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response: any = await pickupRequestsAPI.list({ status: status || undefined, search: search || undefined, limit: 100 })
      setRequests(response?.data?.requests || response?.requests || [])
      setCounts(response?.data?.counts || response?.counts || {})
      setStatusConfig(response?.data?.statuses || response?.statuses || [])
      setContactMethods(response?.data?.contactMethods || response?.contactMethods || [])
      setPickupTimeSlots(response?.data?.pickupTimeSlots || response?.pickupTimeSlots || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to load pickup requests')
    } finally {
      setLoading(false)
    }
  }, [status, search])

  useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer) }, [load])

  const updateStatus = async (request: any, data: any) => {
    setWorkingId(request.id)
    try {
      const response: any = await pickupRequestsAPI.updateStatus(request.id, data)
      const updated = response?.data?.request || response?.request
      const timeline = response?.data?.timeline || response?.timeline || []
      if (updated) setRequests((current) => current.map((item) => item.id === updated.id ? updated : item))
      setTimelineById((current) => ({ ...current, [request.id]: timeline }))
      setExpandedId(request.id)
      const label = statusConfig.find((item) => item.value === data.status)?.label || data.status.replace(/_/g, ' ').toLowerCase()
      toast.success(`Marked ${label.toLowerCase()}`)
      setCancelRequest(null); setCancelReason('')
      setActionRequest(null); setActionTarget(null); setActionForm({ contactMethod: '', preferredDate: '', preferredSlot: '', note: '' })
      await load()
    } catch (err: any) { toast.error(err.message || 'Status update failed') }
    finally { setWorkingId('') }
  }

  const openTimeline = async (request: any) => {
    if (expandedId === request.id) { setExpandedId(''); return }
    setExpandedId(request.id)
    try {
      const response: any = await pickupRequestsAPI.get(request.id)
      setTimelineById((current) => ({ ...current, [request.id]: response?.data?.timeline || response?.timeline || [] }))
    } catch (err: any) { toast.error(err.message || 'Failed to load request activity') }
  }

  const retryWhatsApp = async (request: any, event: any) => {
    if (retryingActivityId) return
    setRetryingActivityId(event.id)
    try {
      const queuedResponse: any = await pickupRequestsAPI.retryWhatsApp(request.id, event.id)
      const queuedData = queuedResponse?.data || queuedResponse || {}
      if (Array.isArray(queuedData.timeline)) {
        setTimelineById((current) => ({ ...current, [request.id]: queuedData.timeline }))
      }
      toast.success('WhatsApp retry queued')

      const queuedAt = new Date(queuedData.queuedAt || Date.now()).getTime()
      const outboxEventId = queuedData.outboxEventId
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        const response: any = await pickupRequestsAPI.get(request.id)
        const timeline = response?.data?.timeline || response?.timeline || []
        setTimelineById((current) => ({ ...current, [request.id]: timeline }))
        const outcome = timeline.find((entry: any) => {
          const entryOutboxId = entry.notification?.outboxEventId || entry.metadata?.outboxEventId
          const createdAt = new Date(entry.createdAt).getTime()
          return entryOutboxId === outboxEventId
            && createdAt >= queuedAt
            && ['PICKUP_REQUEST_CUSTOMER_WHATSAPP_SENT', 'PICKUP_REQUEST_WHATSAPP_SENT', 'PICKUP_REQUEST_WHATSAPP_FAILED'].includes(entry.action)
        })
        if (['PICKUP_REQUEST_CUSTOMER_WHATSAPP_SENT', 'PICKUP_REQUEST_WHATSAPP_SENT'].includes(outcome?.action)) {
          toast.success('WhatsApp confirmation sent')
          break
        }
        if (outcome?.action === 'PICKUP_REQUEST_WHATSAPP_FAILED') {
          toast.error(outcome.notification?.lastError || 'WhatsApp retry failed')
          break
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to retry WhatsApp message')
      const response: any = await pickupRequestsAPI.get(request.id).catch(() => null)
      const timeline = response?.data?.timeline || response?.timeline
      if (Array.isArray(timeline)) setTimelineById((current) => ({ ...current, [request.id]: timeline }))
    } finally {
      setRetryingActivityId('')
    }
  }

  const openAction = (request: any, target: any) => {
    if (target.requiresContactMethod || target.requiresSchedule) {
      setActionRequest(request); setActionTarget(target)
      setActionForm({ contactMethod: '', preferredDate: request.preferredDate ? String(request.preferredDate).slice(0, 10) : '', preferredSlot: request.preferredSlot || '', note: '' })
      return
    }
    updateStatus(request, { status: target.value })
  }

  const createOrder = async (request: any) => {
    if (workingId) return
    setWorkingId(request.id)
    try {
      const response: any = await pickupRequestsAPI.prepareOrder(request.id)
      const customer = response?.data?.customer || response?.customer
      if (!customer?.id) throw new Error('Customer could not be prepared')
      router.push(`/dashboard/orders/new?customerId=${encodeURIComponent(customer.id)}&pickupRequestId=${encodeURIComponent(request.id)}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to start order')
      setWorkingId('')
    }
  }

  return (
    <div className="pickup-requests-page" style={{ maxWidth: 1480, margin: '0 auto', padding: '26px 28px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div><div style={{ color: '#6b7fa3', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Website enquiries</div><h1 style={{ margin: '5px 0 4px', color: '#023c62', fontSize: 27, fontWeight: 800 }}>Pickup Requests</h1><p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Contact, confirm, and convert website pickup enquiries into orders.</p></div>
        <div style={{ position: 'relative', width: 'min(360px, 100%)' }}><Search size={17} style={{ position: 'absolute', left: 13, top: 12, color: '#8292a8' }}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search request, name, phone or address" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d8e2ec', borderRadius: 7, padding: '11px 12px 11px 39px', outline: 'none', background: '#fff', fontSize: 13.5 }}/></div>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 12 }}>
        {[{ value: '', label: 'All' }, ...statusConfig].map((item) => <button key={item.value || 'all'} onClick={() => setStatus(item.value)} style={{ flexShrink: 0, border: status === item.value ? '1px solid #023c62' : '1px solid #d8e2ec', background: status === item.value ? '#023c62' : '#fff', color: status === item.value ? '#fff' : '#53657a', borderRadius: 999, padding: '8px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>{item.label} <span style={{ opacity: .75 }}>{item.value ? counts[item.value] || 0 : Object.values(counts).reduce((a, b) => a + b, 0)}</span></button>)}
      </div>

      {loading ? <div style={{ padding: 48, textAlign: 'center', color: '#6b7fa3' }}>Loading pickup requests...</div> : requests.length === 0 ? <div style={{ background: '#fff', border: '1px solid #e1e8ef', borderRadius: 8, padding: 54, textAlign: 'center' }}><Truck size={30} color="#8da0b5"/><h3 style={{ color: '#25415b', marginBottom: 5 }}>No pickup requests found</h3><p style={{ color: '#718096', margin: 0, fontSize: 13 }}>New website requests will appear here automatically.</p></div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {requests.map((request) => {
            const workflowStatus = statusConfig.find((item) => item.value === request.status) || { label: request.status, color: '#36546c', bg: '#edf2f7', allowedTransitions: [], canCreateOrder: false }
            const transitions = statusConfig.filter((item) => workflowStatus.allowedTransitions?.includes(item.value))
            const requestItems = Array.isArray(request.items) ? request.items : []
            return <article key={request.id} style={{ background: '#fff', border: '1px solid #e0e7ee', borderRadius: 8, overflow: 'hidden' }}><div style={{ padding: 17, display: 'grid', gridTemplateColumns: 'minmax(220px, .9fr) minmax(300px, 1.5fr) minmax(180px, .7fr) auto', gap: 20, alignItems: 'center' }} className="pickup-request-row">
              <div><div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}><strong style={{ color: '#023c62', fontSize: 15 }}>{request.requestNumber}</strong><span style={{ background: workflowStatus.bg, color: workflowStatus.color, borderRadius: 999, padding: '4px 8px', fontSize: 10.5, fontWeight: 800 }}>{workflowStatus.label}</span></div><div style={{ color: '#172b3d', fontWeight: 750, fontSize: 14 }}>{request.name}</div><a href={`tel:${request.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#567086', textDecoration: 'none', fontSize: 12.5, marginTop: 4 }}><Phone size={12}/>{request.phone}</a><div style={{ color: '#8a9aaa', fontSize: 11.5, marginTop: 7 }}>Received {formatDate(request.createdAt, true)}</div></div>
              <div><div style={{ display: 'flex', gap: 7, color: '#43596e', fontSize: 12.5, lineHeight: 1.5 }}><MapPin size={15} style={{ flexShrink: 0, marginTop: 2, color: '#6c8297' }}/><span>{request.address}</span></div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>{requestItems.length > 0 ? requestItems.map((item: any) => <span key={item.serviceKey} style={itemChip}>{item.serviceName} · {item.quantity} pcs</span>) : (request.itemsSummary || request.serviceNeeded) && <span style={itemChip}>{request.itemsSummary || request.serviceNeeded}</span>}{request.notes && <span title={request.notes} style={{ background: '#fff8e6', color: '#6d561d', padding: '5px 8px', borderRadius: 5, fontSize: 11.5, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{request.notes}</span>}</div></div>
              <div style={{ color: '#43596e', fontSize: 12.5 }}><div style={{ display: 'flex', gap: 7, alignItems: 'center' }}><CalendarDays size={14}/>{formatDate(request.preferredDate)}</div><div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 8 }}><Clock3 size={14}/>{request.preferredSlot || 'Any time'}</div>{request.order && <div style={{ marginTop: 9, color: '#1d4ed8', fontWeight: 700 }}>{request.order.orderNumber}</div>}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 7, minWidth: 230 }}>
                {transitions.filter((item) => item.value !== 'CANCELLED').map((item) => <button key={item.value} disabled={workingId === request.id} onClick={() => openAction(request, item)} style={secondaryBtn}><Phone size={13}/> {item.actionLabel || `Mark ${item.label}`}</button>)}
                {workflowStatus.canCreateOrder && <button disabled={workingId === request.id} onClick={() => createOrder(request)} style={primaryBtn}><PackageCheck size={14}/> Create Order</button>}
                <button disabled={workingId === request.id} onClick={() => openTimeline(request)} style={secondaryBtn}><History size={13}/> Activity <ChevronDown size={13} style={{ transform: expandedId === request.id ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}/></button>
                {transitions.some((item) => item.value === 'CANCELLED') && <button disabled={workingId === request.id} onClick={() => setCancelRequest(request)} aria-label="Cancel request" title="Cancel request" style={dangerBtn}><X size={14}/></button>}
              </div>
            </div>{expandedId === request.id && <div style={timelinePanel}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
                <strong style={{ color: '#023c62', fontSize: 13.5 }}>Timeline</strong>
                <span style={{ color: '#8a9aaa', fontSize: 11.5 }}>Latest activity first</span>
              </div>
              {(timelineById[request.id] || []).length === 0 ? <div style={{ color: '#7b8ea1', fontSize: 12.5, padding: '8px 0' }}>Loading activity...</div> : pickupTimelineEntries(timelineById[request.id] || []).map((event, index, entries) => {
                const presentation = timelinePresentation(event)
                const EventIcon = presentation.icon
                const isFailed = presentation.tone === 'failed'
                const isSent = presentation.tone === 'sent'
                const isPending = presentation.tone === 'pending'
                const canRetry = Boolean(event.notification?.canRetry)
                const resolved = Boolean(event.notification?.resolved)
                const isRetrying = retryingActivityId === event.id
                const detail = timelineDetail(event)
                return <div key={event.id} style={timelineRow}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ ...timelineDot, width: isFailed || isSent || isPending ? 18 : 10, height: isFailed || isSent || isPending ? 18 : 10, marginTop: isFailed || isSent || isPending ? 1 : 4, background: isFailed ? '#fee2e2' : isSent ? '#dcfce7' : isPending ? '#fef3c7' : '#023c62', color: isFailed ? '#dc2626' : isSent ? '#16a34a' : isPending ? '#b45309' : '#fff' }}>{EventIcon ? <EventIcon size={14} strokeWidth={2.4}/> : null}</span>
                    {index < entries.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 15, background: '#e3edf6', margin: '3px 0' }}/>} 
                  </div>
                  <div style={{ minWidth: 0, padding: isFailed ? '10px 12px' : '0 0 14px', marginTop: isFailed ? -5 : 0, border: isFailed ? '1px solid #fecaca' : 'none', borderRadius: isFailed ? 10 : 0, background: isFailed ? '#fff7f7' : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <strong style={{ display: 'block', color: isFailed ? '#b91c1c' : '#29445a', fontSize: 12.5 }}>{presentation.title}</strong>
                      {isFailed && resolved && <span style={successPill}>Retried successfully</span>}
                      {isFailed && canRetry && <button disabled={isRetrying} onClick={() => retryWhatsApp(request, event)} style={{ ...retryBtn, opacity: isRetrying ? .65 : 1, cursor: isRetrying ? 'wait' : 'pointer' }}><RotateCcw size={12}/>{isRetrying ? 'Retrying' : 'Retry'}</button>}
                    </div>
                    {detail && <div style={{ color: isFailed ? '#a33f3f' : '#60758a', fontSize: 11.5, lineHeight: 1.45, marginTop: 3, overflowWrap: 'anywhere' }}>{detail}</div>}
                    {isFailed && Number(event.failureCount || 1) > 1 && <div style={{ color: '#a33f3f', fontSize: 10.5, marginTop: 6 }}>{event.failureCount} provider attempts recorded</div>}
                    <small style={{ display: 'block', color: '#8495a5', marginTop: 3 }}>{formatDate(event.createdAt, true)}{event.actorName ? ` · ${event.actorName}` : ''}</small>
                  </div>
                </div>
              })}
            </div>}</article>
          })}
        </div>
      )}

      {actionRequest && actionTarget && <div style={overlay}><div style={modal}><h2 style={{ margin: '0 0 6px', color: '#17344c', fontSize: 19 }}>{actionTarget.actionLabel || actionTarget.label}</h2><p style={{ margin: '0 0 15px', color: '#677b8e', fontSize: 13 }}>This action is recorded in {actionRequest.requestNumber}&apos;s activity timeline.</p>{actionTarget.requiresContactMethod && <label style={fieldLabel}>Contact method<select value={actionForm.contactMethod} onChange={(e) => setActionForm((current) => ({ ...current, contactMethod: e.target.value }))} style={fieldInput}><option value="">Select method</option>{contactMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}{actionTarget.requiresSchedule && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={fieldLabel}>Confirmed date<input type="date" min={new Date().toISOString().slice(0, 10)} value={actionForm.preferredDate} onChange={(e) => setActionForm((current) => ({ ...current, preferredDate: e.target.value }))} style={fieldInput}/></label><label style={fieldLabel}>Confirmed time<select value={actionForm.preferredSlot} onChange={(e) => setActionForm((current) => ({ ...current, preferredSlot: e.target.value }))} style={fieldInput}><option value="">Select time</option>{pickupTimeSlots.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>}<label style={{ ...fieldLabel, marginTop: 11 }}>Internal note (optional)<textarea value={actionForm.note} onChange={(e) => setActionForm((current) => ({ ...current, note: e.target.value }))} maxLength={500} rows={3} style={{ ...fieldInput, resize: 'vertical' }}/></label><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}><button onClick={() => { setActionRequest(null); setActionTarget(null) }} style={secondaryBtn}>Close</button><button disabled={workingId === actionRequest.id || (actionTarget.requiresContactMethod && !actionForm.contactMethod) || (actionTarget.requiresSchedule && (!actionForm.preferredDate || !actionForm.preferredSlot))} onClick={() => updateStatus(actionRequest, { status: actionTarget.value, ...actionForm })} style={primaryBtn}>Save action</button></div></div></div>}

      {cancelRequest && <div style={overlay}><div style={modal}><h2 style={{ margin: '0 0 6px', color: '#17344c', fontSize: 19 }}>Cancel {cancelRequest.requestNumber}</h2><p style={{ margin: '0 0 15px', color: '#677b8e', fontSize: 13 }}>The reason is retained in the request timeline.</p><textarea autoFocus value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation" rows={4} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d5dfe8', borderRadius: 7, padding: 11, resize: 'vertical' }}/><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}><button onClick={() => { setCancelRequest(null); setCancelReason('') }} style={secondaryBtn}>Keep request</button><button disabled={cancelReason.trim().length < 3 || workingId === cancelRequest.id} onClick={() => updateStatus(cancelRequest, { status: 'CANCELLED', reason: cancelReason })} style={{ ...primaryBtn, background: '#b42318' }}>Cancel request</button></div></div></div>}

      <style jsx global>{`@media (max-width: 1100px){.pickup-request-row{grid-template-columns:1fr 1.4fr!important}.pickup-request-row>div:last-child{justify-content:flex-start!important}}@media (max-width:700px){.pickup-request-row{grid-template-columns:1fr!important}}`}</style>
    </div>
  )
}

const primaryBtn: React.CSSProperties = { border: 0, borderRadius: 6, background: '#023c62', color: '#fff', padding: '8px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 750 }
const secondaryBtn: React.CSSProperties = { ...primaryBtn, background: '#fff', color: '#36546c', border: '1px solid #cfdbe5' }
const dangerBtn: React.CSSProperties = { ...secondaryBtn, color: '#b42318', padding: 8 }
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(12,30,45,.45)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }
const modal: React.CSSProperties = { background: '#fff', borderRadius: 8, width: 'min(440px, 100%)', padding: 22, boxShadow: '0 24px 70px rgba(10,30,50,.25)' }
const itemChip: React.CSSProperties = { background: '#f2f6f9', color: '#36546c', padding: '5px 8px', borderRadius: 5, fontSize: 11.5 }
const timelinePanel: React.CSSProperties = { borderTop: '1px solid #e5edf3', background: '#fff', padding: '14px 18px 16px', display: 'grid', gap: 10 }
const timelineRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', gap: 9, alignItems: 'stretch' }
const timelineDot: React.CSSProperties = { width: 10, height: 10, borderRadius: 999, background: '#023c62', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const retryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }
const successPill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }
const fieldLabel: React.CSSProperties = { display: 'grid', gap: 6, color: '#4b6174', fontSize: 12.5, fontWeight: 700 }
const fieldInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d3dee7', borderRadius: 6, padding: '9px 10px', background: '#fff', color: '#183249', font: 'inherit' }
