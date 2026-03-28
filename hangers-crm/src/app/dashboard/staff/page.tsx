'use client'
import { useEffect, useState, useCallback } from 'react'
import { staffAPI } from '@/lib/api'
import toast from 'react-hot-toast'

const ROLES = [
  { value: 'SUPER_ADMIN',      label: 'Super Admin',      color: '#92400e', bg: '#fef3c7', icon: '👑' },
  { value: 'MANAGER',          label: 'Manager',           color: '#065f46', bg: '#d1fae5', icon: '🧑‍💼' },
  { value: 'COUNTER_STAFF',    label: 'Counter Staff',     color: '#1e40af', bg: '#dbeafe', icon: '🖥️' },
  { value: 'ACCOUNTS',         label: 'Accounts',          color: '#5b21b6', bg: '#ede9fe', icon: '💰' },
  { value: 'DELIVERY_MANAGER', label: 'Delivery Manager',  color: '#9a3412', bg: '#ffedd5', icon: '🛵' },
  { value: 'DELIVERY_RIDER',   label: 'Delivery Rider',    color: '#0c4a6e', bg: '#e0f2fe', icon: '🏍️' },
  { value: 'PLANT_MANAGER',    label: 'Plant Manager',     color: '#4a1d96', bg: '#f3e8ff', icon: '🏭' },
  { value: 'PLANT_STAFF',      label: 'Plant Staff',       color: '#1e3a5f', bg: '#e8f0f7', icon: '👷' },
  { value: 'PLANT_QC',         label: 'Plant QC',          color: '#14532d', bg: '#dcfce7', icon: '🔍' },
]
const roleInfo = (role: string) => ROLES.find(r => r.value === role) || { label: role, color: '#6b7fa3', bg: '#f4f7fb', icon: '👤' }
const PIN_ROLES = ['PLANT_STAFF','PLANT_QC','PLANT_MANAGER','DELIVERY_RIDER','DELIVERY_MANAGER']

type Staff = { id:string; name:string; phone:string; email:string|null; role:string; isActive:boolean; lastLoginAt:string|null; createdAt:string; hasPin:boolean }
const BLANK = { name:'', phone:'', email:'', password:'', role:'COUNTER_STAFF' }

