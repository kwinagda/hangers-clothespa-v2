'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, ChevronRight, FileText, Loader2, MessageCircle, ReceiptIndianRupee, Send, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { ironAPI, metadataAPI, paymentsAPI } from '@/lib/api'

type BulkAction = 'GENERATE' | 'SEND' | 'PAY' | 'REMIND'
type Props = { month:string; rows:any[]; action?:BulkAction|null; onClose:()=>void; onChanged:()=>Promise<void>|void }
type Result = { key:string; name:string; ok:boolean; message:string }

const money=(value:any)=>`₹${Number(value||0).toLocaleString('en-IN',{maximumFractionDigits:2})}`
const asArray=(value:any,keys:string[]=[]):any[]=>{if(Array.isArray(value))return value;for(const key of keys)if(Array.isArray(value?.[key]))return value[key];return []}
const billBalance=(bill:any)=>Math.max(0,Number(bill?.invoice?.balanceDue??(Number(bill?.totalAmount||0)-Number(bill?.paidAmount||0))))
const billPaid=(bill:any)=>String(bill?.status||'').toUpperCase()==='PAID'||billBalance(bill)<=.005
const periodLabel=(month:string)=>new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN',{month:'long',year:'numeric'})
const localMonthKey=(value:any)=>{const date=value?new Date(value):null;return !date||Number.isNaN(date.getTime())?'':`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`}

