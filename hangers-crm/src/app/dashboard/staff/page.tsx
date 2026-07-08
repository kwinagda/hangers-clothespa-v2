'use client'
import { useEffect, useState, useCallback } from 'react'
import { staffAPI, metadataAPI, securityAPI, authAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { PaginationControls } from '@/components/ui/PaginationControls'
import {
  Ban,
  BriefcaseBusiness,
  Crown,
  Eye,
  Factory,
  KeyRound,
  Laptop2,
  PackageSearch,
  PenSquare,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  Truck,
  User,
  UserCog,
  UserRoundPlus,
  X,
} from 'lucide-react'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

const ROLE_ICON: Record<string, any> = {
  SUPER_ADMIN: Crown,
  MANAGER: UserCog,
  COUNTER_STAFF: Laptop2,
  ACCOUNTS: BriefcaseBusiness,
  DELIVERY_MANAGER: Truck,
  DELIVERY_RIDER: Truck,
  PLANT_MANAGER: Factory,
  PLANT_STAFF: User,
  PLANT_QC: PackageSearch,
}
const roleInfo = (roles: any[], role: string) => {
  const meta = roles.find(r => r.value === role) || { value: role, label: role, pinEligible: false, color: '#6b7fa3', bg: '#f4f7fb' }
  const Icon = ROLE_ICON[role] || User
  return { ...meta, icon: Icon }
}

type Staff = { id:string; name:string; phone:string; email:string|null; role:string; isActive:boolean; lastLoginAt:string|null; createdAt:string; hasPin:boolean }
type PermissionItem = { code: string; category?: string | null; description?: string | null; roleBindings?: Array<{ role: string }> }
const BLANK = { name:'', phone:'', email:'', password:'', role:'COUNTER_STAFF' }
const SERVICE_LABELS: Record<string, string> = {
  CRM: 'CRM',
  CUSTOMER_APP: 'Customer App',
  STAFF_APP: 'Staff App',
  DELIVERY: 'Delivery',
  PLANT: 'Plant',
  FINANCE: 'Finance',
  MARKETING: 'Marketing',
  REPORTS: 'Reports',
}
const SERVICE_PERMISSION_PREFIXES: Record<string, string[]> = {
  CRM: ['dashboard.', 'orders.', 'customers.', 'pricing.', 'staff.', 'whatsapp.', 'print.'],
  DELIVERY: ['delivery.'],
  PLANT: ['plant.'],
  FINANCE: ['finance.'],
  MARKETING: ['marketing.'],
  REPORTS: ['reports.'],
}

export default function StaffPage() {
  const [staff,      setStaff]      = useState<Staff[]>([])
  const [roles,      setRoles]      = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editStaff,  setEditStaff]  = useState<Staff|null>(null)
  const [form,       setForm]       = useState(BLANK)
  const [saving,     setSaving]     = useState(false)
  const [search,     setSearch]     = useState('')
  const [pinResult,  setPinResult]  = useState<{name:string;pin:string}|null>(null)
  const [filterRole, setFilterRole] = useState('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [view, setView] = useState<'staff'|'access'>('staff')
  const [currentStaff, setCurrentStaff] = useState<any>(null)
  const [services, setServices] = useState<string[]>([])
  const [roleServiceAccess, setRoleServiceAccess] = useState<Record<string, string[]>>({})
  const [serviceAllowances, setServiceAllowances] = useState<Array<{ staffId: string; serviceCode: string; allowed: boolean }>>([])
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionItem[]>([])
  const [staffPermissions, setStaffPermissions] = useState<Array<{ staffId: string; permission: string; granted: boolean }>>([])
  const [accessStaffId, setAccessStaffId] = useState('')
  const [accessDraft, setAccessDraft] = useState<Record<string, boolean>>({})
  const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>({})
  const [savingAccess, setSavingAccess] = useState(false)

  const load = useCallback(async () => {
    try { const r:any = await staffAPI.list(); setStaff(asArray(r.data, ['staff', 'items'])) }
    catch(e:any) { toast.error(e.message) }
    finally { setLoading(false) }
  },[])
  useEffect(() => { load() },[load])
  useEffect(() => {
    metadataAPI.getAll()
      .then((r: any) => {
        const metadata = r?.metadata || r?.data?.metadata || {}
        setRoles(metadata.staffRoles || [])
      })
      .catch((e: any) => {
        setRoles([])
        toast.error(e.message || 'Failed to load staff roles')
      })
  }, [])
  const loadAccessCatalog = useCallback(async () => {
    try {
      const r: any = await securityAPI.accessCatalog()
      const data = r?.data || r || {}
      setServices(data.services || [])
      setRoleServiceAccess(data.roleServiceAccess || {})
      setServiceAllowances(data.serviceAllowances || [])
      setPermissionCatalog(data.permissions || [])
      setStaffPermissions(data.staffPermissions || [])
    } catch (e: any) {
      toast.error(e.message || 'Failed to load access controls')
    }
  }, [])
  useEffect(() => {
    authAPI.me().then((r: any) => setCurrentStaff(r?.staff || r?.data?.staff || null)).catch(() => setCurrentStaff(null))
  }, [])

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
  const selectedAccessStaff = staff.find((s) => s.id === accessStaffId) || staff[0] || null
  const allowanceFor = (staffId: string, serviceCode: string) =>
    serviceAllowances.find((item) => item.staffId === staffId && item.serviceCode === serviceCode)
  const permissionFor = (staffId: string, permission: string) =>
    staffPermissions.find((item) => item.staffId === staffId && item.permission === permission)
  const defaultAllowedFor = (s: Staff, serviceCode: string) =>
    s.role === 'SUPER_ADMIN' || (roleServiceAccess[s.role] || []).includes(serviceCode)
  const defaultPermissionFor = (s: Staff, permission: PermissionItem) =>
    s.role === 'SUPER_ADMIN' || (permission.roleBindings || []).some((binding) => binding.role === s.role)
  const effectiveAllowedFor = (s: Staff, serviceCode: string) => {
    const draftValue = accessDraft[serviceCode]
    if (draftValue !== undefined) return draftValue
    const override = allowanceFor(s.id, serviceCode)
    if (override) return override.allowed
    return defaultAllowedFor(s, serviceCode)
  }
  const effectivePermissionFor = (s: Staff, permission: PermissionItem) => {
    const draftValue = permissionDraft[permission.code]
    if (draftValue !== undefined) return draftValue
    const override = permissionFor(s.id, permission.code)
    if (override) return override.granted
    return defaultPermissionFor(s, permission)
  }
  const permissionBelongsToService = (permissionCode: string, serviceCode: string) =>
    (SERVICE_PERMISSION_PREFIXES[serviceCode] || []).some((prefix) => permissionCode.startsWith(prefix))
  const toggleServiceAccess = (serviceCode: string, allowed: boolean) => {
    setAccessDraft((draft) => ({ ...draft, [serviceCode]: allowed }))
    const relatedPermissions = permissionCatalog.filter((permission) => permissionBelongsToService(permission.code, serviceCode))
    if (!relatedPermissions.length) return
    setPermissionDraft((draft) => ({
      ...draft,
      ...Object.fromEntries(relatedPermissions.map((permission) => [permission.code, allowed])),
    }))
  }
  const openAccessFor = (staffId: string) => {
    const s = staff.find((item) => item.id === staffId)
    if (!s) return
    setAccessStaffId(staffId)
    setAccessDraft({})
    setPermissionDraft({})
  }
  useEffect(() => {
    if (view !== 'access' || !services.length || !staff.length) return
    openAccessFor(accessStaffId || staff[0].id)
  }, [view, services.length, staff.length])
  const saveAccess = async () => {
    if (!selectedAccessStaff) return
    if (!canManageAccess) {
      toast.error('Only super admin can change access')
      return
    }
    setSavingAccess(true)
    try {
      const serviceOverrides = services
        .map((serviceCode) => ({
          serviceCode,
          allowed: effectiveAllowedFor(selectedAccessStaff, serviceCode),
          defaultAllowed: defaultAllowedFor(selectedAccessStaff, serviceCode),
        }))
        .filter((entry) => entry.allowed !== entry.defaultAllowed)
        .map(({ serviceCode, allowed }) => ({ serviceCode, allowed }))
      const permissionOverrides = permissionCatalog
        .map((permission) => ({
          permission: permission.code,
          granted: effectivePermissionFor(selectedAccessStaff, permission),
          defaultGranted: defaultPermissionFor(selectedAccessStaff, permission),
        }))
        .filter((entry) => entry.granted !== entry.defaultGranted)
        .map(({ permission, granted }) => ({ permission, granted }))
      await Promise.all([
        securityAPI.updateStaffServiceAccess(selectedAccessStaff.id, serviceOverrides),
        securityAPI.updateStaffPermissions(selectedAccessStaff.id, permissionOverrides),
      ])
      toast.success('Access updated')
      await loadAccessCatalog()
      setAccessDraft({})
      setPermissionDraft({})
    } catch (e: any) {
      toast.error(e.message || 'Failed to save access')
    } finally {
      setSavingAccess(false)
    }
  }

  const filtered = staff.filter(s => {
    const q=search.toLowerCase()
    return (!q||s.name.toLowerCase().includes(q)||s.phone.includes(q)||(s.email||'').includes(q)) &&
           (filterRole==='ALL'||s.role===filterRole)
  })
  const permissionGroups = permissionCatalog.reduce<Record<string, PermissionItem[]>>((groups, permission) => {
    const category = permission.category || 'general'
    groups[category] = groups[category] || []
    groups[category].push(permission)
    return groups
  }, {})
  const canManageAccess = currentStaff?.role === 'SUPER_ADMIN'
  useEffect(() => {
    if (!currentStaff) return
    if (currentStaff.role === 'SUPER_ADMIN') loadAccessCatalog()
    else if (view === 'access') setView('staff')
  }, [currentStaff, loadAccessCatalog, view])
  const pagedFiltered = filtered.slice((page - 1) * pageSize, page * pageSize)
  const active=pagedFiltered.filter(s=>s.isActive), inactive=pagedFiltered.filter(s=>!s.isActive)

  return (
    <div style={{padding:'28px 32px',fontFamily:"var(--crm-font-ui)",background:'#f4f7fb',minHeight:'100vh'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:26,color:'#023c62',margin:0}}>Staff Management</h1>
          <p style={{color:'#6b7fa3',fontSize:14,marginTop:4}}>{staff.filter(s=>s.isActive).length} active · {staff.length} total</p>
        </div>
        <button onClick={()=>{setShowCreate(true);setForm(BLANK)}} style={{background:'#023c62',color:'#fff',border:'none',borderRadius:12,padding:'10px 22px',fontSize:14,fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:8}}>
          <UserRoundPlus size={16} /> Add Staff
        </button>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:20}}>
        {[
          { key:'staff', label:'Staff Directory', icon: UserCog },
          ...(canManageAccess ? [{ key:'access', label:'Access Control', icon: SlidersHorizontal }] : []),
        ].map((item:any) => (
          <button key={item.key} onClick={() => setView(item.key)}
            style={{padding:'9px 16px',borderRadius:10,border:`1.5px solid ${view===item.key?'#023c62':'#dce8f0'}`,background:view===item.key?'#023c62':'#fff',color:view===item.key?'#fff':'#6b7fa3',fontWeight:700,cursor:'pointer',fontSize:13,display:'inline-flex',alignItems:'center',gap:8}}>
            <item.icon size={15} />
            {item.label}
          </button>
        ))}
      </div>

      {/* PIN Banner */}
      {pinResult && (
        <div style={{background:'#e8f0f7',border:'1.5px solid #b8d0e8',borderRadius:12,padding:'14px 18px',marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <strong style={{color:'#023c62'}}>{pinResult.name}'s PIN: </strong>
            <span style={{fontFamily:'monospace',fontSize:22,fontWeight:800,color:'#023c62',letterSpacing:4,background:'#fff',padding:'2px 12px',borderRadius:8,border:'1.5px solid #b8d0e8'}}>{pinResult.pin}</span>
            <span style={{color:'#6b7fa3',fontSize:13,marginLeft:12}}>Share this — won't be shown again</span>
          </div>
          <button onClick={()=>setPinResult(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#9dafc8'}}><X size={18} /></button>
        </div>
      )}

      {view === 'staff' && <>
      {/* Filters */}
      <div style={{display:'flex',gap:12,marginBottom:20}}>
        <input style={{flex:1,border:'1.5px solid #dce8f0',borderRadius:12,padding:'10px 16px',fontSize:14,outline:'none',background:'#fff',color:'#1a2332'}}
          placeholder="Search by name, phone, email..." value={search} onChange={e=>setSearch(e.target.value)} />
        <select style={{border:'1.5px solid #dce8f0',borderRadius:12,padding:'10px 14px',fontSize:14,outline:'none',background:'#fff',color:'#1a2332',minWidth:200}}
          value={filterRole} onChange={e=>setFilterRole(e.target.value)}>
          <option value="ALL">All Roles</option>
          {roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{textAlign:'center',padding:48,color:'#9dafc8'}}>Loading staff…</div>
      ) : filtered.length===0 ? (
        <div style={{padding:48,textAlign:'center',color:'#9dafc8',background:'#fff',borderRadius:18,border:'1px solid #dce8f0'}}>No staff found</div>
      ) : (
        <div style={{background:'#fff',borderRadius:18,border:'1px solid #dce8f0',overflow:'hidden'}}>
          {active.map(s=><StaffRow key={s.id} s={s} roles={roles} onEdit={()=>openEdit(s)} onDeactivate={()=>handleDeactivate(s)} onResetPin={()=>handleResetPin(s)} />)}
          {inactive.length>0 && <>
            <div style={{padding:'8px 20px',background:'#f9fafb',fontSize:11,fontWeight:700,color:'#9dafc8',textTransform:'uppercase',letterSpacing:1,borderTop:'1px solid #f0f4f8'}}>Inactive Staff ({inactive.length})</div>
            {inactive.map(s=><StaffRow key={s.id} s={s} roles={roles} onEdit={()=>openEdit(s)} onReactivate={()=>handleReactivate(s)} onResetPin={()=>handleResetPin(s)} />)}
          </>}
        </div>
      )}

      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalItems={filtered.length}
        itemLabel="staff members"
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        pageSizeOptions={[10, 20, 30, 50]}
      />
      </>}

      {view === 'access' && canManageAccess && (
        <div style={{display:'grid',gridTemplateColumns:'minmax(260px,0.4fr) minmax(0,1fr)',gap:18}}>
          <div style={{background:'#fff',border:'1px solid #dce8f0',borderRadius:18,overflow:'hidden'}}>
            <div style={{padding:'14px 16px',borderBottom:'1px solid #edf3f8'}}>
              <div style={{fontWeight:800,color:'#023c62',fontSize:15}}>Select Staff</div>
              <div style={{fontSize:12,color:'#6b7fa3',marginTop:3}}>Role defaults can be overridden per person.</div>
            </div>
            <div style={{maxHeight:560,overflowY:'auto'}}>
              {staff.map((s) => {
                const active = selectedAccessStaff?.id === s.id
                const ri = roleInfo(roles, s.role)
                return (
                  <button key={s.id} onClick={() => openAccessFor(s.id)}
                    style={{width:'100%',border:'none',borderBottom:'1px solid #f0f4f8',background:active?'#e8f0f7':'#fff',padding:'12px 14px',textAlign:'left',cursor:'pointer',opacity:s.isActive?1:0.55}}>
                    <div style={{fontWeight:800,color:'#1a2332',fontSize:13.5}}>{s.name}</div>
                    <div style={{fontSize:11.5,color:ri.color,marginTop:3,fontWeight:700}}>{ri.label}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{background:'#fff',border:'1px solid #dce8f0',borderRadius:18,overflow:'hidden'}}>
            {!selectedAccessStaff ? (
              <div style={{padding:40,textAlign:'center',color:'#9dafc8'}}>No staff selected</div>
            ) : (
              <>
                <div style={{padding:'18px 22px',borderBottom:'1px solid #edf3f8',display:'flex',alignItems:'center',justifyContent:'space-between',gap:14}}>
                  <div>
                    <div style={{fontFamily:"var(--crm-font-display)",fontWeight:800,color:'#023c62',fontSize:18}}>{selectedAccessStaff.name}</div>
                    <div style={{fontSize:12,color:'#6b7fa3',marginTop:4}}>Role: {roleInfo(roles, selectedAccessStaff.role).label}</div>
                  </div>
                  <button onClick={saveAccess} disabled={savingAccess}
                    style={{background:'#023c62',color:'#fff',border:'none',borderRadius:10,padding:'10px 18px',fontSize:13,fontWeight:800,cursor:'pointer',opacity:savingAccess?0.65:1}}>
                    {savingAccess ? 'Saving...' : 'Save Access'}
                  </button>
                </div>
                <div style={{padding:22,display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}>
                  {services.map((serviceCode) => {
                    const defaultAllowed = defaultAllowedFor(selectedAccessStaff, serviceCode)
                    const allowed = effectiveAllowedFor(selectedAccessStaff, serviceCode)
                    const overridden = allowanceFor(selectedAccessStaff.id, serviceCode) !== undefined || accessDraft[serviceCode] !== undefined
                    return (
                      <button key={serviceCode} onClick={() => toggleServiceAccess(serviceCode, !allowed)}
                        style={{border:`1.5px solid ${allowed?'#9ad7b5':'#e6b5b5'}`,background:allowed?'#f0fdf4':'#fff5f5',borderRadius:14,padding:'14px 16px',textAlign:'left',cursor:'pointer'}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                          <span style={{fontWeight:800,color:'#1a2332',fontSize:14}}>{SERVICE_LABELS[serviceCode] || serviceCode}</span>
                          <span style={{fontSize:11,fontWeight:800,borderRadius:999,padding:'4px 9px',background:allowed?'#dcfce7':'#fee2e2',color:allowed?'#166534':'#991b1b'}}>
                            {allowed ? 'Allowed' : 'Blocked'}
                          </span>
                        </div>
                        <div style={{fontSize:11.5,color:'#6b7fa3',marginTop:8,lineHeight:1.45}}>
                          Role default: {defaultAllowed ? 'Allowed' : 'Blocked'}{overridden ? ' · Custom override set' : ''}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div style={{padding:'0 22px 22px'}}>
                  <div style={{fontWeight:800,color:'#023c62',fontSize:15,marginBottom:4}}>Action Permissions</div>
                  <div style={{fontSize:12,color:'#6b7fa3',marginBottom:14}}>Use these for exact controls like delete order, edit pricing, finance edit, reports, delivery assign, and plant stage updates.</div>
                  <div style={{display:'grid',gap:14}}>
                    {Object.entries(permissionGroups).map(([category, items]) => (
                      <div key={category} style={{border:'1px solid #edf3f8',borderRadius:14,overflow:'hidden'}}>
                        <div style={{padding:'10px 14px',background:'#f7fafc',borderBottom:'1px solid #edf3f8',fontSize:12,fontWeight:900,color:'#023c62',textTransform:'uppercase',letterSpacing:0.5}}>
                          {category}
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}>
                          {items.map((permission) => {
                            const defaultGranted = defaultPermissionFor(selectedAccessStaff, permission)
                            const granted = effectivePermissionFor(selectedAccessStaff, permission)
                            const overridden = permissionFor(selectedAccessStaff.id, permission.code) !== undefined || permissionDraft[permission.code] !== undefined
                            return (
                              <button key={permission.code} onClick={() => setPermissionDraft((draft) => ({ ...draft, [permission.code]: !granted }))}
                                style={{border:'none',borderRight:'1px solid #edf3f8',borderBottom:'1px solid #edf3f8',background:granted?'#fff':'#fff7f7',padding:'12px 14px',textAlign:'left',cursor:'pointer'}}>
                                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                                  <span style={{fontSize:13,fontWeight:800,color:'#1a2332'}}>{permission.code}</span>
                                  <span style={{fontSize:10.5,fontWeight:900,borderRadius:999,padding:'3px 8px',background:granted?'#dcfce7':'#fee2e2',color:granted?'#166534':'#991b1b'}}>
                                    {granted ? 'Allowed' : 'Blocked'}
                                  </span>
                                </div>
                                <div style={{fontSize:11,color:'#6b7fa3',marginTop:6,lineHeight:1.4}}>
                                  Default: {defaultGranted ? 'Allowed' : 'Blocked'}{overridden ? ' · Custom override' : ''}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && <StaffModal title="Add New Staff Member" onClose={()=>setShowCreate(false)} onConfirm={handleCreate} saving={saving} confirmLabel="Create Staff">
        <FormFields form={form} F={F} isCreate roles={roles} />
      </StaffModal>}

      {/* Edit Modal */}
      {editStaff && <StaffModal title={`Edit: ${editStaff.name}`} onClose={()=>setEditStaff(null)} onConfirm={handleUpdate} saving={saving} confirmLabel="Save Changes">
        <FormFields form={form} F={F} isCreate={false} roles={roles} />
      </StaffModal>}
    </div>
  )
}

function StaffRow({ s, roles, onEdit, onDeactivate, onReactivate, onResetPin }:{ s:Staff; roles:any[]; onEdit:()=>void; onDeactivate?:()=>void; onReactivate?:()=>void; onResetPin:()=>void }) {
  const ri=roleInfo(roles, s.role)
  const needsPin=!!ri.pinEligible
  const RoleIcon = ri.icon
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
        <span style={{padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700,background:ri.bg,color:ri.color,display:'inline-flex',alignItems:'center',gap:6}}><RoleIcon size={13} /> {ri.label}</span>
        {needsPin && <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:s.hasPin?'#d1fae5':'#fee2e2',color:s.hasPin?'#065f46':'#dc2626',display:'inline-flex',alignItems:'center',gap:6}}>{s.hasPin?<><ShieldCheck size={12} /> PIN</>:<><ShieldX size={12} /> No PIN</>}</span>}
        <div style={{display:'flex',gap:2}}>
          <button title="Edit" onClick={onEdit} style={{background:'none',border:'none',cursor:'pointer',padding:'4px 6px',borderRadius:8}}><PenSquare size={15} /></button>
          {needsPin && <button title="Reset PIN" onClick={onResetPin} style={{background:'none',border:'none',cursor:'pointer',padding:'4px 6px',borderRadius:8}}><KeyRound size={15} /></button>}
          {s.isActive && onDeactivate && <button title="Deactivate" onClick={onDeactivate} style={{background:'none',border:'none',cursor:'pointer',padding:'4px 6px',borderRadius:8,color:'#dc2626'}}><Ban size={15} /></button>}
          {!s.isActive && onReactivate && <button title="Reactivate" onClick={onReactivate} style={{background:'none',border:'none',cursor:'pointer',padding:'4px 6px',borderRadius:8,color:'#16a34a'}}><Eye size={15} /></button>}
        </div>
      </div>
    </div>
  )
}

function FormFields({ form, F, isCreate, roles }:{ form:any; F:(f:string,v:string)=>void; isCreate:boolean; roles:any[] }) {
  const inp:React.CSSProperties={border:'1.5px solid #dce8f0',borderRadius:10,padding:'11px 14px',fontSize:14,outline:'none',color:'#1a2332',background:'#f4f7fb',fontFamily:"var(--crm-font-ui)",marginTop:6,width:'100%',boxSizing:'border-box'}
  const lbl:React.CSSProperties={display:'flex',flexDirection:'column',fontSize:12,fontWeight:700,color:'#6b7fa3',textTransform:'uppercase',letterSpacing:0.5}
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <label style={lbl}>Name * <input style={inp} value={form.name} onChange={e=>F('name',e.target.value)} placeholder="Full name" /></label>
      <label style={lbl}>Phone * <input style={inp} value={form.phone} onChange={e=>F('phone',e.target.value)} placeholder="+91 98765 43210" /></label>
      <label style={lbl}>Email (optional — for CRM login) <input style={inp} type="email" value={form.email} onChange={e=>F('email',e.target.value)} placeholder="name@hangers.in" /></label>
      {isCreate && <label style={lbl}>Password * (for CRM web login) <input style={inp} type="password" value={form.password} onChange={e=>F('password',e.target.value)} placeholder="Min 8 characters" /></label>}
      <label style={lbl}>Role * <select style={{...inp,cursor:'pointer'}} value={form.role} onChange={e=>F('role',e.target.value)}>
        {roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
      </select></label>
      {roles.find((r:any) => r.value === form.role)?.pinEligible && (
        <div style={{background:'#e8f0f7',borderRadius:10,padding:12,fontSize:13,color:'#023c62',lineHeight:1.6}}>
          <strong>PIN Login:</strong> A 4-digit PIN will be auto-generated for this role.{isCreate?' You\'ll see it after creation.':' Use Reset PIN to generate a new one.'}
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
          <span style={{fontFamily:"var(--crm-font-display)",fontWeight:800,fontSize:17,color:'#023c62'}}>{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#9dafc8'}}><X size={18} /></button>
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
