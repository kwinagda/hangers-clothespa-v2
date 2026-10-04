'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, FileText, Loader2, MessageCircle, Minus, Plus, ReceiptIndianRupee, RefreshCw, Search, Send, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { ironAPI, servicesAPI } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import IronSectionTabs from '../_components/IronSectionTabs'
import IronBillingWorkspace from './IronBillingWorkspace'

const money = (value: unknown) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const currentMonth = () => new Date().toISOString().slice(0, 7)
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
const statusLabel: Record<string, string> = { UNBILLED:'Unbilled', PARTIALLY_BILLED:'Partially billed', BILLED:'Billed', PARTIALLY_PAID:'Partially paid', PAID:'Paid', NO_ACTIVITY:'No activity' }
type IronLogRules = {
  today?: string
  backdateDays: number
  futureDatesAllowed?: boolean
  canBackdateBeyondLimit?: boolean
  backdateReasonRequired?: boolean
}

const parseDateOnly = (value: string) => {
  if (!value) return null
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}
const dateText = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const getRuleDateBounds = (rules: IronLogRules | null) => {
  const today = parseDateOnly(String(rules?.today || '').slice(0, 10)) || parseDateOnly(new Date().toISOString().slice(0, 10)) || new Date()
  const earliest = new Date(today)
  earliest.setDate(earliest.getDate() - Math.max(0, Number(rules?.backdateDays || 0)))
  return { today: dateText(today), earliest: dateText(earliest) }
}
const isBeyondIronBackdateLimit = (date: string, rules: IronLogRules | null) => {
  if (!rules) return false
  const selected = parseDateOnly(date)
  const earliest = parseDateOnly(getRuleDateBounds(rules).earliest)
  return Boolean(selected && earliest && selected < earliest)
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

export default function DailyIronMonthlyPage() {
  const [month, setMonth] = useState(currentMonth())
  const [payload, setPayload] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [detail, setDetail] = useState<any>(null)
  const [totalDetail, setTotalDetail] = useState<any>(null)
  const [adding, setAdding] = useState<any>(null)
  const [services, setServices] = useState<any[]>([])
  const [addQty, setAddQty] = useState<Record<string, number>>({})
  const [savingClothes, setSavingClothes] = useState(false)
  const [billingWorkspace, setBillingWorkspace] = useState<{rows:any[];action?:'GENERATE'|'SEND'|'PAY'|'REMIND'}|null>(null)
  const [logRules, setLogRules] = useState<IronLogRules | null>(null)
  const [backdateReason, setBackdateReason] = useState('')
  const [rowBusy, setRowBusy] = useState('')
  const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await ironAPI.getMonthlySummary(month)
      setPayload(response?.data || response)
      setSelected({})
    } catch (error: any) { toast.error(error.message || 'Failed to load monthly summary') }
    finally { setLoading(false) }
  }, [month])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    ironAPI.getLogRules()
      .then((response: any) => setLogRules(response?.data || response))
      .catch(() => setLogRules(null))
  }, [])

  const rows = useMemo(() => (payload?.customers || []).filter((row: any) => {
    const matchesSearch = `${row.customer?.name || ''} ${row.customer?.phone || ''}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (status === 'ALL' || row.billingStatus === status)
  }), [payload, search, status])
  const days = Array.from({ length: payload?.daysInMonth || 31 }, (_, index) => index + 1)
  const selectedRows = rows.filter((row: any) => selected[row.customer.id])

  const moveMonth = (offset: number) => {
    const [year, monthNumber] = month.split('-').map(Number)
    const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
    const next = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    if (next <= currentMonth()) setMonth(next)
  }
  const selectedYear = Number(month.slice(0,4))
  const selectedMonthNumber = Number(month.slice(5,7))
  const currentYear = Number(currentMonth().slice(0,4))
  const currentMonthNumber = Number(currentMonth().slice(5,7))
  const years = Array.from({length:currentYear-2018+1},(_,index)=>currentYear-index)
  const selectMonthPart = (year:number, monthNumber:number) => {
    const boundedMonth = year === currentYear ? Math.min(monthNumber,currentMonthNumber) : monthNumber
    setMonth(`${year}-${String(boundedMonth).padStart(2,'0')}`)
  }
  const openAdd = async (row: any, day: number) => {
    setAdding({ row, day, date: `${month}-${String(day).padStart(2, '0')}` })
    setAddQty({})
    setBackdateReason('')
    if (services.length) return
    try {
      const response = await servicesAPI.getDailyIronRates()
      const catalog = response?.data?.catalog || response?.data || response?.catalog || []
      setServices(catalog.flatMap((section: any) => (section.items || []).map((item: any) => ({ id:item.id, name:item.name, price:Number(item.price ?? item.basePrice ?? 0) }))).filter((item:any)=>item.id && item.price>0))
    } catch (error:any) { toast.error(error.message || 'Failed to load Daily Iron items') }
  }
  const saveClothes = async () => {
    const items = services.filter((service:any)=>Number(addQty[service.id])>0).map((service:any)=>({ serviceId:service.id, pieces:Number(addQty[service.id]) }))
    if (!items.length || savingClothes) return toast.error('Add at least one clothing item')
    const dateError = ironDateRuleError(adding.date, logRules)
    const needsOverride = isBeyondIronBackdateLimit(adding.date, logRules)
    if (dateError) return toast.error(dateError)
    if (needsOverride && logRules?.canBackdateBeyondLimit && logRules?.backdateReasonRequired && backdateReason.trim().length < 3) {
      return toast.error('Add a reason for saving Daily Iron entries older than the normal window')
    }
    setSavingClothes(true)
    try {
      await ironAPI.createLogsBatch({
        customerId:adding.row.customer.id,
        date:adding.date,
        items,
        ...(needsOverride ? { backdateReason: backdateReason.trim() } : {}),
      })
      toast.success(`Clothes added for ${adding.row.customer.name}`)
      setAdding(null); setAddQty({}); setBackdateReason(''); await load()
    } catch (error:any) { toast.error(error.message || 'Failed to add clothes') }
    finally { setSavingClothes(false) }
  }

  const allVisibleSelected = rows.length > 0 && rows.every((row:any)=>selected[row.customer.id])
  const openBulk = (action:'GENERATE'|'SEND'|'PAY'|'REMIND') => selectedRows.length && setBillingWorkspace({rows:selectedRows,action})
  const billBalance = (bill:any) => Math.max(0, Number(bill?.invoice?.balanceDue ?? (Number(bill?.totalAmount || 0) - Number(bill?.paidAmount || 0))))
  const activeBills = (row:any) => (row.bills || []).filter((bill:any) => String(bill.status || '').toUpperCase() !== 'VOID')
  const rowDraftBills = (row:any) => activeBills(row).filter((bill:any) => String(bill.status || '').toUpperCase() === 'DRAFT' && billBalance(bill) > 0.005)
  const buildMonthTotalDetail = (row:any) => {
    const itemMap = new Map<string, { name:string; pieces:number; amount:number }>()
    ;(row.logs || []).filter((log:any)=>String(log.status || '').toUpperCase()==='ACTIVE').forEach((log:any) => {
      const name = log.serviceName || log.service?.name || 'Daily Iron item'
      const current = itemMap.get(name) || { name, pieces: 0, amount: 0 }
      current.pieces += Number(log.pieces || 0)
      current.amount += Number(log.amount || 0)
      itemMap.set(name, current)
    })
    return {
      row,
      items: Array.from(itemMap.values()).sort((a,b)=>b.pieces-a.pieces || a.name.localeCompare(b.name)),
      activeBillCount: activeBills(row).length,
    }
  }
  const rowActionLabel = (row:any) => {
    if (rowDraftBills(row).length) return 'Send bill'
    if (row.unbilledPieces > 0) return 'Generate bill'
    if (row.billingStatus === 'PAID') return 'View paid bill'
    if (row.billingStatus === 'PARTIALLY_PAID') return 'Record payment'
    return activeBills(row).length ? 'Manage billing' : 'Review billing'
  }
  const handleRowBillingAction = async (row:any) => {
    setBillingWorkspace({ rows: [row] })
  }

  return <div className="monthly-page">
    <PageHeader title="Daily Iron Monthly Summary" subtitle="Date-wise clothes, billing position and monthly totals" actions={<div className="monthly-actions"><div className="month-nav"><button aria-label="Previous month" onClick={()=>moveMonth(-1)}><ChevronLeft size={17}/></button><div className="month-selects"><select aria-label="Month" value={selectedMonthNumber} onChange={(e)=>selectMonthPart(selectedYear,Number(e.target.value))}>{monthNames.map((name,index)=><option key={name} value={index+1} disabled={selectedYear===currentYear&&index+1>currentMonthNumber}>{name}</option>)}</select><select aria-label="Year" value={selectedYear} onChange={(e)=>selectMonthPart(Number(e.target.value),selectedMonthNumber)}>{years.map(year=><option key={year} value={year}>{year}</option>)}</select></div><button aria-label="Next month" onClick={()=>moveMonth(1)} disabled={month>=currentMonth()}><ChevronRight size={17}/></button></div><button className="refresh" onClick={load} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>}/>
    <IronSectionTabs />
    <section className="summary-strip">
      <div><span>Customers</span><strong>{payload?.summary?.customers || 0}</strong></div><div><span>Total clothes</span><strong>{payload?.summary?.totalPieces || 0}</strong></div><div><span>Month value</span><strong>{money(payload?.summary?.totalAmount)}</strong></div><div><span>Pending billing</span><strong>{payload?.summary?.unbilledPieces || 0} clothes</strong><small>{money(payload?.summary?.unbilledAmount)}</small></div>
    </section>
    <section className="summary-tools"><label><Search size={15}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search customer or phone"/></label><select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="ALL">All billing statuses</option>{Object.entries(statusLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></section>
    {!!selectedRows.length&&<section className="bulk-toolbar"><div><strong>{selectedRows.length} selected</strong><button onClick={()=>setSelected({})}>Clear</button></div><span className="bulk-actions"><button onClick={()=>openBulk('GENERATE')}><FileText size={14}/> Generate</button><button onClick={()=>openBulk('SEND')}><Send size={14}/> Send bills</button><button onClick={()=>openBulk('PAY')}><ReceiptIndianRupee size={14}/> Record payments</button><button onClick={()=>openBulk('REMIND')}><MessageCircle size={14}/> Send reminders</button></span></section>}
    {loading ? <div className="monthly-empty"><Loader2 className="crm-spin"/> Loading monthly summary…</div> : !rows.length ? <div className="monthly-empty">No Daily Iron activity matches this month and filter.</div> : <>
      <div className="matrix-wrap"><table><thead><tr><th className="sticky-customer"><label className="select-all"><input type="checkbox" checked={allVisibleSelected} onChange={(e)=>setSelected(Object.fromEntries(rows.map((row:any)=>[row.customer.id,e.target.checked])))}/> Customer</label></th>{days.map(day=><th className="day-head" key={day}>{day}</th>)}<th>Month total</th><th>Pending billing</th><th>Status</th><th className="sticky-action">Billing</th></tr></thead><tbody>{rows.map((row:any)=><tr key={row.customer.id}><td className="sticky-customer"><label className="customer-cell"><input type="checkbox" checked={Boolean(selected[row.customer.id])} onChange={(e)=>setSelected(s=>({...s,[row.customer.id]:e.target.checked}))}/><span><Link href={`/dashboard/customers/${row.customer.id}?tab=iron`}>{row.customer.name}</Link><small>{row.customer.phone}</small></span></label></td>{days.map(day=>{const cell=row.days?.[day];return <td key={day}>{cell?<button className="day-cell" onClick={()=>setDetail({row,day,...cell})}>{cell.pieces}</button>:<button className="empty-day" title="No clothes logged. Click to add." aria-label="Add clothes" onClick={()=>openAdd(row,day)}><Plus size={12}/></button>}</td>})}<td><button className="total-cell stacked-total" onClick={()=>setTotalDetail(buildMonthTotalDetail(row))}><strong>{row.totalPieces} clothes</strong><small>{money(row.totalAmount)}</small></button></td><td><div className={`pending-cell ${row.unbilledPieces > 0 ? 'has-pending' : ''}`}>{row.unbilledPieces > 0 ? <><strong>{row.unbilledPieces} clothes</strong><small>{money(row.unbilledAmount)}</small></> : <strong>Fully billed</strong>}</div></td><td><span className={`status ${row.billingStatus.toLowerCase()}`}>{statusLabel[row.billingStatus] || row.billingStatus}</span></td><td className="sticky-action"><button className="bill-button" disabled={rowBusy===row.customer.id} onClick={()=>handleRowBillingAction(row)}>{rowBusy===row.customer.id?'Working...':rowActionLabel(row)} <ChevronRight size={13}/></button></td></tr>)}</tbody></table></div>
      <div className="mobile-list">{rows.map((row:any)=>{const activeDays=days.filter(day=>row.days?.[day]);const expanded=Boolean(mobileExpanded[row.customer.id]);return <article key={row.customer.id}><div className="mobile-head"><label><input type="checkbox" checked={Boolean(selected[row.customer.id])} onChange={(e)=>setSelected(s=>({...s,[row.customer.id]:e.target.checked}))}/><div><Link href={`/dashboard/customers/${row.customer.id}?tab=iron`}>{row.customer.name}</Link><span>{row.customer.phone}</span></div></label><span className={`status ${row.billingStatus.toLowerCase()}`}>{statusLabel[row.billingStatus]}</span></div><button className="mobile-month-total" onClick={()=>setTotalDetail(buildMonthTotalDetail(row))}><span><small>Month total</small><strong>{row.totalPieces} clothes</strong></span><b>{money(row.totalAmount)}</b><ChevronRight size={15}/></button><div className={`mobile-pending ${row.unbilledPieces > 0 ? 'has-pending' : ''}`}><span>Pending billing</span><strong>{row.unbilledPieces > 0 ? `${row.unbilledPieces} clothes · ${money(row.unbilledAmount)}` : 'Fully billed'}</strong></div>{activeDays.length>0&&<><button className="mobile-days-toggle" onClick={()=>setMobileExpanded(current=>({...current,[row.customer.id]:!expanded}))}><span>{activeDays.length} service {activeDays.length===1?'date':'dates'}</span>{expanded?'Hide':'View'} <ChevronRight size={14}/></button>{expanded&&<div className="mobile-days">{activeDays.map(day=><button key={day} onClick={()=>setDetail({row,day,...row.days[day]})}><span>{day} {monthNames[selectedMonthNumber-1].slice(0,3)}</span><strong>{row.days[day].pieces} pcs</strong><b>{money(row.days[day].amount)}</b><ChevronRight size={14}/></button>)}</div>}</>}<button className="mobile-bill" disabled={rowBusy===row.customer.id} onClick={()=>handleRowBillingAction(row)}>{rowBusy===row.customer.id?<><Loader2 className="crm-spin" size={15}/> Working...</>:<>{rowActionLabel(row)} <ChevronRight size={14}/></>}</button></article>})}</div>
    </>}
    {adding&&typeof document!=='undefined'&&createPortal(<div className="modal-backdrop" onClick={()=>setAdding(null)}><section className="entry-modal" onClick={(e)=>e.stopPropagation()}><header><div><small>Add clothes for</small><h2>{adding.row.customer.name}</h2><p>{new Date(`${adding.date}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})} · currently 0 clothes</p></div><button onClick={()=>setAdding(null)}><X/></button></header>{(() => { const needsOverride = isBeyondIronBackdateLimit(adding.date, logRules); const dateError = ironDateRuleError(adding.date, logRules); return dateError ? <div className="date-warning blocked">{dateError}</div> : needsOverride && logRules?.canBackdateBeyondLimit ? <div className="date-warning"><strong>Backdated entry</strong><span>Add a reason. It will be saved in the audit history.</span><input value={backdateReason} onChange={(e)=>setBackdateReason(e.target.value)} placeholder="Reason for older entry"/></div> : null })()}<div className="service-picker">{!services.length?<div className="picker-loading"><Loader2 className="crm-spin"/> Loading active items…</div>:services.map((service:any)=>{const qty=addQty[service.id]||0;return <div key={service.id}><span><strong>{service.name}</strong><small>{money(service.price)} each</small></span><div className="stepper"><button disabled={!qty} onClick={()=>setAddQty(q=>({...q,[service.id]:Math.max(0,qty-1)}))}><Minus size={14}/></button><input inputMode="numeric" value={qty||''} placeholder="0" onChange={(e)=>setAddQty(q=>({...q,[service.id]:Math.min(999,Number(e.target.value.replace(/\D/g,''))||0)}))}/><button onClick={()=>setAddQty(q=>({...q,[service.id]:qty+1}))}><Plus size={14}/></button></div></div>})}</div><footer><div><span>{Object.values(addQty).reduce((sum,value)=>sum+Number(value||0),0)} clothes</span><strong>{money(services.reduce((sum:any,service:any)=>sum+(addQty[service.id]||0)*service.price,0))}</strong></div><button disabled={savingClothes||!Object.values(addQty).some(Boolean)||Boolean(ironDateRuleError(adding.date, logRules))||(isBeyondIronBackdateLimit(adding.date, logRules)&&logRules?.canBackdateBeyondLimit&&logRules?.backdateReasonRequired&&backdateReason.trim().length<3)} onClick={saveClothes}>{savingClothes?'Saving…':'Add clothes'}</button></footer></section></div>,document.body)}
    {billingWorkspace&&<IronBillingWorkspace month={month} rows={billingWorkspace.rows} action={billingWorkspace.action} onClose={()=>setBillingWorkspace(null)} onChanged={load}/>}
    {totalDetail&&typeof document!=='undefined'&&createPortal(<div className="drawer-backdrop" onClick={()=>setTotalDetail(null)}><aside className="detail-drawer" onClick={(e)=>e.stopPropagation()}><header><div><span>{new Date(`${month}-01`).toLocaleString('en-IN',{month:'long',year:'numeric'})} total</span><h2>{totalDetail.row.customer.name}</h2></div><button onClick={()=>setTotalDetail(null)}><X/></button></header><div className="drawer-summary"><span>{totalDetail.row.totalPieces} clothes</span><strong>{money(totalDetail.row.totalAmount)}</strong></div><div className="log-list total-log-list">{totalDetail.items.length?totalDetail.items.map((item:any)=><div key={item.name}><div><strong>{item.name}</strong><span>{item.pieces} pcs</span></div><b>{money(item.amount)}</b></div>):<div><div><strong>No active clothes</strong><span>Only voided or inactive entries are present.</span></div></div>}</div><div className="total-billing-note"><span>Unbilled</span><strong>{totalDetail.row.unbilledPieces} clothes · {money(totalDetail.row.unbilledAmount)}</strong></div><Link className="drawer-link" href={`/dashboard/customers/${totalDetail.row.customer.id}?tab=iron`}>Open customer Daily Iron account <ChevronRight size={15}/></Link></aside></div>,document.body)}
    {detail&&typeof document!=='undefined'&&createPortal(<div className="drawer-backdrop" onClick={()=>setDetail(null)}><aside className="detail-drawer" onClick={(e)=>e.stopPropagation()}><header><div><span>{detail.day} {new Date(`${month}-01`).toLocaleString('en-IN',{month:'long',year:'numeric'})}</span><h2>{detail.row.customer.name}</h2></div><button onClick={()=>setDetail(null)}><X/></button></header><div className="drawer-summary"><span>{detail.pieces} clothes</span><strong>{money(detail.amount)}</strong></div><div className="log-list">{detail.logs.map((log:any)=><div key={log.id} className={log.status==='ACTIVE'?'':'voided'}><div><strong>{log.serviceName}</strong><span>{log.pieces} pcs × {money(log.ratePerPiece)}</span><small>{log.bill?.billNumber || 'Unbilled'} · {log.loggedBy?.name || 'Staff'}</small></div><b>{money(log.amount)}</b></div>)}</div><Link className="drawer-link" href={`/dashboard/customers/${detail.row.customer.id}?tab=iron`}>Open customer Daily Iron account <ChevronRight size={15}/></Link></aside></div>,document.body)}
    <style jsx>{`
      .monthly-page{padding:28px 32px 60px;max-width:1600px;margin:auto;color:#142033}.monthly-actions,.summary-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.monthly-actions input,.monthly-actions button,.summary-tools select{height:40px;border:1px solid #d8e6f0;border-radius:9px;background:#fff;padding:0 12px;color:#023c62;font-weight:750}.monthly-actions button,.summary-tools button{display:inline-flex;align-items:center;gap:7px}.summary-strip{margin:18px 0 12px;background:#023c62;color:#fff;border-radius:8px;display:grid;grid-template-columns:repeat(4,1fr);overflow:hidden}.summary-strip div{padding:15px 18px;border-right:1px solid rgba(255,255,255,.15)}.summary-strip span{display:block;font-size:10px;text-transform:uppercase;color:#b9d2e3;margin-bottom:4px}.summary-strip strong{font-size:20px}.summary-tools{margin-bottom:12px}.summary-tools label{height:42px;display:flex;align-items:center;gap:8px;border:1px solid #d8e6f0;border-radius:9px;padding:0 12px;background:#fff;min-width:270px}.summary-tools input{border:0;outline:0;width:100%}.bulk-toolbar{position:sticky;top:0;z-index:20;margin:0 0 10px;padding:10px 12px;border:1px solid #bdd5e5;border-radius:8px;background:#fff;box-shadow:0 8px 22px rgba(2,60,98,.12);display:flex;align-items:center;justify-content:space-between;gap:12px}.bulk-toolbar>div{display:flex;align-items:center;gap:9px;color:#023c62}.bulk-toolbar>div button{border:0;background:none;color:#647b8e}.bulk-actions{display:flex;gap:7px;flex-wrap:wrap}.bulk-actions button{height:34px;border:1px solid #d3e2ec;border-radius:7px;background:#f7fafc;color:#023c62;padding:0 10px;display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:11px}.matrix-wrap{overflow:auto;max-height:calc(100vh - 280px);border:1px solid #dce8f0;border-radius:8px;background:#fff}.matrix-wrap table{border-collapse:separate;border-spacing:0;min-width:1500px;width:100%}.matrix-wrap th{position:sticky;top:0;z-index:3;background:#f4f8fb;color:#61778d;font-size:10px;text-transform:uppercase;padding:11px 9px;border-bottom:1px solid #dce8f0;white-space:nowrap}.matrix-wrap td{padding:9px;border-bottom:1px solid #edf3f7;border-right:1px solid #f1f5f8;text-align:center;font-size:12px}.sticky-customer{position:sticky!important;left:0;z-index:4!important;background:#fff!important;min-width:210px;text-align:left!important}.matrix-wrap th.sticky-customer{background:#f4f8fb!important;z-index:5!important}.sticky-action{position:sticky!important;right:0;z-index:4!important;background:#fff!important;min-width:130px}.matrix-wrap th.sticky-action{background:#f4f8fb!important;z-index:5!important}.select-all,.customer-cell{display:flex;align-items:center;gap:9px}.customer-cell span{display:grid}.customer-cell a{font-weight:800;color:#023c62;text-decoration:none}.customer-cell small{color:#8aa0b4;margin-top:2px}.day-head{min-width:42px}.day-cell{width:28px;height:28px;border:1px solid #cfe2ef;background:#eff8fd;color:#075985;border-radius:6px;font-weight:850;cursor:pointer}.total-cell{min-width:32px;height:28px;border:1px solid #cfe2ef;background:#f6fbfe;color:#023c62;border-radius:6px;font:inherit;font-weight:900;cursor:pointer}.total-cell:hover{background:#e9f6fd;border-color:#8fc1dc}.mobile-total-link{border:0;background:none;padding:0;margin-top:3px;color:#72879b;text-align:left;font-size:11px;cursor:pointer}.mobile-total-link:hover{color:#023c62}.number,.money{font-weight:850;color:#023c62}.status{display:inline-flex;padding:5px 8px;border-radius:999px;background:#eef2f6;color:#52657f;font-size:10px;font-weight:850;white-space:nowrap}.status.paid{background:#dcfce7;color:#166534}.status.unbilled{background:#fff7ed;color:#9a3412}.status.partially_billed,.status.partially_paid{background:#fef3c7;color:#92400e}.bill-button{border:1px solid #b9d9c8;background:#ecfdf5;color:#166534;border-radius:7px;padding:7px 9px;font-size:11px;font-weight:800;white-space:nowrap;display:inline-flex;align-items:center;gap:4px}.monthly-empty{min-height:260px;display:grid;place-items:center;color:#7890a3;gap:10px}.mobile-list{display:none}.drawer-backdrop{position:fixed;inset:0;background:rgba(2,20,34,.35);z-index:90}.detail-drawer{position:absolute;right:0;top:0;height:100%;width:min(440px,100%);background:#fff;box-shadow:-20px 0 60px rgba(2,30,50,.2);padding:22px;overflow:auto}.detail-drawer header{display:flex;justify-content:space-between;border-bottom:1px solid #e5edf3;padding-bottom:16px}.detail-drawer header span{font-size:12px;color:#72879b}.detail-drawer h2{margin:4px 0 0;color:#023c62}.detail-drawer header button{border:0;background:none}.drawer-summary{display:flex;justify-content:space-between;padding:16px 0;font-weight:800}.log-list{display:grid;gap:8px}.log-list>div{display:flex;justify-content:space-between;gap:14px;border:1px solid #e1ebf2;border-radius:8px;padding:12px}.log-list div div{display:grid;gap:3px}.log-list span,.log-list small{font-size:11px;color:#71869a}.total-log-list>div{align-items:center}.total-billing-note{margin-top:10px;border:1px solid #dbeafe;background:#eff6ff;border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;gap:12px;color:#1d4ed8;font-size:12px}.voided{opacity:.55;text-decoration:line-through}.drawer-link{margin-top:18px;display:flex;justify-content:space-between;align-items:center;padding:12px;background:#f2f8fc;border-radius:8px;color:#023c62;font-weight:800;text-decoration:none}
      @media(max-width:760px){.monthly-page{padding:14px 12px 78px}.summary-strip{grid-template-columns:repeat(2,1fr)}.summary-tools label{min-width:100%}.summary-tools select{flex:1}.bulk-toolbar{top:64px;align-items:stretch;flex-direction:column}.bulk-actions{display:grid;grid-template-columns:1fr 1fr}.bulk-actions button{justify-content:center}.matrix-wrap{display:none}.mobile-list{display:grid;gap:10px}.mobile-list article{min-width:0;border:1px solid #dce8f0;border-radius:9px;background:#fff;padding:13px;animation:crm-month-card 180ms ease both}.mobile-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.mobile-head>label{min-width:0;display:flex;align-items:flex-start;gap:8px}.mobile-head div{min-width:0;display:grid}.mobile-head a{overflow:hidden;font-weight:800;color:#023c62;text-decoration:none;text-overflow:ellipsis;white-space:nowrap}.mobile-head div span{font-size:11px;color:#72879b;margin-top:3px}.mobile-month-total{width:100%;min-height:54px;margin-top:11px;padding:8px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto 16px;align-items:center;gap:9px;border:1px solid #dce8f0;border-radius:8px;background:#f7fafc;color:#023c62;text-align:left}.mobile-month-total span{display:grid;gap:2px}.mobile-month-total small{color:#71869a;font-size:9px;text-transform:uppercase}.mobile-month-total strong{font-size:13px}.mobile-month-total b{font-size:15px}.mobile-days-toggle{width:100%;min-height:40px;margin-top:8px;padding:0 4px;display:flex;align-items:center;justify-content:flex-end;gap:5px;border:0;background:transparent;color:#43647c;font-size:11px;font-weight:750}.mobile-days-toggle span{margin-right:auto}.mobile-days{display:grid;overflow:hidden;border-block:1px solid #edf3f7;animation:crm-month-expand 160ms ease}.mobile-days button{display:grid;grid-template-columns:54px minmax(0,1fr) auto 14px;align-items:center;gap:8px;border:0;border-top:1px solid #edf3f7;background:#fff;padding:10px 4px;text-align:left;color:#647b8e}.mobile-days button:first-child{border-top:0}.mobile-days button strong{color:#23435b}.mobile-days button b{color:#023c62;font-size:11px}.mobile-bill{width:100%;min-height:44px;margin-top:9px;border:0;border-radius:8px;background:#166534;color:#fff;padding:10px;font-weight:800;display:flex;justify-content:center;align-items:center;gap:6px;transition:opacity 140ms ease,transform 140ms ease}.mobile-bill:active{transform:scale(.985)}.mobile-bill:disabled{opacity:.55}}
      @keyframes crm-month-card{from{opacity:0;transform:translateY(7px)}}@keyframes crm-month-expand{from{opacity:0;transform:translateY(-5px)}}
    `}</style>
    <style jsx>{`
      .month-nav{display:grid;grid-template-columns:40px 230px 40px;align-items:center;border:1px solid #d8e6f0;border-radius:9px;background:#fff;overflow:hidden}.month-selects{display:grid;grid-template-columns:1.25fr .75fr;gap:4px;padding:0 5px}.month-selects select{height:32px;border:0;background:#f6f9fc;color:#023c62;font-weight:800;padding:0 7px;outline:0}.month-nav button{border:0!important;border-radius:0!important;padding:0!important;justify-content:center;background:#fff!important}.month-nav button:hover:not(:disabled){background:#f0f7fb!important}.month-nav button:disabled{opacity:.35}.refresh{background:#fff!important}.empty-day{width:30px;height:28px;border:1px dashed #d5e2eb;border-radius:6px;background:#fbfdff;color:#8fa4b6;display:inline-flex;align-items:center;justify-content:center;gap:1px;font-size:9px;cursor:pointer}.empty-day:hover{border-style:solid;border-color:#68a4c9;background:#eaf6fd;color:#075985}.modal-backdrop{position:fixed;inset:0;z-index:100;background:rgba(2,20,34,.48);display:grid;place-items:center;padding:20px}.entry-modal,.billing-modal{width:min(620px,100%);max-height:min(760px,92vh);display:flex;flex-direction:column;background:#fff;border-radius:10px;box-shadow:0 28px 80px rgba(0,20,40,.28);overflow:hidden}.entry-modal header,.billing-modal header{display:flex;justify-content:space-between;gap:18px;padding:20px 22px;border-bottom:1px solid #e5edf3}.entry-modal header small,.billing-modal header small{color:#7890a3;text-transform:uppercase;font-size:10px;font-weight:850;letter-spacing:.08em}.entry-modal h2,.billing-modal h2{margin:4px 0 2px;color:#023c62;font-size:20px}.entry-modal header p,.billing-modal header p{margin:0;color:#72879b;font-size:12px}.entry-modal header button,.billing-modal header button{border:0;background:none;align-self:flex-start}.service-picker,.billing-list{overflow:auto;padding:10px 18px}.service-picker>div,.billing-list>div{min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #edf3f7}.service-picker span,.billing-list span{display:grid;gap:3px}.service-picker small,.billing-list small{color:#7890a3;font-size:11px}.stepper{display:grid;grid-template-columns:32px 48px 32px;align-items:stretch;height:32px}.stepper button{box-sizing:border-box;width:32px;height:32px;margin:0;padding:0;border:1px solid #cfe0eb;background:#f5fafc;color:#075985;display:flex;align-items:center;justify-content:center;line-height:1}.stepper button svg{display:block;flex:none}.stepper input{box-sizing:border-box;height:32px;width:48px;margin:0;padding:0;border-block:1px solid #cfe0eb;border-inline:0;text-align:center;font-weight:850;line-height:32px;outline:0}.picker-loading{justify-content:center!important;color:#7890a3}.entry-modal footer,.billing-modal footer{padding:15px 20px;border-top:1px solid #e5edf3;display:flex;align-items:center;justify-content:space-between;gap:14px}.entry-modal footer div,.billing-modal footer div{display:grid}.entry-modal footer span,.billing-modal footer span{font-size:11px;color:#7890a3}.entry-modal footer button,.billing-modal footer button{border:0;border-radius:8px;background:#023c62;color:#fff;padding:11px 17px;font-weight:850}.entry-modal footer button:disabled,.billing-modal footer button:disabled{background:#afc0ce}.billing-list b{color:#023c62}.billing-warning{margin:4px 18px 14px;padding:11px 12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px;line-height:1.5}
      .date-warning{margin:12px 18px 0;padding:10px 12px;border:1px solid #facc15;border-radius:8px;background:#fffbeb;color:#92400e;display:grid;gap:6px;font-size:12px}.date-warning.blocked{border-color:#fed7aa;background:#fff7ed;color:#9a3412;font-weight:800}.date-warning strong{font-size:12px}.date-warning span{color:#a16207}.date-warning input{height:34px;border:1px solid #f3d58a;border-radius:7px;padding:0 10px;color:#142033;font-weight:700}
      @media(max-width:760px){.monthly-actions{width:100%}.month-nav{flex:1;grid-template-columns:38px 1fr 38px}.refresh{width:auto}.modal-backdrop{padding:10px;align-items:end}.entry-modal,.billing-modal{max-height:90vh;border-radius:10px 10px 0 0}}
    `}</style>
    <style jsx>{`
      .summary-strip small{display:block;margin-top:3px;color:#d7e8f3;font-size:11px;font-weight:700}
      .stacked-total{box-sizing:border-box;height:auto;min-width:94px;padding:6px 9px;display:grid;gap:2px;text-align:right}
      .stacked-total strong,.stacked-total small{white-space:nowrap}
      .stacked-total small{color:#6f8498;font-size:10px;font-weight:750}
      .pending-cell{min-width:102px;display:grid;gap:2px;color:#527066;text-align:right}
      .pending-cell strong,.pending-cell small{white-space:nowrap}
      .pending-cell small{color:#71869a;font-size:10px;font-weight:750}
      .pending-cell.has-pending{color:#9a3412}
      .pending-cell.has-pending small{color:#b45309}
      .mobile-pending{margin-top:11px;padding:9px 10px;border:1px solid #dce8f0;border-radius:7px;background:#f7fafc;display:flex;justify-content:space-between;gap:10px;font-size:11px;color:#527066}
      .mobile-pending span{color:#71869a}
      .mobile-pending.has-pending{border-color:#fed7aa;background:#fff7ed;color:#9a3412}
      @media(max-width:760px){.summary-strip strong{font-size:17px}.summary-strip small{font-size:10px}}
    `}</style>
    <style jsx global>{`
      .detail-drawer .drawer-link{box-sizing:border-box;margin-top:14px;width:100%;min-height:40px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #d8e6f0;border-radius:8px;background:#f4f8fb;color:#023c62;font-size:12px;line-height:1.25;font-weight:800;text-decoration:none}
      .detail-drawer .drawer-link:hover{border-color:#9fc4da;background:#eaf5fb}
      .detail-drawer .drawer-link svg{width:15px;height:15px;flex:0 0 auto}
    `}</style>
  </div>
}