export default function IronBillingWorkspace({month,rows,action,onClose,onChanged}:Props){
  const single=rows.length===1&&!action
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [billsByCustomer,setBillsByCustomer]=useState<Record<string,any[]>>({})
  const [methods,setMethods]=useState<Array<{value:string;label:string}>>([])
  const [notes,setNotes]=useState({carryForwardNotes:'',notes:''})
  const [payment,setPayment]=useState<Record<string,{amount:string;paymentMethod:string;reference:string;effectiveAt:string}>>({})
  const [results,setResults]=useState<Result[]>([])

  const load=useCallback(async()=>{
    setLoading(true)
    try{
      const [billResponses,metadataResponse]=await Promise.all([
        Promise.all(rows.map(async(row)=>({id:row.customer.id,response:await ironAPI.getBills(row.customer.id)}))),
        metadataAPI.getAll(),
      ])
      const next:Record<string,any[]>={}
      billResponses.forEach(({id,response}:any)=>{next[id]=asArray(response?.data?.bills||response?.data||response?.bills)})
      setBillsByCustomer(next)
      const metadata=metadataResponse?.metadata||metadataResponse?.data?.metadata||{}
      const available=asArray(metadata?.collectablePaymentMethods).length?asArray(metadata.collectablePaymentMethods):asArray(metadata?.paymentMethods).filter((item:any)=>asArray(metadata?.corePaymentMethods).includes(item.value))
      setMethods(available)
    }catch(error:any){toast.error(error.message||'Failed to load billing details')}
    finally{setLoading(false)}
  },[rows])
  useEffect(()=>{load()},[load])

  const monthBills=useCallback((row:any)=>(billsByCustomer[row.customer.id]||[]).filter((bill:any)=>localMonthKey(bill.billingPeriodStart)===month),[billsByCustomer,month])
  const openBills=useCallback((row:any)=>monthBills(row).filter((bill:any)=>!billPaid(bill)),[monthBills])
  const unsentBills=useCallback((row:any)=>openBills(row).filter((bill:any)=>String(bill.status||'').toUpperCase()==='DRAFT'),[openBills])
  const payableBills=useCallback((row:any)=>openBills(row).filter((bill:any)=>billBalance(bill)>.005),[openBills])

  const refresh=async()=>{await load();await onChanged()}
  const generate=async(row:any)=>{
    setBusy(`generate-${row.customer.id}`)
    try{await ironAPI.generateBill({customerId:row.customer.id,billingPeriodStart:`${month}-01`,...notes});toast.success('Bill generated');setNotes({carryForwardNotes:'',notes:''});await refresh()}
    catch(error:any){toast.error(error.message||'Failed to generate bill')}
    finally{setBusy('')}
  }
  const send=async(bill:any)=>{
    setBusy(`send-${bill.id}`)
    try{await ironAPI.sendBill(bill.id);toast.success('Bill queued on WhatsApp');await refresh()}
    catch(error:any){toast.error(error.message||'Failed to send bill')}
    finally{setBusy('')}
  }
  const recordPay=async(bill:any)=>{
    const form=payment[bill.id]||{amount:'',paymentMethod:methods[0]?.value||'',reference:'',effectiveAt:''}
    const amount=Number(form.amount)
    if(!(amount>0)||amount>billBalance(bill)+.005)return toast.error(`Enter an amount up to ${money(billBalance(bill))}`)
    if(!form.paymentMethod)return toast.error('Select a payment method')
    setBusy(`pay-${bill.id}`)
    try{await ironAPI.recordPayment(bill.id,{amount,paymentMethod:form.paymentMethod,reference:form.reference||undefined,effectiveAt:form.effectiveAt||undefined});toast.success('Payment recorded');await refresh()}
    catch(error:any){toast.error(error.message||'Failed to record payment')}
    finally{setBusy('')}
  }
  const writeOff=async(bill:any)=>{
    const reason=window.prompt(`Reason for writing off ${money(billBalance(bill))}`)?.trim()
    if(!reason||reason.length<3)return toast.error('A write-off reason is required')
    setBusy(`writeoff-${bill.id}`)
    try{await ironAPI.recordPayment(bill.id,{writeOffAmount:billBalance(bill),writeOffReason:reason});toast.success('Balance written off');await refresh()}
    catch(error:any){toast.error(error.message||'Failed to write off balance')}
    finally{setBusy('')}
  }
  const reverse=async(bill:any,paymentId:string)=>{
    const reason=window.prompt('Reason for voiding this mistaken payment entry')?.trim()
    if(!reason||reason.length<3)return toast.error('A correction reason is required')
    setBusy(`void-${paymentId}`)
    try{await ironAPI.reversePayment(bill.id,paymentId,{reason});toast.success('Payment entry voided');await refresh()}
    catch(error:any){toast.error(error.message||'Failed to void payment entry')}
    finally{setBusy('')}
  }

  const eligibility=(row:any,kind:BulkAction)=>{
    if(kind==='GENERATE')return row.unbilledPieces>0?{ok:true,label:`${row.unbilledPieces} clothes · ${money(row.unbilledAmount)}`}:{ok:false,label:'No unbilled clothes'}
    if(kind==='SEND')return unsentBills(row).length?{ok:true,label:`${unsentBills(row).length} unsent bill${unsentBills(row).length===1?'':'s'}`}:{ok:false,label:'No generated unsent bill'}
    if(kind==='PAY')return payableBills(row).length?{ok:true,label:`Balance ${money(payableBills(row).reduce((s,b)=>s+billBalance(b),0))}`}:{ok:false,label:'No outstanding bill'}
    return payableBills(row).length?{ok:true,label:`${payableBills(row).length} outstanding bill${payableBills(row).length===1?'':'s'}`}:{ok:false,label:'No outstanding bill'}
  }
  const runBulk=async()=>{
    if(!action||busy)return
    setBusy('bulk');setResults([])
    const next:Result[]=[]
    for(const row of rows){
      const eligible=eligibility(row,action)
      if(!eligible.ok){next.push({key:row.customer.id,name:row.customer.name,ok:false,message:eligible.label});continue}
      try{
        if(action==='GENERATE')await ironAPI.generateBill({customerId:row.customer.id,billingPeriodStart:`${month}-01`})
        if(action==='SEND')for(const bill of unsentBills(row))await ironAPI.sendBill(bill.id)
        if(action==='PAY')for(const bill of payableBills(row)){
          const form=payment[bill.id]||{amount:String(billBalance(bill)),paymentMethod:methods[0]?.value||'',reference:'',effectiveAt:''}
          const amount=Number(form?.amount)
          if(!(amount>0)||!form?.paymentMethod)throw new Error(`Enter amount and payment method for ${bill.billNumber}`)
          if(amount>billBalance(bill)+.005)throw new Error(`Amount exceeds ${bill.billNumber} balance`)
          await ironAPI.recordPayment(bill.id,{amount,paymentMethod:form.paymentMethod,reference:form.reference||undefined,effectiveAt:form.effectiveAt||undefined})
        }
        if(action==='REMIND')await paymentsAPI.sendReceivablesReminder({customerId:row.customer.id,invoiceIds:payableBills(row).map((bill:any)=>bill.invoice?.id).filter(Boolean)})
        next.push({key:row.customer.id,name:row.customer.name,ok:true,message:action==='GENERATE'?'Bill generated':action==='SEND'?'Bill queued':action==='PAY'?'Payment recorded':'Reminder sent'})
      }catch(error:any){next.push({key:row.customer.id,name:row.customer.name,ok:false,message:error.message||'Action failed'})}
      setResults([...next])
    }
    setBusy('');await refresh()
  }

  const actionTitle:Record<BulkAction,string>={GENERATE:'Generate bills',SEND:'Send bills',PAY:'Record payments',REMIND:'Send payment reminders'}
  const body=<div className="bw-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><aside className={`bw-panel ${single?'':'bulk'}`}>
    <header><div><small>{single?'Monthly billing workspace':'Bulk billing review'}</small><h2>{single?rows[0].customer.name:action?`${actionTitle[action]} (${rows.length})`:'Billing'}</h2><p>{periodLabel(month)}{single?` · ${rows[0].customer.phone||''}`:''}</p></div><button aria-label="Close" onClick={onClose}><X/></button></header>
    {loading?<div className="bw-loading"><Loader2 className="crm-spin"/> Loading current billing data…</div>:single?SingleView({row:rows[0]}):BulkView()}
  </aside>
  <style jsx global>{`
    .bw-backdrop{position:fixed;inset:0;z-index:130;background:rgba(2,20,34,.46)}.bw-panel{position:absolute;right:0;top:0;width:min(600px,100%);height:100%;background:#f5f8fb;box-shadow:-24px 0 70px rgba(2,30,50,.24);display:flex;flex-direction:column;font-size:12px}.bw-panel.bulk{width:min(800px,100%)}.bw-panel header{padding:16px 18px;background:#fff;border-bottom:1px solid #dfeaf2;display:flex;justify-content:space-between;gap:14px}.bw-panel header small{font-size:9px;color:#7890a3;text-transform:uppercase;font-weight:850;letter-spacing:.08em}.bw-panel h2{margin:3px 0 2px;color:#023c62;font-size:19px;line-height:1.2}.bw-panel header p{margin:0;color:#72879b;font-size:11px}.bw-panel header button{width:30px;height:30px;padding:0;border:0;background:none;align-self:flex-start;display:grid;place-items:center}.bw-panel header button svg{width:18px;height:18px}.bw-loading{flex:1;display:grid;place-items:center;color:#72879b}.body{padding:12px;overflow:auto;display:grid;gap:10px}.summary{display:grid;grid-template-columns:repeat(3,1fr);background:#023c62;color:#fff;border-radius:8px;overflow:hidden}.summary div{padding:11px 12px;border-right:1px solid rgba(255,255,255,.14)}.summary span,.metric span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.05em;opacity:.72}.summary strong{display:block;margin-top:3px;font-size:16px;line-height:1.2}.card{background:#fff;border:1px solid #dfe9f1;border-radius:8px;padding:12px}.generate-card{border-color:#b7d8ec;background:#fbfdff}.card-title{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.card-title h3{margin:0;color:#023c62;font-size:13px;line-height:1.25}.card-title small{font-size:11px}.flow-note{margin:-3px 0 10px;color:#6f8498;font-size:11px;line-height:1.4}.badge{padding:4px 7px;border-radius:999px;background:#eef4f8;color:#536a7f;font-size:9px;font-weight:850}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.metric{padding:8px;background:#f7fafc;border-radius:7px}.metric strong{display:block;margin-top:2px;color:#023c62;font-size:15px;line-height:1.2}.fields{display:grid;gap:7px}.fields.two{grid-template-columns:1fr 1fr}.fields input,.fields select,.fields textarea,.payment-row input,.payment-row select{box-sizing:border-box;width:100%;border:1px solid #d7e4ed;border-radius:7px;padding:7px 9px;background:#fff;color:#142033;font-size:12px;line-height:1.3}.fields input,.fields select,.payment-row input,.payment-row select{height:36px}.fields textarea{resize:vertical;min-height:52px}.primary,.secondary,.danger{min-height:34px;border:0;border-radius:7px;padding:7px 10px;font-size:11px;line-height:1.2;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}.primary{background:#023c62;color:#fff}.secondary{background:#eef7fc;color:#075985}.danger{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.primary:disabled,.secondary:disabled,.danger:disabled{opacity:.45;cursor:not-allowed}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.payment-row{display:grid;grid-template-columns:1fr 110px 1fr;gap:6px;margin-top:8px}.history{display:grid;gap:6px;margin-top:8px}.history>div{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 9px;background:#f8fafc;border-radius:7px;font-size:10px}.empty{padding:18px;text-align:center;color:#7890a3;font-size:12px}.bulk-list{display:grid;gap:7px}.bulk-row{background:#fff;border:1px solid #dfe9f1;border-radius:8px;padding:10px}.bulk-main{display:flex;justify-content:space-between;gap:12px}.bulk-main strong,.bulk-main b{font-size:12px}.bulk-main span{display:grid}.bulk-main small{margin-top:2px;color:#72879b;font-size:10px}.ready{color:#166534}.blocked{color:#9a3412}.bulk-pay{display:grid;grid-template-columns:1fr 100px 120px 1fr;gap:6px;margin-top:8px}.bulk-pay input,.bulk-pay select{box-sizing:border-box;min-width:0;height:34px;border:1px solid #d7e4ed;border-radius:7px;padding:6px 8px;font-size:11px}.bulk-footer{position:sticky;bottom:0;background:#fff;border-top:1px solid #dfe9f1;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11px}.result{margin-top:7px;padding-top:7px;border-top:1px solid #edf2f6;font-size:10px;display:flex;align-items:center;gap:5px}.result.ok{color:#166534}.result.fail{color:#b42318}@media(max-width:680px){.fields.two,.payment-row,.bulk-pay{grid-template-columns:1fr}.summary{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:1fr 1fr}.bw-panel{top:auto;bottom:0;height:94%;border-radius:10px 10px 0 0}}
  `}</style></div>

  function SingleView({row}:{row:any}){
    const bills=monthBills(row)
    return <div className="body"><section className="summary"><div><span>Clothes</span><strong>{row.totalPieces}</strong></div><div><span>Month value</span><strong>{money(row.totalAmount)}</strong></div><div><span>Unbilled</span><strong>{money(row.unbilledAmount)}</strong></div></section>
      {row.unbilledPieces>0&&<section className="card generate-card"><div className="card-title"><h3>{bills.length?'Generate bill for unbilled clothes':'Generate monthly bill'}</h3><span className="badge">{row.unbilledPieces} unbilled</span></div><p className="flow-note">Generate creates a draft bill. Send it from the bill card below after reviewing.</p><div className="fields"><input value={notes.carryForwardNotes} onChange={e=>setNotes(n=>({...n,carryForwardNotes:e.target.value}))} placeholder="Carry-forward note (optional)"/><textarea value={notes.notes} onChange={e=>setNotes(n=>({...n,notes:e.target.value}))} placeholder="Internal note (optional)"/></div><div className="actions"><button className="primary" disabled={!!busy} onClick={()=>generate(row)}>{busy===`generate-${row.customer.id}`?'Generating…':bills.length?'Generate bill for unbilled clothes':'Generate bill'}</button></div></section>}
      {!bills.length&&row.unbilledPieces===0?<div className="empty">No billing activity for this month.</div>:bills.map((bill:any)=><div key={bill.id}>{BillCard({bill})}</div>)}</div>
  }
  function BillCard({bill}:{bill:any}){
    const balance=billBalance(bill),paid=billPaid(bill),allocations=(bill.invoice?.allocations||[]).filter((a:any)=>a.payment)
    const form=payment[bill.id]||{amount:'',paymentMethod:methods[0]?.value||'',reference:'',effectiveAt:''}
    const setForm=(key:string,value:string)=>setPayment(p=>({...p,[bill.id]:{...form,[key]:value}}))
    return <section className="card"><div className="card-title"><div><h3>{bill.billNumber}</h3><small>{bill.invoice?.invoiceNumber||'Invoice linked on generation'}</small></div><span className="badge">{paid?'Paid':String(bill.status||'Draft')}</span></div><div className="metrics"><div className="metric"><span>Pieces</span><strong>{bill.totalPieces}</strong></div><div className="metric"><span>Total</span><strong>{money(bill.totalAmount)}</strong></div><div className="metric"><span>Paid</span><strong>{money(bill.invoice?.paidAmount??bill.paidAmount)}</strong></div><div className="metric"><span>Balance</span><strong>{money(balance)}</strong></div></div>
      <div className="actions">{!paid&&<button className="primary" disabled={!!busy} onClick={()=>send(bill)}><Send size={13}/> {busy===`send-${bill.id}`?'Sending…':String(bill.status).toUpperCase()==='DRAFT'?'Send bill':'Send again'}</button>}</div>
      {!paid&&<><div className="payment-row"><input inputMode="decimal" value={form.amount} onChange={e=>setForm('amount',e.target.value.replace(/[^0-9.]/g,''))} placeholder={`Amount up to ${money(balance)}`}/><select value={form.paymentMethod} onChange={e=>setForm('paymentMethod',e.target.value)}><option value="">Method</option>{methods.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select><input value={form.reference} onChange={e=>setForm('reference',e.target.value)} placeholder="Reference (optional)"/></div><div className="fields two" style={{marginTop:7}}><input type="date" value={form.effectiveAt} onChange={e=>setForm('effectiveAt',e.target.value)}/><div className="actions" style={{marginTop:0}}><button className="primary" disabled={!!busy} onClick={()=>recordPay(bill)}><ReceiptIndianRupee size={13}/> Record payment</button><button className="danger" disabled={!!busy} onClick={()=>writeOff(bill)}>Write off</button></div></div></>}
      {!!allocations.length&&<div className="history">{allocations.map((allocation:any)=>{const entry=allocation.payment;const voided=['VOIDED','REVERSED'].includes(String(entry.status).toUpperCase())||String(allocation.status).toUpperCase()==='REVERSED';return <div key={entry.id}><span>{money(entry.amount)} · {entry.method} · {entry.status}</span>{!voided&&<button className="danger" disabled={!!busy} onClick={()=>reverse(bill,entry.id)}>Void entry</button>}</div>})}</div>}</section>
  }
  function BulkView(){
    if(!action)return null
    const eligibleCount=rows.filter(row=>eligibility(row,action).ok).length
    return <>
      <div className="body"><div className="bulk-list">{rows.map(row=>{
        const state=eligibility(row,action)
        const result=results.find(item=>item.key===row.customer.id)
        return <section className="bulk-row" key={row.customer.id}>
          <div className="bulk-main"><span><strong>{row.customer.name}</strong><small>{row.customer.phone}</small></span><b className={state.ok?'ready':'blocked'}>{state.label}</b></div>
          {action==='PAY'&&payableBills(row).map((bill:any)=>{
            const form=payment[bill.id]||{amount:String(billBalance(bill)),paymentMethod:methods[0]?.value||'',reference:'',effectiveAt:''}
            const update=(key:string,value:string)=>setPayment(p=>({...p,[bill.id]:{...form,[key]:value}}))
            return <div className="bulk-pay" key={bill.id}>
              <strong>{bill.billNumber}</strong>
              <input inputMode="decimal" value={form.amount} onChange={e=>update('amount',e.target.value.replace(/[^0-9.]/g,''))}/>
              <select value={form.paymentMethod} onChange={e=>update('paymentMethod',e.target.value)}><option value="">Method</option>{methods.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select>
              <input value={form.reference} onChange={e=>update('reference',e.target.value)} placeholder="Reference"/>
            </div>
          })}
          {result&&<div className={`result ${result.ok?'ok':'fail'}`}>{result.ok?<Check size={13}/>:<AlertCircle size={13}/>} {result.message}</div>}
        </section>
      })}</div></div>
      <footer className="bulk-footer"><span>{eligibleCount} of {rows.length} ready</span><button className="primary" disabled={!eligibleCount||!!busy} onClick={runBulk}>
        {busy==='bulk'?<><Loader2 className="crm-spin" size={14}/> Processing…</>:<>{action==='GENERATE'?<FileText size={14}/>:action==='SEND'?<Send size={14}/>:action==='REMIND'?<MessageCircle size={14}/>:<ReceiptIndianRupee size={14}/>} Confirm {actionTitle[action].toLowerCase()} <ChevronRight size={14}/></>}
      </button></footer>
    </>
  }
  return typeof document==='undefined'?null:createPortal(body,document.body)
}
