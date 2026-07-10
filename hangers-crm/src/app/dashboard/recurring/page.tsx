'use client'
import { ChangeEvent, useEffect, useState } from 'react'
import { recurringAPI, customersAPI, metadataAPI } from '@/lib/api'
import { Plus } from 'lucide-react'
import { PageHeader, Button } from '@/components/ui'
import { PaginationControls } from '@/components/ui/PaginationControls'
import toast from 'react-hot-toast'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}
export default function RecurringPage() {
  const [pickups,setPickups] = useState<any[]>([])
  const [customers,setCustomers] = useState<any[]>([])
  const [frequencyOptions,setFrequencyOptions] = useState<Array<{ value: string; label: string }>>([])
  const [weekdayOptions,setWeekdayOptions] = useState<Array<{ value: number; label: string }>>([])
  const [showAdd,setShowAdd] = useState(false)
  const [form,setForm] = useState({customerId:'',frequency:'WEEKLY',dayOfWeek:1,dayOfMonth:'',address:'',notes:''})
  const [loading,setLoading] = useState(false)
  const [loadError,setLoadError] = useState('')
  const [page,setPage] = useState(1)
  const [pageSize,setPageSize] = useState(20)
  useEffect(()=>{
    recurringAPI.getAll().then((r:any)=>{ setPickups(asArray(r.data, ['pickups', 'recurringPickups', 'items'])); setLoadError('') }).catch((e:any)=>{ setPickups([]); setLoadError(e.message || 'Failed to load recurring pickups.'); toast.error(e.message || 'Failed to load recurring pickups') })
    customersAPI.list({limit:200}).then((r:any)=>setCustomers(asArray(r.data, ['customers', 'items']))).catch((e:any)=>{ setCustomers([]); toast.error(e.message || 'Failed to load customers') })
    metadataAPI.getAll().then((r:any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      const nextFrequencies = metadata.recurringFrequencies || []
      const nextWeekdays = metadata.weekdays || []
      setFrequencyOptions(nextFrequencies)
      setWeekdayOptions(nextWeekdays)
      if (nextFrequencies[0]?.value) {
        setForm((prev) => ({
          ...prev,
          frequency: nextFrequencies.some((item:any) => item.value === prev.frequency) ? prev.frequency : nextFrequencies[0].value,
        }))
      }
      if (nextWeekdays.length) {
        setForm((prev) => ({
          ...prev,
          dayOfWeek: nextWeekdays.some((item:any) => item.value === prev.dayOfWeek) ? prev.dayOfWeek : nextWeekdays[0].value,
        }))
      }
    }).catch((e:any) => {
      setFrequencyOptions([])
      setWeekdayOptions([])
      toast.error(e.message || 'Failed to load metadata')
    })
  },[])
  useEffect(()=>{ setPage(1) },[pageSize, pickups.length])
  const create = async () => {
    if(!form.customerId||!form.address.trim()) {
      toast.error('Customer and pickup address are required')
      return
    }
    if (form.frequency === 'MONTHLY' && (!form.dayOfMonth || Number(form.dayOfMonth) < 1 || Number(form.dayOfMonth) > 31)) {
      toast.error('Choose a valid day of month')
      return
    }
    setLoading(true)
    try {
      const payload = {
        customerId: form.customerId,
        frequency: form.frequency,
        dayOfWeek: form.frequency === 'WEEKLY' ? form.dayOfWeek : null,
        dayOfMonth: form.frequency === 'MONTHLY' ? Number(form.dayOfMonth) : null,
        address: form.address.trim(),
        notes: form.notes.trim(),
      }
      const r = await recurringAPI.create(payload)
      setPickups([r.data,...pickups]); setShowAdd(false)
      setForm({customerId:'',frequency:frequencyOptions[0]?.value || 'WEEKLY',dayOfWeek:weekdayOptions[0]?.value || 1,dayOfMonth:'',address:'',notes:''})
      toast.success('Recurring pickup scheduled')
    } catch (e:any) {
      toast.error(e.message || 'Failed to schedule recurring pickup')
    } finally {
      setLoading(false)
    }
  }
  const s = {fontFamily:"var(--crm-font-ui)"}
  const pagedPickups = pickups.slice((page - 1) * pageSize, page * pageSize)
  const onInput = (setter: (value: string) => void) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setter(e.target.value)
  const onSelect = (setter: (value: string) => void) => (e: ChangeEvent<HTMLSelectElement>) => setter(e.target.value)
  const inp = (label:string,value:any,onChange:any,type='text',placeholder='') => <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>{label}</label><input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/></div>
  const pickupScheduleLabel = (pickup: any) => {
    if (pickup.frequency === 'DAILY') return 'Every day'
    if (pickup.frequency === 'WEEKLY') return weekdayOptions.find((item) => item.value === pickup.dayOfWeek)?.label || 'Weekly'
    if (pickup.frequency === 'MONTHLY') return pickup.dayOfMonth ? `Day ${pickup.dayOfMonth} of month` : 'Monthly'
    return pickup.frequency
  }
  return (
    <div style={{padding:'30px 36px 60px',maxWidth:1360,margin:'0 auto',...s}}>
      <PageHeader
        title="Recurring Pickups"
        subtitle={`${pickups.length} schedules · ${pickups.filter((p:any)=>p.isActive).length} active · ${pickups.filter((p:any)=>!p.isActive).length} paused`}
        actions={<Button variant="primary" icon={<Plus size={14}/>} onClick={()=>setShowAdd(true)}>Schedule Recurring</Button>}
      />
      <div style={{background:'#fff',borderRadius:14,border:'1px solid #e3edf6',overflow:'hidden'}}>
        {loadError?<div style={{padding:40,textAlign:'center',color:'#b91c1c'}}>{loadError}</div>:pickups.length===0?<div style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No recurring pickups scheduled</div>:
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:'#f8fafc'}}>{['Customer','Frequency','Schedule','Address','Next Pickup','Status',''].map(h=><th key={h} style={{padding:'11px 18px',textAlign:'left',fontSize:10.5,fontWeight:700,color:'#6b7fa3',textTransform:'uppercase' as const,letterSpacing:'0.07em',borderBottom:'1px solid #e8f0f7',background:'#f7f9fc'}}>{h}</th>)}</tr></thead>
          <tbody>{pagedPickups.map((p:any)=><tr key={p.id} style={{borderBottom:'1px solid #eef4f8'}}>
            <td style={{padding:'13px 18px',fontWeight:600,fontSize:13.5}}>{customers.find((c:any)=>c.id===p.customerId)?.name||p.customerId}</td>
            <td style={{padding:'13px 18px',fontSize:13.5}}><span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:'#dbeafe',color:'#1e40af'}}>{p.frequency}</span></td>
            <td style={{padding:'13px 18px',fontSize:13.5}}>{pickupScheduleLabel(p)}</td>
            <td style={{padding:'13px 18px',fontSize:13.5,color:'#6b7fa3',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{p.address}</td>
            <td style={{padding:'13px 18px',fontSize:13.5,color:'#6b7fa3'}}>{p.nextPickup?new Date(p.nextPickup).toLocaleDateString('en-IN'):'—'}</td>
            <td style={{padding:'13px 18px',fontSize:13.5}}><span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:p.isActive?'#dcfce7':'#f3f4f6',color:p.isActive?'#166534':'#6b7280'}}>{p.isActive?'Active':'Paused'}</span></td>
            <td style={{padding:'13px 18px',fontSize:13.5}}><button onClick={async()=>{try{await recurringAPI.toggle(p.id);setPickups(pickups.map(x=>x.id===p.id?{...x,isActive:!x.isActive}:x));toast.success(p.isActive?'Recurring pickup paused':'Recurring pickup resumed')}catch(e:any){toast.error(e.message || 'Failed to update recurring pickup')}}} style={{fontSize:12,color:'#023c62',background:'none',border:'none',cursor:'pointer'}}>{p.isActive?'Pause':'Resume'}</button></td>
          </tr>)}</tbody>
        </table>}
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalItems={pickups.length}
        itemLabel="recurring pickups"
        onPageChange={setPage}
        onPageSizeChange={(size)=>{setPageSize(size); setPage(1)}}
        pageSizeOptions={[10,20,30,50,100]}
      />
      {showAdd&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
        <div style={{background:'#fff',borderRadius:16,padding:24,width:'100%',maxWidth:400,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
          <h2 style={{fontFamily:"var(--crm-font-display)",fontWeight:700,fontSize:18,marginBottom:20}}>Schedule Recurring Pickup</h2>
          <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Customer *</label>
              <select value={form.customerId} onChange={onSelect((value) => setForm({...form,customerId:value}))} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                <option value="">Select customer</option>
                {customers.map((c:any)=><option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
              </select></div>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Frequency</label>
              <select value={form.frequency} onChange={onSelect((value) => setForm({...form,frequency:value}))} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                {frequencyOptions.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}
              </select></div>
            {form.frequency === 'WEEKLY' && <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Day of Week</label>
              <select value={form.dayOfWeek} onChange={(e: ChangeEvent<HTMLSelectElement>)=>setForm({...form,dayOfWeek:parseInt(e.target.value)})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                {weekdayOptions.map((d)=><option key={d.value} value={d.value}>{d.label}</option>)}
              </select></div>}
            {form.frequency === 'MONTHLY' && inp('Day of Month *',form.dayOfMonth,onInput((value) => setForm({...form,dayOfMonth:value})),'number','1 - 31')}
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Pickup Address *</label>
              <textarea value={form.address} onChange={onInput((value) => setForm({...form,address:value}))} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,height:80,resize:'none',boxSizing:'border-box' as const}} placeholder="Full address"/></div>
            {inp('Notes',form.notes,onInput((value) => setForm({...form,notes:value})),'text','Optional')}
          </div>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
            <button onClick={()=>setShowAdd(false)} style={{padding:'8px 16px',fontSize:13,color:'#6b7fa3',background:'none',border:'none',cursor:'pointer'}}>Cancel</button>
            <button onClick={create} disabled={loading} style={{padding:'8px 16px',background:'#023c62',color:'#fff',borderRadius:8,fontSize:13,border:'none',cursor:'pointer',opacity:loading?0.5:1}}>{loading?'Saving...':'Schedule'}</button>
          </div>
        </div>
      </div>}
    </div>
  )
}
