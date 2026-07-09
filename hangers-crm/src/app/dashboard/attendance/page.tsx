'use client'
import { useEffect, useState } from 'react'
import { attendanceAPI, staffListAPI } from '@/lib/api'
import { PageHeader } from '@/components/ui'
import { PaginationControls } from '@/components/ui/PaginationControls'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}
export default function AttendancePage() {
  const [records,setRecords] = useState<any[]>([])
  const [staff,setStaff] = useState<any[]>([])
  const [selectedStaff,setSelectedStaff] = useState('')
  const [month,setMonth] = useState(new Date().getMonth()+1)
  const [year,setYear] = useState(new Date().getFullYear())
  const [msg,setMsg] = useState('')
  const [loading,setLoading] = useState(false)
  const [page,setPage] = useState(1)
  const [pageSize,setPageSize] = useState(20)
  useEffect(()=>{ staffListAPI.getAll().then((r:any)=>setStaff(asArray(r.data, ['staff', 'items']))).catch(()=>setStaff([])) },[])
  const load = () => {
    const params:any = {month,year}
    if(selectedStaff) params.staffId = selectedStaff
    attendanceAPI.get(params).then((r:any)=>setRecords(asArray(r.data, ['records', 'attendance', 'items']))).catch(()=>setRecords([]))
  }
  useEffect(()=>{ load() },[month,year,selectedStaff])
  useEffect(()=>{ setPage(1) },[month,year,selectedStaff,pageSize])
  const clock = async (type:'in'|'out') => {
    if(!selectedStaff){setMsg('Select a staff member first');return}
    setLoading(true)
    const r = type==='in' ? await attendanceAPI.clockIn(selectedStaff) : await attendanceAPI.clockOut(selectedStaff)
    setMsg(r.data?.success!==false ? `Clock ${type} recorded!` : r.data?.message||'Error')
    load(); setLoading(false); setTimeout(()=>setMsg(''),3000)
  }
  const totalHours = records.reduce((s:number,r:any)=>s+(r.hoursWorked||0),0)
  const pagedRecords = records.slice((page - 1) * pageSize, page * pageSize)
  const s = {fontFamily:"var(--crm-font-ui)"}
  return (
    <div style={{padding:'32px 36px',maxWidth:1000,margin:'0 auto',...s}}>
      <PageHeader title="Staff Attendance" subtitle="Clock in/out and monthly attendance records" />
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',padding:20,marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:13,color:'#6b7fa3',marginBottom:12,textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>Quick Clock In/Out</div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap' as const,alignItems:'center'}}>
          <select value={selectedStaff} onChange={e=>setSelectedStaff(e.target.value)} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'8px 12px',fontSize:13,flex:1,minWidth:200}}>
            <option value="">Select Staff Member</option>
            {staff.map((s:any)=><option key={s.id} value={s.id}>{s.name} — {s.role}</option>)}
          </select>
          <button onClick={()=>clock('in')} disabled={loading} style={{padding:'10px 20px',background:'#166534',color:'#fff',borderRadius:10,fontSize:13,fontWeight:700,border:'none',cursor:'pointer',opacity:loading?0.5:1}}>Clock In</button>
          <button onClick={()=>clock('out')} disabled={loading} style={{padding:'10px 20px',background:'#991b1b',color:'#fff',borderRadius:10,fontSize:13,fontWeight:700,border:'none',cursor:'pointer',opacity:loading?0.5:1}}>Clock Out</button>
        </div>
        {msg&&<p style={{marginTop:8,fontSize:13,color:'#023c62'}}>{msg}</p>}
      </div>
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap' as const}}>
        <select value={month} onChange={e=>setMonth(parseInt(e.target.value))} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'6px 12px',fontSize:13}}>{MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
        <select value={year} onChange={e=>setYear(parseInt(e.target.value))} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'6px 12px',fontSize:13}}>{[2025,2026].map(y=><option key={y} value={y}>{y}</option>)}</select>
        <select value={selectedStaff} onChange={e=>setSelectedStaff(e.target.value)} style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'6px 12px',fontSize:13,flex:1,minWidth:160}}>
          <option value="">All Staff</option>
          {staff.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
        <div style={{background:'#eff6ff',borderRadius:12,padding:16}}><div style={{fontSize:11,color:'#1d4ed8',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>Days Present</div><div style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:24,color:'#1d4ed8'}}>{records.length}</div></div>
        <div style={{background:'#f5f3ff',borderRadius:12,padding:16}}><div style={{fontSize:11,color:'#6d28d9',marginBottom:4,textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>Total Hours</div><div style={{fontFamily:"var(--crm-font-ui)",fontWeight:800,fontSize:24,color:'#6d28d9'}}>{totalHours.toFixed(1)}h</div></div>
      </div>
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8f0f7',overflow:'hidden'}}>
        {records.length===0?<div style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No records found</div>:
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style={{background:'#f8fafc'}}>{['Date','Staff','Clock In','Clock Out','Hours'].map(h=><th key={h} style={{padding:'10px 16px',textAlign:h==='Hours'?'right':'left',fontSize:11,color:'#9dafc8',textTransform:'uppercase' as const,letterSpacing:'0.06em',borderBottom:'1px solid #e8f0f7'}}>{h}</th>)}</tr></thead>
          <tbody>{pagedRecords.map((r:any)=><tr key={r.id} style={{borderBottom:'1px solid #f8fafc'}}>
            <td style={{padding:'10px 16px'}}>{new Date(r.date).toLocaleDateString('en-IN')}</td>
            <td style={{padding:'10px 16px'}}>{staff.find((s:any)=>s.id===r.staffId)?.name||r.staffId}</td>
            <td style={{padding:'10px 16px',color:'#166534'}}>{r.clockIn?new Date(r.clockIn).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—'}</td>
            <td style={{padding:'10px 16px',color:'#991b1b'}}>{r.clockOut?new Date(r.clockOut).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—'}</td>
            <td style={{padding:'10px 16px',textAlign:'right',fontWeight:600}}>{r.hoursWorked?`${r.hoursWorked}h`:'—'}</td>
          </tr>)}</tbody>
        </table>}
      </div>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalItems={records.length}
        itemLabel="attendance records"
        onPageChange={setPage}
        onPageSizeChange={(size)=>{setPageSize(size); setPage(1)}}
        pageSizeOptions={[10,20,30,50,100]}
      />
    </div>
  )
}
