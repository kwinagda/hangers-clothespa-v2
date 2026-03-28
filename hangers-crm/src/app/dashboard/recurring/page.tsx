'use client'
import { useEffect, useState } from 'react'
import { recurringAPI, customersAPI } from '@/lib/api'
const FREQ = ['WEEKLY','BIWEEKLY','MONTHLY']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
export default function RecurringPage() {
  const [pickups,setPickups] = useState<any[]>([])
  const [customers,setCustomers] = useState<any[]>([])
  const [showAdd,setShowAdd] = useState(false)
  const [form,setForm] = useState({customerId:'',frequency:'WEEKLY',dayOfWeek:1,address:'',notes:''})
  const [loading,setLoading] = useState(false)
  useEffect(()=>{
    recurringAPI.getAll().then((r:any)=>setPickups(r.data||[]))
    customersAPI.list({limit:200}).then((r:any)=>setCustomers(r.data?.customers||[]))
  },[])
  const create = async () => {
    if(!form.customerId||!form.address) return
    setLoading(true)
    const r = await recurringAPI.create(form)
    setPickups([r.data,...pickups]); setShowAdd(false); setLoading(false)
  }
  const s = {fontFamily:"'DM Sans',sans-serif"}
  const inp = (label:string,value:any,onChange:any,type='text',placeholder='') => <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>{label}</label><input type={type} value={value} onChange={onChange} placeholder={placeholder} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,boxSizing:'border-box' as const}}/></div>
  return (
    <div style={{padding:'32px 36px',maxWidth:1000,margin:'0 auto',...s}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:'#023c62',margin:0}}>Recurring Pickups</h1>
        <button onClick={()=>setShowAdd(true)} style={{padding:'10px 20px',background:'#023c62',color:'#fff',borderRadius:10,fontSize:13,fontWeight:700,border:'none',cursor:'pointer'}}>+ Schedule Recurring</button>
      </div>
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',overflow:'hidden'}}>
        {pickups.length===0?<div style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No recurring pickups scheduled</div>:
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:'#f8fafc'}}>{['Customer','Frequency','Day','Address','Next Pickup','Status',''].map(h=><th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,color:'#9dafc8',textTransform:'uppercase' as const,letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>{h}</th>)}</tr></thead>
          <tbody>{pickups.map((p:any)=><tr key={p.id} style={{borderBottom:'1px solid #f8fafc'}}>
            <td style={{padding:'10px 16px',fontWeight:600}}>{customers.find((c:any)=>c.id===p.customerId)?.name||p.customerId}</td>
            <td style={{padding:'10px 16px'}}><span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:'#dbeafe',color:'#1e40af'}}>{p.frequency}</span></td>
            <td style={{padding:'10px 16px'}}>{p.dayOfWeek!==null?DAYS[p.dayOfWeek]:'—'}</td>
            <td style={{padding:'10px 16px',color:'#6b7fa3',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{p.address}</td>
            <td style={{padding:'10px 16px',color:'#6b7fa3'}}>{p.nextPickup?new Date(p.nextPickup).toLocaleDateString('en-IN'):'—'}</td>
            <td style={{padding:'10px 16px'}}><span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:p.isActive?'#dcfce7':'#f3f4f6',color:p.isActive?'#166534':'#6b7280'}}>{p.isActive?'Active':'Paused'}</span></td>
            <td style={{padding:'10px 16px'}}><button onClick={()=>recurringAPI.toggle(p.id).then(()=>setPickups(pickups.map(x=>x.id===p.id?{...x,isActive:!x.isActive}:x)))} style={{fontSize:12,color:'#023c62',background:'none',border:'none',cursor:'pointer'}}>{p.isActive?'Pause':'Resume'}</button></td>
          </tr>)}</tbody>
        </table>}
      </div>
      {showAdd&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
        <div style={{background:'#fff',borderRadius:16,padding:24,width:'100%',maxWidth:400,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:18,marginBottom:20}}>Schedule Recurring Pickup</h2>
          <div style={{display:'flex',flexDirection:'column' as const,gap:14}}>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Customer *</label>
              <select value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                <option value="">Select customer</option>
                {customers.map((c:any)=><option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
              </select></div>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Frequency</label>
              <select value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                {FREQ.map(f=><option key={f} value={f}>{f}</option>)}
              </select></div>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Day of Week</label>
              <select value={form.dayOfWeek} onChange={e=>setForm({...form,dayOfWeek:parseInt(e.target.value)})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13}}>
                {DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}
              </select></div>
            <div><label style={{fontSize:12,color:'#6b7fa3',display:'block',marginBottom:6}}>Pickup Address *</label>
              <textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})} style={{width:'100%',border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,height:80,resize:'none',boxSizing:'border-box' as const}} placeholder="Full address"/></div>
            {inp('Notes',form.notes,e=>setForm({...form,notes:e.target.value}),'text','Optional')}
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
