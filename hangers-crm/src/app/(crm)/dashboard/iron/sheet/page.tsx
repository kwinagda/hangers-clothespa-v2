'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Loader2, Minus, Plus, Save, Search, SlidersHorizontal, X } from 'lucide-react'
import { format } from 'date-fns'
import { ironAPI, servicesAPI } from '@/lib/api'
import { sanitizeDecimalInput, sanitizeIntegerInput } from '@/lib/numeric-input'
import { PageHeader } from '@/components/ui'
import IronSectionTabs from '../_components/IronSectionTabs'

const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

const fmt = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const todayText = () => new Date().toISOString().slice(0, 10)
const cellKey = (customerId: string, serviceId: string) => `${customerId}::${serviceId}`

type ServiceItem = { id: string; name: string; price: number }
type QtyCell = { pieces: string; ratePerPiece?: string; notes?: string }
type ExtraLine = { id: string; serviceId: string; pieces: string; ratePerPiece: string; notes: string }
type IronLogRules = {
  today?: string
  backdateDays: number
  futureDatesAllowed?: boolean
  canBackdateBeyondLimit?: boolean
  backdateReasonRequired?: boolean
}

const parseMoney = (value: any) => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

const parseDateOnly = (value: string) => {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

const dateText = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getRuleDateBounds = (rules: IronLogRules | null) => {
  const today = parseDateOnly(String(rules?.today || '').slice(0, 10)) || parseDateOnly(todayText()) || new Date()
  const earliest = new Date(today)
  earliest.setDate(earliest.getDate() - Math.max(0, Number(rules?.backdateDays || 0)))
  return { today: dateText(today), earliest: dateText(earliest) }
}

const ironDateRuleError = (date: string, rules: IronLogRules | null) => {
  if (!rules) return null
  const selected = parseDateOnly(date)
  if (!selected) return 'Select a valid Daily Iron service date'
  const { today, earliest } = getRuleDateBounds(rules)
  const todayDate = parseDateOnly(today)
  const earliestDate = parseDateOnly(earliest)
  if (!rules.futureDatesAllowed && todayDate && selected > todayDate) return 'Daily Iron service date cannot be in the future'
  if (earliestDate && selected < earliestDate && !rules.canBackdateBeyondLimit) return `Daily Iron service date cannot be more than ${rules.backdateDays} days old`
  return null
}

const isBeyondIronBackdateLimit = (date: string, rules: IronLogRules | null) => {
  if (!rules) return false
  const selected = parseDateOnly(date)
  const earliest = parseDateOnly(getRuleDateBounds(rules).earliest)
  return Boolean(selected && earliest && selected < earliest)
}

const timelineTone = (event: any) => {
  const stage = String(event?.stage || '')
  const status = String(event?.status || '')
  if (stage.includes('FAILED') || status === 'FAILED') return { dot: '#dc2626', border: '#fecaca', bg: '#fff7f7', title: '#b91c1c', meta: '#b45353' }
  if (stage.includes('SKIPPED')) return { dot: '#ea580c', border: '#fed7aa', bg: '#fff7ed', title: '#c2410c', meta: '#c2410c' }
  if (stage.includes('SENT') || stage.includes('RECORDED') || stage.includes('COMPLETED') || status === 'PROCESSED') return { dot: '#16a34a', border: '#bbf7d0', bg: '#f0fdf4', title: '#166534', meta: '#4d7c0f' }
  if (stage.includes('PENDING') || stage.includes('QUEUED')) return { dot: '#b45309', border: '#fde68a', bg: '#fffbeb', title: '#92400e', meta: '#b45309' }
  return { dot: '#023c62', border: '#e3edf6', bg: '#f8fbfd', title: '#142033', meta: '#6b7fa3' }
}

const stepButton = (disabled = false): CSSProperties => ({
  width: 26,
  height: 26,
  borderRadius: 8,
  border: '1px solid #d7e5ef',
  background: disabled ? '#f3f6f9' : '#fff',
  color: disabled ? '#aac0d2' : '#023c62',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: disabled ? 'not-allowed' : 'pointer',
})

export default function DailyIronSheetPage() {
  const [selectedDate, setSelectedDate] = useState(todayText())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [services, setServices] = useState<ServiceItem[]>([])
  const [dayLogs, setDayLogs] = useState<any[]>([])
  const [timelineEvents, setTimelineEvents] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [qty, setQty] = useState<Record<string, QtyCell>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [extraLines, setExtraLines] = useState<Record<string, ExtraLine[]>>({})
  const [addingMoreForLogged, setAddingMoreForLogged] = useState<Record<string, boolean>>({})
  const [showOnlyPending, setShowOnlyPending] = useState(false)
  const [logRules, setLogRules] = useState<IronLogRules | null>(null)
  const [backdateReason, setBackdateReason] = useState('')
  const [mobileCustomerId, setMobileCustomerId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [subRes, serviceRes, logRes, timelineRes] = await Promise.all([
        ironAPI.listSubscriptions('ACTIVE'),
        servicesAPI.getDailyIronRates(),
        ironAPI.listLogs({ date: selectedDate }),
        ironAPI.timeline({ date: selectedDate }),
      ])
      const activeSubs = asArray(subRes?.data || subRes, ['subscriptions']).filter((sub: any) => sub.applicationStatus === 'ACTIVE')
      const catalog = asArray(serviceRes?.data || serviceRes, ['catalog'])
      const dailyItems = catalog.flatMap((section: any) => asArray(section?.items).map((item: any) => ({
        id: item.id,
        name: item.name,
        price: parseMoney(item.price ?? item.basePrice),
      }))).filter((item: ServiceItem) => item.id && item.price > 0)
      setSubscriptions(activeSubs)
      setServices(dailyItems)
      setDayLogs(asArray(logRes?.data || logRes, ['logs']))
      setTimelineEvents(asArray(timelineRes?.data || timelineRes, ['events']))
    } catch (err: any) {
      toast.error(err.message || 'Failed to load Daily Iron sheet')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    ironAPI.getLogRules()
      .then((response: any) => setLogRules(response?.data || response))
      .catch(() => setLogRules(null))
  }, [])

  const loggedByCustomer = useMemo(() => {
    const map = new Map<string, { pieces: number; amount: number; count: number }>()
    dayLogs.forEach((log: any) => {
      const current = map.get(log.customerId) || { pieces: 0, amount: 0, count: 0 }
      current.pieces += Number(log.pieces || 0)
      current.amount += Number(log.amount || 0)
      current.count += 1
      map.set(log.customerId, current)
    })
    return map
  }, [dayLogs])

  const loggedByCustomerService = useMemo(() => {
    const map = new Map<string, { pieces: number; amount: number; count: number }>()
    dayLogs.forEach((log: any) => {
      if (!log.customerId || !log.serviceId) return
      const key = cellKey(log.customerId, log.serviceId)
      const current = map.get(key) || { pieces: 0, amount: 0, count: 0 }
      current.pieces += Number(log.pieces || 0)
      current.amount += Number(log.amount || 0)
      current.count += 1
      map.set(key, current)
    })
    return map
  }, [dayLogs])

  const timelineByCustomer = useMemo(() => {
    const map = new Map<string, any[]>()
    timelineEvents.forEach((event: any) => {
      if (!event.customerId) return
      const rows = map.get(event.customerId) || []
      rows.push(event)
      map.set(event.customerId, rows)
    })
    map.forEach((rows) => rows.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime()))
    return map
  }, [timelineEvents])

  const daySummary = useMemo(() => {
    const customerIds = new Set<string>()
    let pieces = 0
    let amount = 0
    dayLogs.forEach((log: any) => {
      if (log.customerId) customerIds.add(log.customerId)
      pieces += Number(log.pieces || 0)
      amount += Number(log.amount || 0)
    })
    return { customers: customerIds.size, lines: dayLogs.length, pieces, amount }
  }, [dayLogs])

  const filteredSubscriptions = useMemo(() => {
    const search = query.trim().toLowerCase()
    return subscriptions.filter((sub: any) => {
      const customer = sub.customer || {}
      const matches = !search || [customer.name, customer.phone].some((value) => String(value || '').toLowerCase().includes(search))
      const pending = !showOnlyPending || !loggedByCustomer.has(sub.customerId)
      return matches && pending
    })
  }, [subscriptions, query, showOnlyPending, loggedByCustomer])

  const setCellPieces = (customerId: string, serviceId: string, value: string) => {
    const clean = sanitizeIntegerInput(value).slice(0, 3)
    setQty((prev) => ({ ...prev, [cellKey(customerId, serviceId)]: { ...(prev[cellKey(customerId, serviceId)] || {}), pieces: clean } }))
  }

  const bumpCell = (customerId: string, serviceId: string, delta: number) => {
    const key = cellKey(customerId, serviceId)
    setQty((prev) => {
      const current = Number(prev[key]?.pieces || 0)
      const next = Math.max(0, Math.min(999, current + delta))
      return { ...prev, [key]: { ...(prev[key] || {}), pieces: next ? String(next) : '' } }
    })
  }

  const setCellRate = (customerId: string, serviceId: string, value: string) => {
    const clean = sanitizeDecimalInput(value, 2).slice(0, 8)
    setQty((prev) => ({ ...prev, [cellKey(customerId, serviceId)]: { ...(prev[cellKey(customerId, serviceId)] || {}), ratePerPiece: clean } }))
  }

  const setCellNotes = (customerId: string, serviceId: string, value: string) => {
    setQty((prev) => ({ ...prev, [cellKey(customerId, serviceId)]: { ...(prev[cellKey(customerId, serviceId)] || {}), notes: value.slice(0, 160) } }))
  }

  const addExtraLine = (customerId: string) => {
    setExtraLines((prev) => ({
      ...prev,
      [customerId]: [
        ...(prev[customerId] || []),
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, serviceId: services[0]?.id || '', pieces: '1', ratePerPiece: '', notes: '' },
      ],
    }))
  }

  const updateExtraLine = (customerId: string, lineId: string, patch: Partial<ExtraLine>) => {
    setExtraLines((prev) => ({
      ...prev,
      [customerId]: (prev[customerId] || []).map((line) => line.id === lineId ? { ...line, ...patch } : line),
    }))
  }

  const removeExtraLine = (customerId: string, lineId: string) => {
    setExtraLines((prev) => ({ ...prev, [customerId]: (prev[customerId] || []).filter((line) => line.id !== lineId) }))
  }

  const draftRows = useMemo(() => {
    return subscriptions.map((sub: any) => {
      const customerId = sub.customerId
      const items: any[] = []
      services.forEach((service) => {
        const cell = qty[cellKey(customerId, service.id)]
        const pieces = Number(cell?.pieces || 0)
        if (Number.isInteger(pieces) && pieces > 0) {
          items.push({
            serviceId: service.id,
            pieces,
            ...(cell?.ratePerPiece ? { ratePerPiece: Number(cell.ratePerPiece) } : {}),
            ...(cell?.notes?.trim() ? { notes: cell.notes.trim() } : {}),
          })
        }
      })
      ;(extraLines[customerId] || []).forEach((line) => {
        const pieces = Number(line.pieces || 0)
        if (line.serviceId && Number.isInteger(pieces) && pieces > 0) {
          items.push({
            serviceId: line.serviceId,
            pieces,
            ...(line.ratePerPiece ? { ratePerPiece: Number(line.ratePerPiece) } : {}),
            ...(line.notes.trim() ? { notes: line.notes.trim() } : {}),
          })
        }
      })
      return { customerId, items }
    }).filter((row) => row.items.length)
  }, [subscriptions, services, qty, extraLines])

  const draftSummary = useMemo(() => {
    let pieces = 0
    let amount = 0
    draftRows.forEach((row) => {
      row.items.forEach((item: any) => {
        const service = services.find((entry) => entry.id === item.serviceId)
        const rate = Number(item.ratePerPiece || service?.price || 0)
        pieces += item.pieces
        amount += item.pieces * rate
      })
    })
    return { customers: draftRows.length, lines: draftRows.reduce((sum, row) => sum + row.items.length, 0), pieces, amount }
  }, [draftRows, services])
  const selectedDateError = ironDateRuleError(selectedDate, logRules)
  const selectedDateNeedsOverride = isBeyondIronBackdateLimit(selectedDate, logRules)
  const backdateReasonError = selectedDateNeedsOverride && logRules?.canBackdateBeyondLimit && logRules?.backdateReasonRequired && backdateReason.trim().length < 3
    ? 'Add a reason for saving Daily Iron entries older than the normal window'
    : null
  const dateBounds = getRuleDateBounds(logRules)

  const customerHasDraft = useCallback((customerId: string) => {
    const hasGridQty = services.some((service) => Number(qty[cellKey(customerId, service.id)]?.pieces || 0) > 0)
    const hasExtraQty = (extraLines[customerId] || []).some((line) => Number(line.pieces || 0) > 0 && line.serviceId)
    return hasGridQty || hasExtraQty
  }, [services, qty, extraLines])

  const customerDraftPieces = useCallback((customerId: string) => {
    const gridPieces = services.reduce((sum, service) => sum + Number(qty[cellKey(customerId, service.id)]?.pieces || 0), 0)
    const extraPieces = (extraLines[customerId] || []).reduce((sum, line) => sum + Number(line.pieces || 0), 0)
    return gridPieces + extraPieces
  }, [services, qty, extraLines])

  const clearCustomerDraft = useCallback((customerId: string) => {
    setQty((prev) => {
      const next = { ...prev }
      services.forEach((service) => { delete next[cellKey(customerId, service.id)] })
      return next
    })
    setExtraLines((prev) => {
      const next = { ...prev }
      delete next[customerId]
      return next
    })
    setExpanded((prev) => ({ ...prev, [customerId]: false }))
    setAddingMoreForLogged((prev) => {
      const next = { ...prev }
      delete next[customerId]
      return next
    })
  }, [services])

  const validateDraft = (rows = draftRows) => {
    for (const row of rows) {
      const customer = subscriptions.find((sub: any) => sub.customerId === row.customerId)?.customer
      for (const item of row.items) {
        const service = services.find((entry) => entry.id === item.serviceId)
        if (!service) return `${customer?.name || 'Customer'} has an invalid item selected`
        if (item.ratePerPiece && Math.abs(Number(item.ratePerPiece) - service.price) > 0.009 && !String(item.notes || '').trim()) {
          return `${customer?.name || 'Customer'} has a rate change for ${service.name}. Add a reason.`
        }
      }
    }
    return null
  }

  const saveSheet = async () => {
    if (saving) return
    if (selectedDateError) {
      toast.error(selectedDateError)
      return
    }
    if (backdateReasonError) {
      toast.error(backdateReasonError)
      return
    }
    if (!draftRows.length) {
      toast.error('Enter quantity for at least one customer')
      return
    }
    const validationError = validateDraft()
    if (validationError) {
      toast.error(validationError)
      return
    }
    setSaving(true)
    try {
      const response = await ironAPI.createDaySheet({
        date: selectedDate,
        rows: draftRows,
        ...(selectedDateNeedsOverride ? { backdateReason: backdateReason.trim() } : {}),
      })
      const summary = response?.data?.summary || response?.summary || {}
      toast.success(`Saved ${summary.customers || draftRows.length} customers, ${summary.pieces || draftSummary.pieces} pcs`)
      setQty({})
      setExtraLines({})
      setExpanded({})
      setAddingMoreForLogged({})
      setBackdateReason('')
      await load()
    } catch (err: any) {
      const rowDetail = Array.isArray(err.details) && err.details[0]?.message ? err.details[0].message : ''
      toast.error(rowDetail || err.message || 'Failed to save Daily Iron sheet')
    } finally {
      setSaving(false)
    }
  }

  const saveMobileCustomer = async (customerId: string) => {
    if (saving) return
    const row = draftRows.find((entry) => entry.customerId === customerId)
    if (!row) return toast.error('Add at least one clothing item')
    if (selectedDateError) return toast.error(selectedDateError)
    if (backdateReasonError) return toast.error(backdateReasonError)
    const validationError = validateDraft([row])
    if (validationError) return toast.error(validationError)
    setSaving(true)
    try {
      const response = await ironAPI.createDaySheet({
        date: selectedDate,
        rows: [row],
        ...(selectedDateNeedsOverride ? { backdateReason: backdateReason.trim() } : {}),
      })
      const pieces = row.items.reduce((sum: number, item: any) => sum + Number(item.pieces || 0), 0)
      toast.success(`Saved ${response?.data?.summary?.pieces || pieces} clothes`)
      clearCustomerDraft(customerId)
      setMobileCustomerId(null)
      setBackdateReason('')
      await load()
    } catch (err: any) {
      const rowDetail = Array.isArray(err.details) && err.details[0]?.message ? err.details[0].message : ''
      toast.error(rowDetail || err.message || 'Failed to save Daily Iron entry')
    } finally {
      setSaving(false)
    }
  }

  const openMobileCustomer = (sub: any) => {
    if (loggedByCustomer.has(sub.customerId)) {
      setAddingMoreForLogged((prev) => ({ ...prev, [sub.customerId]: true }))
    }
    setMobileCustomerId(sub.customerId)
  }

  const mobileCustomer = subscriptions.find((sub: any) => sub.customerId === mobileCustomerId)

  return (
    <div className="iron-sheet-page" style={{ padding: '28px 32px 56px', maxWidth: 1500, margin: '0 auto', fontFamily: 'var(--crm-font-ui)' }}>
      <section className="iron-sheet-mobile">
        <header className="iron-mobile-head">
          <div><small>Daily Iron</small><h1>Today Sheet</h1></div>
          <label><span>Date</span><input type="date" value={selectedDate} min={logRules?.canBackdateBeyondLimit ? undefined : logRules ? dateBounds.earliest : undefined} max={logRules?.futureDatesAllowed ? undefined : dateBounds.today} onChange={(event) => setSelectedDate(event.target.value)} /></label>
        </header>
        <IronSectionTabs />
        <div className="iron-mobile-summary">
          <div><span>Saved</span><strong>{daySummary.customers}</strong><small>customers</small></div>
          <div><span>Pieces</span><strong>{daySummary.pieces}</strong><small>{draftSummary.pieces ? `+${draftSummary.pieces} draft` : 'saved'}</small></div>
          <div><span>Value</span><strong>{fmt(daySummary.amount)}</strong><small>{draftSummary.amount ? `+${fmt(draftSummary.amount)}` : 'saved'}</small></div>
        </div>
        <div className="iron-mobile-tools">
          <label><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer" /></label>
          <button className={showOnlyPending ? 'active' : ''} onClick={() => setShowOnlyPending((value) => !value)}><SlidersHorizontal size={16}/><span>{showOnlyPending ? 'Pending' : 'All'}</span></button>
        </div>
        {selectedDateError && <div className="iron-mobile-warning">{selectedDateError}</div>}
        <div className="iron-mobile-customers">
          {loading ? Array.from({length: 6}, (_, index) => <div className="iron-mobile-skeleton" key={index}><i/><span/><b/></div>) : !filteredSubscriptions.length ? <div className="iron-mobile-empty"><strong>No customers found</strong><span>Change the search or filter to continue.</span></div> : filteredSubscriptions.map((sub: any) => {
            const customer = sub.customer || {}
            const saved = loggedByCustomer.get(sub.customerId)
            const draftPieces = customerDraftPieces(sub.customerId)
            return <article key={sub.id} className={draftPieces ? 'has-draft' : saved ? 'is-saved' : ''}>
              <button className="iron-mobile-customer-main" onClick={() => openMobileCustomer(sub)}>
                <span className="iron-mobile-avatar">{String(customer.name || 'C').trim().charAt(0).toUpperCase()}</span>
                <span className="iron-mobile-customer-copy"><strong>{customer.name || 'Unnamed Customer'}</strong><small>{customer.phone || 'No phone number'}</small></span>
                <span className="iron-mobile-customer-status">{draftPieces ? <><b>{draftPieces}</b><small>draft</small></> : saved ? <><b>{saved.pieces}</b><small>saved</small></> : <><Plus size={16}/><small>add</small></>} </span>
                <ChevronRight size={17}/>
              </button>
            </article>
          })}
        </div>
        {draftRows.length > 0 && <div className="iron-mobile-draftbar"><span><strong>{draftSummary.customers} drafts</strong><small>{draftSummary.pieces} clothes · {fmt(draftSummary.amount)}</small></span><button disabled={saving} onClick={saveSheet}>{saving ? <Loader2 className="crm-spin" size={17}/> : <Save size={17}/>} Save all</button></div>}
      </section>

      {mobileCustomer && <div className="iron-mobile-editor" role="dialog" aria-modal="true">
        <header><button aria-label="Close entry" onClick={() => setMobileCustomerId(null)}><X size={20}/></button><div><small>{format(new Date(`${selectedDate}T00:00:00`), 'dd MMM yyyy')}</small><h2>{mobileCustomer.customer?.name || 'Customer'}</h2></div><span>{loggedByCustomer.get(mobileCustomer.customerId)?.pieces || 0}<small>saved</small></span></header>
        <div className="iron-mobile-editor-body">
          {selectedDateNeedsOverride && logRules?.canBackdateBeyondLimit && <div className="iron-mobile-backdate"><strong>Backdated entry</strong><span>Add a reason. This is recorded in the audit history.</span><input value={backdateReason} onChange={(event) => setBackdateReason(event.target.value)} placeholder="Reason for older entry"/></div>}
          <div className="iron-mobile-service-list">
            {services.map((service) => {
              const key = cellKey(mobileCustomer.customerId, service.id)
              const cell = qty[key] || { pieces: '' }
              const pieces = Number(cell.pieces || 0)
              const saved = loggedByCustomerService.get(key)
              const adjusted = Boolean(cell.ratePerPiece && Math.abs(Number(cell.ratePerPiece) - service.price) > .009)
              return <section key={service.id} className={pieces ? 'selected' : ''}>
                <div className="iron-mobile-service-head"><span><strong>{service.name}</strong><small>{fmt(service.price)} each{saved ? ` · ${saved.pieces} already saved` : ''}</small></span><div className="iron-mobile-stepper"><button disabled={!pieces} onClick={() => bumpCell(mobileCustomer.customerId, service.id, -1)}><Minus size={16}/></button><input inputMode="numeric" value={cell.pieces || ''} placeholder="0" onChange={(event) => setCellPieces(mobileCustomer.customerId, service.id, event.target.value)}/><button onClick={() => bumpCell(mobileCustomer.customerId, service.id, 1)}><Plus size={16}/></button></div></div>
                {pieces > 0 && <div className="iron-mobile-rate"><label><span>Rate</span><input inputMode="decimal" value={cell.ratePerPiece || ''} placeholder={String(service.price)} onChange={(event) => setCellRate(mobileCustomer.customerId, service.id, event.target.value)}/></label>{adjusted && <label className="reason"><span>Reason for rate change</span><input value={cell.notes || ''} onChange={(event) => setCellNotes(mobileCustomer.customerId, service.id, event.target.value)} placeholder="Required"/></label>}</div>}
              </section>
            })}
          </div>
        </div>
        <footer><span><small>Current entry</small><strong>{customerDraftPieces(mobileCustomer.customerId)} clothes</strong></span><button disabled={saving || !customerHasDraft(mobileCustomer.customerId) || Boolean(selectedDateError || backdateReasonError)} onClick={() => saveMobileCustomer(mobileCustomer.customerId)}>{saving ? <Loader2 className="crm-spin" size={18}/> : <Save size={18}/>} Save entry</button></footer>
      </div>}

      <div className="iron-sheet-desktop">
      <PageHeader
        title="Daily Iron Sheet"
        subtitle="Fast date-wise logging for active Daily Iron customers"
        actions={<div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={selectedDate} min={logRules?.canBackdateBeyondLimit ? undefined : logRules ? dateBounds.earliest : undefined} max={logRules?.futureDatesAllowed ? undefined : dateBounds.today} onChange={(event) => setSelectedDate(event.target.value)} style={{ border: '1px solid #d8e6f0', borderRadius: 10, padding: '10px 12px', background: '#fff', color: '#023c62', fontWeight: 700 }} />
          <button onClick={load} disabled={loading || saving} style={{ border: '1px solid #d8e6f0', borderRadius: 10, padding: '10px 14px', background: '#fff', color: '#023c62', fontWeight: 800, cursor: loading || saving ? 'not-allowed' : 'pointer' }}>Refresh</button>
          <button onClick={saveSheet} disabled={saving || !draftRows.length || Boolean(selectedDateError || backdateReasonError)} style={{ border: 'none', borderRadius: 10, padding: '10px 16px', background: saving || !draftRows.length || selectedDateError || backdateReasonError ? '#b8c8d7' : '#023c62', color: '#fff', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: saving || !draftRows.length || selectedDateError || backdateReasonError ? 'not-allowed' : 'pointer' }}>
            {saving ? <Loader2 size={15} className="crm-spin" /> : <Save size={15} />}
            Save Day
          </button>
        </div>}
      />

      <IronSectionTabs />

      {selectedDateError && (
        <div style={{ margin: '0 0 14px', border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 800 }}>
          {selectedDateError}
        </div>
      )}
      {selectedDateNeedsOverride && logRules?.canBackdateBeyondLimit && (
        <div style={{ margin: '0 0 14px', border: '1px solid #facc15', background: '#fffbeb', color: '#92400e', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 850 }}>Backdated Daily Iron entry. Add a reason and it will be saved in audit logs.</div>
          <input value={backdateReason} onChange={(event) => setBackdateReason(event.target.value)} placeholder="Reason, for example: customer gave old clothes today" style={{ border: '1px solid #f3d58a', borderRadius: 8, padding: '10px 12px', color: '#142033', fontWeight: 700 }} />
          {backdateReasonError && <small style={{ color: '#b45309', fontWeight: 800 }}>{backdateReasonError}</small>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.75fr', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e1ebf4', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Search size={18} color="#6b7fa3" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer name or phone..." style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: '#142033', background: 'transparent' }} />
          <button onClick={() => setShowOnlyPending((value) => !value)} style={{ border: '1px solid #d8e6f0', borderRadius: 999, padding: '8px 12px', background: showOnlyPending ? '#e8f7f0' : '#fff', color: showOnlyPending ? '#166534' : '#52657f', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <SlidersHorizontal size={14} /> {showOnlyPending ? 'Pending only' : 'All active'}
          </button>
        </div>
        <div style={{ background: '#023c62', borderRadius: 12, padding: '12px 16px', color: '#fff', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            ['Customers', daySummary.customers, draftSummary.customers ? `+${draftSummary.customers} pending` : 'saved today'],
            ['Lines', daySummary.lines, draftSummary.lines ? `+${draftSummary.lines} pending` : 'saved today'],
            ['Pieces', daySummary.pieces, draftSummary.pieces ? `+${draftSummary.pieces} pending` : 'saved today'],
            ['Value', fmt(daySummary.amount), draftSummary.amount ? `+${fmt(draftSummary.amount)} pending` : 'saved today'],
          ].map(([label, value, hint]) => (
            <div key={label}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(214,232,247,0.72)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{value}</div>
              <div style={{ fontSize: 10.5, color: 'rgba(214,232,247,0.68)', marginTop: 2, fontWeight: 700 }}>{hint}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #dfeaf3', borderRadius: 14, overflow: 'hidden', boxShadow: '0 14px 34px rgba(2,60,98,0.06)' }}>
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 310px)', minHeight: 380 }}>
          <table style={{ width: '100%', minWidth: Math.max(1180, 540 + services.length * 132), borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, width: 290, background: '#f7fafc', borderBottom: '1px solid #e3edf6', borderRight: '1px solid #e3edf6', padding: '12px 14px', textAlign: 'left', color: '#52657f', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Customer</th>
                {services.map((service) => (
                  <th key={service.id} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f7fafc', borderBottom: '1px solid #e3edf6', borderRight: '1px solid #eef4f8', padding: '10px 8px', textAlign: 'center', minWidth: 126 }}>
                    <div style={{ color: '#023c62', fontSize: 12.5, fontWeight: 900, lineHeight: 1.2 }}>{service.name}</div>
                    <div style={{ color: '#7c90a8', fontSize: 11, marginTop: 3 }}>{fmt(service.price)}</div>
                  </th>
                ))}
                <th style={{ position: 'sticky', right: 220, top: 0, zIndex: 3, width: 150, background: '#f7fafc', borderBottom: '1px solid #e3edf6', borderLeft: '1px solid #e3edf6', padding: '12px 12px', textAlign: 'center', color: '#52657f', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>More</th>
                <th style={{ position: 'sticky', right: 0, top: 0, zIndex: 3, width: 220, background: '#f7fafc', borderBottom: '1px solid #e3edf6', borderLeft: '1px solid #e3edf6', padding: '12px 12px', textAlign: 'left', color: '#52657f', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Logs</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={services.length + 3} style={{ padding: 52, textAlign: 'center', color: '#6b7fa3' }}>Loading Daily Iron sheet...</td></tr>
              ) : !services.length ? (
                <tr><td colSpan={services.length + 3} style={{ padding: 52, textAlign: 'center', color: '#9dafc8' }}>No active priced Daily Iron items found in Pricing.</td></tr>
              ) : !filteredSubscriptions.length ? (
                <tr><td colSpan={services.length + 3} style={{ padding: 52, textAlign: 'center', color: '#9dafc8' }}>No active Daily Iron customers match this view.</td></tr>
              ) : filteredSubscriptions.map((sub: any) => {
                const customer = sub.customer || {}
                const existing = loggedByCustomer.get(sub.customerId)
                const customerTimeline = timelineByCustomer.get(sub.customerId) || []
                const isOpen = Boolean(expanded[sub.customerId])
                const isLoggedLocked = Boolean(existing && !addingMoreForLogged[sub.customerId])
                const draftPiecesForCustomer = customerDraftPieces(sub.customerId)
                const hasDraftForCustomer = draftPiecesForCustomer > 0
                const actionLabel = isLoggedLocked
                  ? 'Add more'
                  : existing
                    ? isOpen && !hasDraftForCustomer ? 'Cancel add more' : hasDraftForCustomer ? `Review ${draftPiecesForCustomer} pcs` : 'Extra'
                    : 'Extra'
                return (
                  <Fragment key={sub.id}>
                    <tr key={sub.id} style={{ background: isOpen ? '#fbfdff' : '#fff' }}>
                      <td style={{ position: 'sticky', left: 0, zIndex: 1, background: isOpen ? '#fbfdff' : '#fff', borderBottom: '1px solid #eef4f8', borderRight: '1px solid #e3edf6', padding: '12px 14px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#023c62', fontSize: 14.5, fontWeight: 900, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{customer.name || 'Unnamed Customer'}</div>
                            <div style={{ color: '#6b7fa3', fontSize: 12, marginTop: 3 }}>{customer.phone ? `+91 ${customer.phone}` : 'No phone'}</div>
                            <Link href={`/dashboard/customers/${sub.customerId}?tab=iron`} style={{ color: '#035a8f', fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'inline-block', marginTop: 5 }}>Open account</Link>
                          </div>
                          {existing && isLoggedLocked && <CheckCircle2 size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />}
                        </div>
                        {existing && (
                          <div style={{ marginTop: 8, borderRadius: 9, background: isLoggedLocked ? '#f0fdf4' : '#fffbeb', color: isLoggedLocked ? '#166534' : '#92400e', padding: '7px 9px', fontSize: 11.5, fontWeight: 800 }}>
                            {isLoggedLocked ? 'Saved entries are locked. Use Add more only for additional clothes.' : `Adding more for this date. Already saved: ${existing.pieces} pcs.`}
                          </div>
                        )}
                      </td>
                      {services.map((service) => {
                        const key = cellKey(sub.customerId, service.id)
                        const cell = qty[key] || { pieces: '' }
                        const savedCell = loggedByCustomerService.get(key)
                        const pieces = Number(cell.pieces || 0)
                        const hasRateOverride = cell.ratePerPiece && Math.abs(Number(cell.ratePerPiece) - service.price) > 0.009
                        return (
                          <td key={service.id} style={{ borderBottom: '1px solid #eef4f8', borderRight: '1px solid #f1f5f9', padding: '10px 8px', verticalAlign: 'top' }}>
                            {savedCell && (
                              <div style={{ marginBottom: 7, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 8, padding: '5px 6px', textAlign: 'center', fontSize: 11.5, fontWeight: 900 }}>
                                {savedCell.pieces}
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <button
                                type="button"
                                data-testid={`daily-iron-minus-${sub.customerId}-${service.id}`}
                                aria-label={`Decrease ${service.name} for ${customer.name || customer.phone || 'customer'}`}
                                onClick={() => bumpCell(sub.customerId, service.id, -1)}
                                disabled={!pieces || isLoggedLocked}
                                style={stepButton(!pieces || isLoggedLocked)}
                              ><Minus size={13} /></button>
                              <input
                                data-testid={`daily-iron-qty-${sub.customerId}-${service.id}`}
                                aria-label={`${service.name} quantity for ${customer.name || customer.phone || 'customer'}`}
                                inputMode="numeric"
                                value={cell.pieces || ''}
                                disabled={isLoggedLocked}
                                onInput={(event) => {
                                  setCellPieces(sub.customerId, service.id, event.currentTarget.value)
                                }}
                                onChange={(event) => setCellPieces(sub.customerId, service.id, event.target.value)}
                                placeholder="0"
                                style={{ width: 42, height: 28, border: '1px solid #d8e6f0', borderRadius: 8, textAlign: 'center', fontSize: 14, fontWeight: 900, color: isLoggedLocked ? '#9dafc8' : '#023c62', background: isLoggedLocked ? '#f5f8fb' : '#fff', outline: 'none' }}
                              />
                              <button
                                type="button"
                                data-testid={`daily-iron-plus-${sub.customerId}-${service.id}`}
                                aria-label={`Increase ${service.name} for ${customer.name || customer.phone || 'customer'}`}
                                onClick={() => bumpCell(sub.customerId, service.id, 1)}
                                disabled={isLoggedLocked}
                                style={stepButton(isLoggedLocked)}
                              ><Plus size={13} /></button>
                            </div>
                            {(pieces > 0 || hasRateOverride) && (
                              <div style={{ marginTop: 7, display: 'grid', gap: 5 }}>
                                <input inputMode="decimal" value={cell.ratePerPiece || ''} disabled={isLoggedLocked} onInput={(event) => setCellRate(sub.customerId, service.id, event.currentTarget.value)} onChange={(event) => setCellRate(sub.customerId, service.id, event.target.value)} placeholder={`Rate ${service.price}`} style={{ width: '100%', border: '1px solid #e0eaf2', borderRadius: 7, padding: '5px 6px', fontSize: 11.5, color: isLoggedLocked ? '#9dafc8' : '#142033', background: isLoggedLocked ? '#f5f8fb' : '#fff', outline: 'none' }} />
                                {hasRateOverride && <input value={cell.notes || ''} disabled={isLoggedLocked} onChange={(event) => setCellNotes(sub.customerId, service.id, event.target.value)} placeholder="Rate reason" style={{ width: '100%', border: '1px solid #e0eaf2', borderRadius: 7, padding: '5px 6px', fontSize: 11.5, color: isLoggedLocked ? '#9dafc8' : '#142033', background: isLoggedLocked ? '#f5f8fb' : '#fff', outline: 'none' }} />}
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td style={{ position: 'sticky', right: 220, zIndex: 1, background: isOpen ? '#fbfdff' : '#fff', borderBottom: '1px solid #eef4f8', borderLeft: '1px solid #e3edf6', padding: '12px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                        <div style={{ display: 'grid', gap: 7, justifyItems: 'center' }}>
                          <button onClick={() => {
                            if (isLoggedLocked) {
                              setAddingMoreForLogged((prev) => ({ ...prev, [sub.customerId]: true }))
                              setExpanded((prev) => ({ ...prev, [sub.customerId]: true }))
                              toast(`Adding more clothes for ${customer.name || customer.phone || 'customer'}`)
                              return
                            }
                            if (existing && isOpen && !customerHasDraft(sub.customerId)) {
                              clearCustomerDraft(sub.customerId)
                              return
                            }
                            const nextOpen = !isOpen
                            setExpanded((prev) => ({ ...prev, [sub.customerId]: nextOpen }))
                            if (existing && !nextOpen && !customerHasDraft(sub.customerId)) {
                              setAddingMoreForLogged((prev) => {
                                const next = { ...prev }
                                delete next[sub.customerId]
                                return next
                              })
                            }
                          }} style={{ border: '1px solid #d8e6f0', background: isOpen ? '#023c62' : '#fff', color: isOpen ? '#fff' : '#023c62', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {actionLabel}
                          </button>
                          {existing && hasDraftForCustomer && (
                            <button type="button" onClick={() => clearCustomerDraft(sub.customerId)} style={{ border: '1px solid #fecaca', background: '#fff1f2', color: '#be123c', borderRadius: 9, padding: '6px 9px', fontSize: 11.5, fontWeight: 900, cursor: 'pointer' }}>
                              Discard
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ position: 'sticky', right: 0, zIndex: 1, background: isOpen ? '#fbfdff' : '#fff', borderBottom: '1px solid #eef4f8', borderLeft: '1px solid #e3edf6', padding: '10px 10px', verticalAlign: 'top' }}>
                        <div style={{ maxHeight: 118, overflowY: 'auto', display: 'grid', gap: 6, paddingRight: 2 }}>
                          {!customerTimeline.length ? (
                            <div style={{ color: '#9dafc8', fontSize: 12, fontWeight: 700 }}>No logs yet</div>
                          ) : customerTimeline.slice(0, 5).map((event: any, index: number) => {
                            const tone = timelineTone(event)
                            return (
                            <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '12px 1fr', gap: 7, minWidth: 0 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                                <div style={{ width: 8, height: 8, borderRadius: 999, background: tone.dot }} />
                                {index < Math.min(customerTimeline.length, 5) - 1 && <div style={{ width: 1, flex: 1, minHeight: 14, background: '#e3edf6', marginTop: 3 }} />}
                              </div>
                              <div style={{ minWidth: 0, border: `1px solid ${tone.border}`, background: tone.bg, borderRadius: 9, padding: '6px 8px' }}>
                                <div style={{ color: tone.title, fontSize: 12, fontWeight: 900, lineHeight: 1.25 }}>
                                  {event.title || 'Daily Iron event'}
                                </div>
                                <div style={{ color: tone.meta, fontSize: 10.5, marginTop: 2, overflowWrap: 'anywhere' as const, lineHeight: 1.35 }}>
                                  {format(new Date(event.createdAt), 'h:mm a')}{event.eventType ? ` · ${event.eventType}` : ''}{event.actorName ? ` · ${event.actorName}` : ''}
                                </div>
                                {event.notes && (
                                  <div style={{ color: '#6b7fa3', fontSize: 10.5, marginTop: 2, overflowWrap: 'anywhere' as const, lineHeight: 1.35 }}>
                                    {String(event.notes)}
                                  </div>
                                )}
                              </div>
                            </div>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${sub.id}-extra`}>
                        <td colSpan={services.length + 3} style={{ padding: 0, borderBottom: '1px solid #e3edf6', background: '#fbfdff' }}>
                          <div style={{ marginLeft: 290, padding: '12px 14px', display: 'grid', gap: 8 }}>
                            {(extraLines[sub.customerId] || []).map((line) => (
                              <div key={line.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 90px 110px minmax(180px, 1fr) 76px', gap: 8, alignItems: 'center' }}>
                                <select value={line.serviceId} onChange={(event) => updateExtraLine(sub.customerId, line.id, { serviceId: event.target.value })} style={{ border: '1px solid #d8e6f0', borderRadius: 8, padding: '8px 10px', color: '#023c62', fontWeight: 700, background: '#fff' }}>
                                  {services.map((service) => <option key={service.id} value={service.id}>{service.name} - {fmt(service.price)}</option>)}
                                </select>
                                <input inputMode="numeric" value={line.pieces} onInput={(event) => updateExtraLine(sub.customerId, line.id, { pieces: sanitizeIntegerInput(event.currentTarget.value).slice(0, 3) })} onChange={(event) => updateExtraLine(sub.customerId, line.id, { pieces: sanitizeIntegerInput(event.target.value).slice(0, 3) })} placeholder="Qty" style={{ border: '1px solid #d8e6f0', borderRadius: 8, padding: '8px 10px', color: '#142033', fontWeight: 800 }} />
                                <input inputMode="decimal" value={line.ratePerPiece} onInput={(event) => updateExtraLine(sub.customerId, line.id, { ratePerPiece: sanitizeDecimalInput(event.currentTarget.value, 2).slice(0, 8) })} onChange={(event) => updateExtraLine(sub.customerId, line.id, { ratePerPiece: sanitizeDecimalInput(event.target.value, 2).slice(0, 8) })} placeholder="Rate" style={{ border: '1px solid #d8e6f0', borderRadius: 8, padding: '8px 10px', color: '#142033', fontWeight: 800 }} />
                                <input value={line.notes} onChange={(event) => updateExtraLine(sub.customerId, line.id, { notes: event.target.value.slice(0, 160) })} placeholder="Reason / notes" style={{ border: '1px solid #d8e6f0', borderRadius: 8, padding: '8px 10px', color: '#142033' }} />
                                <button onClick={() => removeExtraLine(sub.customerId, line.id)} style={{ border: '1px solid #fecaca', background: '#fff1f2', color: '#be123c', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>Remove</button>
                              </div>
                            ))}
                            {existing && addingMoreForLogged[sub.customerId] && (
                              <button type="button" onClick={() => clearCustomerDraft(sub.customerId)} style={{ justifySelf: 'start', border: '1px solid #fbbf24', background: '#fff7ed', color: '#92400e', borderRadius: 8, padding: '7px 10px', fontSize: 11.5, fontWeight: 900, cursor: 'pointer' }}>
                                {hasDraftForCustomer ? 'Discard added clothes' : 'Cancel add more'}
                              </button>
                            )}
                            <button onClick={() => addExtraLine(sub.customerId)} style={{ justifySelf: 'start', border: '1px dashed #8bb6d8', background: '#f5fbff', color: '#035a8f', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>+ Add duplicate / special-rate line</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '11px 14px', background: '#f8fbfd', borderTop: '1px solid #e3edf6', color: '#6b7fa3', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>{filteredSubscriptions.length} of {subscriptions.length} active customers shown for {format(new Date(selectedDate), 'dd MMM yyyy')}</span>
          <span>Saved rows are locked first. Use Add more only when extra clothes come later for the same date.</span>
        </div>
      </div>
      </div>
    </div>
  )
}