export default function StaffPage() {
  const [staff,      setStaff]      = useState<Staff[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editStaff,  setEditStaff]  = useState<Staff|null>(null)
  const [form,       setForm]       = useState(BLANK)
  const [saving,     setSaving]     = useState(false)
  const [search,     setSearch]     = useState('')
  const [pinResult,  setPinResult]  = useState<{name:string;pin:string}|null>(null)
  const [filterRole, setFilterRole] = useState('ALL')

  const load = useCallback(async () => {
    try { const r:any = await staffAPI.list(); setStaff(r.data?.staff||[]) }
    catch(e:any) { toast.error(e.message) }
    finally { setLoading(false) }
  },[])
  useEffect(() => { load() },[load])

  const handleCreate = async () => {
    if (!form.name||!form.phone||!form.password) { toast.error('Name, phone and password required'); return }
    setSaving(true)
    try {
      const r:any = await staffAPI.create(form)
      toast.success('Staff created!')
      setPinResult({ name:form.name, pin:r.data?.tempPin })
      setShowCreate(false); setForm(BLANK); await load()
    } catch(e:any) { toast.error(e.message) } finally { setSaving(false) }
  }

  const handleUpdate = async () => {
    if (!editStaff) return
    setSaving(true)
    try {
      await staffAPI.update(editStaff.id,{ name:form.name||undefined, phone:form.phone||undefined, email:form.email||undefined, role:form.role||undefined })
      toast.success('Staff updated'); setEditStaff(null); await load()
    } catch(e:any) { toast.error(e.message) } finally { setSaving(false) }
  }

  const handleDeactivate = async (s:Staff) => {
    if (!confirm(`Deactivate ${s.name}? They'll be signed out immediately.`)) return
    try { await staffAPI.deactivate(s.id); toast.success(`${s.name} deactivated`); await load() }
    catch(e:any) { toast.error(e.message) }
  }
  const handleReactivate = async (s:Staff) => {
    try { await staffAPI.reactivate(s.id); toast.success(`${s.name} reactivated`); await load() }
    catch(e:any) { toast.error(e.message) }
  }
  const handleResetPin = async (s:Staff) => {
    if (!confirm(`Reset PIN for ${s.name}?`)) return
    try { const r:any = await staffAPI.resetPin(s.id); setPinResult({ name:s.name, pin:r.data?.newPin }); toast.success('PIN reset') }
    catch(e:any) { toast.error(e.message) }
  }
  const openEdit = (s:Staff) => { setEditStaff(s); setForm({ name:s.name, phone:s.phone, email:s.email||'', password:'', role:s.role }) }
  const F = (field:string,val:string) => setForm((p:any)=>({...p,[field]:val}))

  const filtered = staff.filter(s => {
    const q=search.toLowerCase()
    return (!q||s.name.toLowerCase().includes(q)||s.phone.includes(q)||(s.email||'').includes(q)) &&
           (filterRole==='ALL'||s.role===filterRole)
  })
  const active=filtered.filter(s=>s.isActive), inactive=filtered.filter(s=>!s.isActive)

  return (
    <div style={{padding:'28px 32px',fontFamily:"'DM Sans',sans-serif",background:'#f4f7fb',minHeight:'100vh'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:26,color:'#023c62',margin:0}}>Staff Management</h1>
          <p style={{color:'#6b7fa3',fontSize:14,marginTop:4}}>{staff.filter(s=>s.isActive).length} active · {staff.length} total</p>
        </div>
        <button onClick={()=>{setShowCreate(true);setForm(BLANK)}} style={{background:'#023c62',color:'#fff',border:'none',borderRadius:12,padding:'10px 22px',fontSize:14,fontWeight:700,cursor:'pointer'}}>
          + Add Staff
        </button>
      </div>

      {/* PIN Banner */}
      {pinResult && (
        <div style={{background:'#e8f0f7',border:'1.5px solid #b8d0e8',borderRadius:12,padding:'14px 18px',marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <strong style={{color:'#023c62'}}>{pinResult.name}'s PIN: </strong>
            <span style={{fontFamily:'monospace',fontSize:22,fontWeight:800,color:'#023c62',letterSpacing:4,background:'#fff',padding:'2px 12px',borderRadius:8,border:'1.5px solid #b8d0e8'}}>{pinResult.pin}</span>
            <span style={{color:'#6b7fa3',fontSize:13,marginLeft:12}}>Share this — won't be shown again</span>
          </div>
          <button onClick={()=>setPinResult(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#9dafc8'}}>✕</button>
        </div>
      )}

      {/* Filters */}
      <div style={{display:'flex',gap:12,marginBottom:20}}>
        <input style={{flex:1,border:'1.5px solid #dce8f0',borderRadius:12,padding:'10px 16px',fontSize:14,outline:'none',background:'#fff',color:'#1a2332'}}
          placeholder="Search by name, phone, email..." value={search} onChange={e=>setSearch(e.target.value)} />
        <select style={{border:'1.5px solid #dce8f0',borderRadius:12,padding:'10px 14px',fontSize:14,outline:'none',background:'#fff',color:'#1a2332',minWidth:200}}
          value={filterRole} onChange={e=>setFilterRole(e.target.value)}>
          <option value="ALL">All Roles</option>
          {ROLES.map(r=><option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{textAlign:'center',padding:48,color:'#9dafc8'}}>Loading staff…</div>
      ) : filtered.length===0 ? (
        <div style={{padding:48,textAlign:'center',color:'#9dafc8',background:'#fff',borderRadius:18,border:'1px solid #dce8f0'}}>No staff found</div>
      ) : (
        <div style={{background:'#fff',borderRadius:18,border:'1px solid #dce8f0',overflow:'hidden'}}>
          {active.map(s=><StaffRow key={s.id} s={s} onEdit={()=>openEdit(s)} onDeactivate={()=>handleDeactivate(s)} onResetPin={()=>handleResetPin(s)} />)}
          {inactive.length>0 && <>
            <div style={{padding:'8px 20px',background:'#f9fafb',fontSize:11,fontWeight:700,color:'#9dafc8',textTransform:'uppercase',letterSpacing:1,borderTop:'1px solid #f0f4f8'}}>Inactive Staff ({inactive.length})</div>
            {inactive.map(s=><StaffRow key={s.id} s={s} onEdit={()=>openEdit(s)} onReactivate={()=>handleReactivate(s)} onResetPin={()=>handleResetPin(s)} />)}
          </>}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && <StaffModal title="Add New Staff Member" onClose={()=>setShowCreate(false)} onConfirm={handleCreate} saving={saving} confirmLabel="Create Staff">
        <FormFields form={form} F={F} isCreate />
      </StaffModal>}

      {/* Edit Modal */}
      {editStaff && <StaffModal title={`Edit: ${editStaff.name}`} onClose={()=>setEditStaff(null)} onConfirm={handleUpdate} saving={saving} confirmLabel="Save Changes">
        <FormFields form={form} F={F} isCreate={false} />
      </StaffModal>}
    </div>
  )
}

function StaffRow({ s, onEdit, onDeactivate, onReactivate, onResetPin }:{ s:Staff; onEdit:()=>void; onDeactivate?:()=>void; onReactivate?:()=>void; onResetPin:()=>void }) {
  const ri=roleInfo(s.role)
  const needsPin=PIN_ROLES.includes(s.role)
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid #f0f4f8',opacity:s.isActive?1:0.55}}>
      <div style={{display:'flex',alignItems:'center',gap:14,flex:1}}>
        <div style={{width:42,height:42,borderRadius:21,background:ri.bg,color:ri.color,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:16,flexShrink:0}}>
          {s.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{fontWeight:700,fontSize:15,color:'#1a2332',display:'flex',alignItems:'center',gap:8}}>
            {s.name}
            {!s.isActive && <span style={{background:'#fee2e2',color:'#dc2626',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20}}>Inactive</span>}
          </div>
          <div style={{fontSize:12,color:'#9dafc8',marginTop:2}}>{s.phone}{s.email?` · ${s.email}`:''}</div>
          {s.lastLoginAt && <div style={{fontSize:11,color:'#b8c8d8',marginTop:1}}>Last login: {new Date(s.lastLoginAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>}
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
        <span style={{padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700,background:ri.bg,color:ri.color}}>{ri.icon} {ri.label}</span>
        {needsPin && <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:s.hasPin?'#d1fae5':'#fee2e2',color:s.hasPin?'#065f46':'#dc2626'}}>{s.hasPin?'🔐 PIN':'⚠ No PIN'}</span>}
        <div style={{display:'flex',gap:2}}>
          <button title="Edit" onClick={onEdit} style={{background:'none',border:'none',cursor:'pointer',fontSize:15,padding:'4px 6px',borderRadius:8}}>✏️</button>
          {needsPin && <button title="Reset PIN" onClick={onResetPin} style={{background:'none',border:'none',cursor:'pointer',fontSize:15,padding:'4px 6px',borderRadius:8}}>🔑</button>}
          {s.isActive && onDeactivate && <button title="Deactivate" onClick={onDeactivate} style={{background:'none',border:'none',cursor:'pointer',fontSize:15,padding:'4px 6px',borderRadius:8,color:'#dc2626'}}>🚫</button>}
          {!s.isActive && onReactivate && <button title="Reactivate" onClick={onReactivate} style={{background:'none',border:'none',cursor:'pointer',fontSize:15,padding:'4px 6px',borderRadius:8,color:'#16a34a'}}>✅</button>}
        </div>
      </div>
    </div>
  )
}

function FormFields({ form, F, isCreate }:{ form:any; F:(f:string,v:string)=>void; isCreate:boolean }) {
  const inp:React.CSSProperties={border:'1.5px solid #dce8f0',borderRadius:10,padding:'11px 14px',fontSize:14,outline:'none',color:'#1a2332',background:'#f4f7fb',fontFamily:"'DM Sans',sans-serif",marginTop:6,width:'100%',boxSizing:'border-box'}
  const lbl:React.CSSProperties={display:'flex',flexDirection:'column',fontSize:12,fontWeight:700,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:0.5}
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <label style={lbl}>Name * <input style={inp} value={form.name} onChange={e=>F('name',e.target.value)} placeholder="Full name" /></label>
      <label style={lbl}>Phone * <input style={inp} value={form.phone} onChange={e=>F('phone',e.target.value)} placeholder="+91 98765 43210" /></label>
      <label style={lbl}>Email (optional — for CRM login) <input style={inp} type="email" value={form.email} onChange={e=>F('email',e.target.value)} placeholder="name@hangers.in" /></label>
      {isCreate && <label style={lbl}>Password * (for CRM web login) <input style={inp} type="password" value={form.password} onChange={e=>F('password',e.target.value)} placeholder="Min 8 characters" /></label>}
      <label style={lbl}>Role * <select style={{...inp,cursor:'pointer'}} value={form.role} onChange={e=>F('role',e.target.value)}>
        {ROLES.map(r=><option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
      </select></label>
      {PIN_ROLES.includes(form.role) && (
        <div style={{background:'#e8f0f7',borderRadius:10,padding:12,fontSize:13,color:'#023c62',lineHeight:1.6}}>
          🔐 <strong>PIN Login:</strong> A 4-digit PIN will be auto-generated for this role.{isCreate?' You\'ll see it after creation.':' Use Reset PIN to generate a new one.'}
        </div>
      )}
    </div>
  )
}

function StaffModal({ title, onClose, onConfirm, saving, confirmLabel, children }:{ title:string; onClose:()=>void; onConfirm:()=>void; saving:boolean; confirmLabel:string; children:React.ReactNode }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(2,60,98,0.35)',backdropFilter:'blur(3px)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{background:'#fff',borderRadius:20,width:'100%',maxWidth:500,maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 20px 60px rgba(2,60,98,0.2)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 24px',borderBottom:'1px solid #e8f0f7'}}>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,color:'#023c62'}}>{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#9dafc8'}}>✕</button>
        </div>
        <div style={{padding:'20px 24px',overflowY:'auto',flex:1}}>{children}</div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',padding:'16px 24px',borderTop:'1px solid #e8f0f7'}}>
          <button onClick={onClose} style={{border:'1.5px solid #dce8f0',background:'#fff',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer',color:'#6b7fa3'}}>Cancel</button>
          <button onClick={onConfirm} disabled={saving} style={{background:'#023c62',color:'#fff',border:'none',borderRadius:10,padding:'10px 22px',fontSize:14,fontWeight:700,cursor:'pointer',opacity:saving?0.7:1}}>
            {saving?'Saving…':confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
