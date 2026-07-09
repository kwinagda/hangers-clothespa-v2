'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import {
  BarChart3,
  Banknote,
  BadgeIcon,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  CheckCircle2,
  FileStack,
  FolderTree,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Package,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Share2,
  Shirt,
  Sparkles,
  FileText,
  TicketPercent,
  Users,
  Wallet,
} from 'lucide-react'
import { authAPI, metadataAPI } from '@/lib/api'
import { LOGO_WHITE_URL } from '@/lib/branding'

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', note: 'Today' },
      { href: '/dashboard/reports', icon: BarChart3, label: 'Reports', note: 'Insights' },
    ],
  },
  {
    label: 'Orders',
    items: [
      { href: '/dashboard/orders', icon: Package, label: 'All Orders', note: 'Queue' },
      { href: '/dashboard/orders?view=in_process', icon: Clock3, label: 'In Process', note: 'Working' },
      { href: '/dashboard/orders?view=ready', icon: Sparkles, label: 'Ready For Delivery', note: 'Dispatch' },
      { href: '/dashboard/orders?view=delivered', icon: CheckCircle2, label: 'Delivered', note: 'Done' },
    ],
  },
  {
    label: 'Workflow',
    items: [
      { href: '/dashboard/quotations', icon: FileText, label: 'Quotations', note: 'Estimates' },
      { href: '/dashboard/plantchallans', icon: ClipboardList, label: 'Plant Challans', note: 'Transfers' },
      { href: '/dashboard/recurring', icon: RefreshCw, label: 'Recurring Pickups', note: 'Schedules' },
    ],
  },
  {
    label: 'Customers & Growth',
    items: [
      { href: '/dashboard/customers', icon: Users, label: 'Customer Directory', note: 'Profiles' },
      { href: '/dashboard/referrals', icon: Share2, label: 'Referrals', note: 'Growth' },
      { href: '/dashboard/promotions', icon: TicketPercent, label: 'Promotions', note: 'Offers' },
      { href: '/dashboard/marketing', icon: Megaphone, label: 'Campaigns', note: 'Messaging' },
    ],
  },
  {
    label: 'Daily Iron',
    items: [
      { href: '/dashboard/iron/logs', icon: Shirt, label: 'Iron Logs', note: 'Daily feed' },
      { href: '/dashboard/iron/applications', icon: FileStack, label: 'Applications', note: 'Approvals' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/dashboard/pricing', icon: IndianRupee, label: 'Pricing', note: 'Rate cards' },
      { href: '/dashboard/finance', icon: Receipt, label: 'Finance', note: 'Collections' },
      { href: '/dashboard/cashbook', icon: Banknote, label: 'Cash Book', note: 'Ledger' },
      { href: '/dashboard/expenses', icon: Receipt, label: 'Expenses', note: 'Outflow' },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/dashboard/staff', icon: BadgeIcon, label: 'Staff', note: 'Access' },
      { href: '/dashboard/attendance', icon: Clock3, label: 'Attendance', note: 'Staff time' },
    ],
  },
]

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [staff,    setStaff]    = useState<any>(null)
  const [roleColors, setRoleColors] = useState<Record<string, string>>({})
  const [sideOpen, setSideOpen] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const asArray = (value: any, keys: string[] = []) => {
    if (Array.isArray(value)) return value
    for (const key of keys) {
      if (Array.isArray(value?.[key])) return value[key]
    }
    return []
  }

  useEffect(() => {
    authAPI.me()
      .then((r: any) => setStaff(r?.data?.staff || r?.staff || null))
      .catch(() => {
        toast.error('Session expired. Please login again.')
        router.replace('/login')
      })
      .finally(() => setAuthLoading(false))
    metadataAPI.getAll().then((r: any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      setRoleColors(Object.fromEntries(asArray(metadata.staffRoles).map((role: any) => [role.value, role.color || '#b8d0e8'])))
    }).catch(() => {
      toast.error('Failed to load dashboard metadata')
    })
  }, [])

  const handleLogout = async () => {
    try { await authAPI.logout() } catch { toast.error('Logout request failed, clearing session locally') }
    router.replace('/login')
  }

  const roleColor = (role: string) => roleColors[role] || '#b8d0e8'
  const showFloatingOrderButton = pathname !== '/dashboard/orders/new'
  const isFullscreenWorkspace = pathname === '/dashboard/orders/new'

  if (authLoading) {
    return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:"var(--crm-font-ui)",color:'#6b7fa3'}}>Loading workspace...</div>
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:"var(--crm-font-ui)" }}>

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside
      onMouseEnter={() => setSideOpen(true)}
      onMouseLeave={() => setSideOpen(false)}
      style={{
        width:        sideOpen ? 286 : 84,
        height:       '100vh',
        background:   'linear-gradient(180deg,#022d4d 0%,#012643 52%,#011f36 100%)',
        display:      'flex',
        flexDirection:'column',
        flexShrink:   0,
        transition:   'width 0.22s var(--crm-ease)',
        position:     'sticky',
        top:          0,
        overflow:     'hidden',
        borderRight:  '1px solid rgba(184,208,232,0.12)',
        boxShadow:    'inset -1px 0 0 rgba(255,255,255,0.03)',
      }}>

        {/* Logo */}
        <div style={{ padding: sideOpen ? '18px 16px 14px' : '18px 12px 14px', borderBottom:'1px solid rgba(184,208,232,0.1)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, textAlign:'center' }}>
          <div style={{ width: sideOpen ? 126 : 42, height: sideOpen ? 46 : 42, display:'flex', alignItems:'center', justifyContent: 'center', flexShrink:0 }}>
            <img src={LOGO_WHITE_URL} alt="Hangers logo" style={{ width: sideOpen ? 116 : 32, height: sideOpen ? 36 : 32, objectFit:'contain' }} />
          </div>
          {sideOpen && (
            <div style={{ minWidth:0, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <span style={{ fontSize:10, color:'rgba(184,208,232,0.54)', letterSpacing:'0.12em' }}>CRM WORKSPACE</span>
                <span style={{ width:4, height:4, borderRadius:999, background:'#6ee7b7' }} />
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding: sideOpen ? '12px 10px 14px' : '12px 8px 14px', overflowY:'auto', overflowX:'hidden', display:'flex', flexDirection:'column', gap:10 }}>
          {NAV_SECTIONS.map(section => (
            <div key={section.label} style={{ background: sideOpen ? 'rgba(255,255,255,0.035)' : 'transparent', border: sideOpen ? '1px solid rgba(184,208,232,0.08)' : 'none', borderRadius:16, padding: sideOpen ? '8px' : 0 }}>
              {sideOpen && (
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'2px 8px 8px', fontSize:11, fontWeight:700, color:'rgba(184,208,232,0.48)', letterSpacing:'0.12em', textTransform:'uppercase' as const }}>
                  <FolderTree size={13} />
                  <span>{section.label}</span>
                </div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {section.items.map(n => {
                  const [itemPath, itemQuery = ''] = n.href.split('?')
                  const currentView = searchParams.get('view') || ''
                  const itemView = new URLSearchParams(itemQuery).get('view') || ''
                  const active = n.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : itemPath === '/dashboard/orders'
                      ? pathname === '/dashboard/orders' && currentView === itemView
                      : pathname.startsWith(itemPath)
                  const Icon = n.icon
                  return (
                    <Link key={n.href} href={n.href} style={{
                      display:'flex',
                      alignItems:'center',
                      gap:12,
                      padding: sideOpen ? '10px 12px' : '10px',
                      borderRadius:14,
                      textDecoration:'none',
                      justifyContent: sideOpen ? 'flex-start' : 'center',
                      background: active ? 'linear-gradient(135deg,rgba(255,255,255,0.2),rgba(255,255,255,0.1))' : 'transparent',
                      color: active ? '#fff' : 'rgba(214,232,247,0.86)',
                      boxShadow: active ? '0 10px 24px rgba(0,0,0,0.16)' : 'none',
                      border: active ? '1px solid rgba(184,208,232,0.24)' : '1px solid transparent',
                    }}>
                      <span style={{
                        width: sideOpen ? 32 : 34,
                        height: sideOpen ? 32 : 34,
                        borderRadius:10,
                        display:'inline-flex',
                        alignItems:'center',
                        justifyContent:'center',
                        flexShrink:0,
                        background: active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
                        color: active ? '#fff' : 'rgba(214,232,247,0.9)',
                      }}>
                        <Icon size={17} style={{ flexShrink:0 }} />
                      </span>
                      {sideOpen && (
                        <span style={{ minWidth:0, display:'flex', flexDirection:'column', gap:2 }}>
                          <span style={{ fontSize:13.5, fontWeight:700, lineHeight:1.15 }}>{n.label}</span>
                          <span style={{ fontSize:11, color: active ? 'rgba(255,255,255,0.72)' : 'rgba(184,208,232,0.58)', lineHeight:1.1 }}>{n.note}</span>
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Staff info & collapse */}
        <div style={{ padding: sideOpen ? '12px 10px 14px' : '10px 8px 14px', borderTop:'1px solid rgba(184,208,232,0.1)', background:'linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.05))' }}>
          {staff && sideOpen && (
            <div style={{ padding:'10px 12px', borderRadius:14, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(184,208,232,0.12)', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:3 }}>{staff.name || staff.email}</div>
              <div style={{ fontSize:11, color:roleColor(staff.role), fontWeight:600, letterSpacing:'0.05em' }}>{staff.role?.replace(/_/g,' ')}</div>
            </div>
          )}
          <button onClick={handleLogout} style={{
            display:'flex', alignItems:'center', gap:10, width:'100%',
            padding: sideOpen ? '10px 12px' : '10px',
            borderRadius:12, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(184,208,232,0.08)', cursor:'pointer',
            color:'rgba(214,232,247,0.72)', fontSize:13, justifyContent: sideOpen ? 'flex-start' : 'center',
          }}>
            <LogOut size={16} />
            {sideOpen && 'Log Out'}
          </button>
          <button onClick={() => setSideOpen(o => !o)} style={{
            display:'flex', alignItems:'center', justifyContent:'center', width:'100%',
            padding:8, borderRadius:12, background:'transparent', border:'none',
            cursor:'pointer', color:'rgba(184,208,232,0.45)', fontSize:18, marginTop:6,
          }}>
            {sideOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────── */}
      <main style={{ flex:1, minHeight:'100vh', background:'#f4f7fb', overflow: isFullscreenWorkspace ? 'hidden' : 'auto' }}>
        {isFullscreenWorkspace ? (
          children
        ) : (
          <div className="crm-page-enter crm-page-shell">
            {children}
          </div>
        )}
        {showFloatingOrderButton && (
          <Link
            href="/dashboard/orders/new"
            className="crm-floating-order"
            style={{
              position:'fixed',
              right:24,
              bottom:24,
              display:'inline-flex',
              alignItems:'center',
              gap:10,
              padding:'12px 14px',
              borderRadius:999,
              background:'linear-gradient(135deg,#023c62,#035a8f)',
              color:'#fff',
              textDecoration:'none',
              boxShadow:'0 18px 42px rgba(2,60,98,0.28)',
              border:'1px solid rgba(184,208,232,0.26)',
              zIndex:40,
            }}
          >
            <span style={{
              width:34,
              height:34,
              borderRadius:999,
              display:'inline-flex',
              alignItems:'center',
              justifyContent:'center',
              background:'rgba(255,255,255,0.16)',
              flexShrink:0,
            }}>
              <Plus size={17} />
            </span>
            <span style={{ display:'flex', flexDirection:'column', gap:2, minWidth:0 }}>
              <span style={{ fontSize:14, fontWeight:800, lineHeight:1.1 }}>New Order</span>
              <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.72)', lineHeight:1.1 }}>Quick create</span>
            </span>
          </Link>
        )}
      </main><Toaster position="top-right" toastOptions={{style:{fontFamily:"var(--crm-font-ui)",background:"#023c62",color:"#fff",borderRadius:"12px"}}}/>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ minHeight:'100vh', display:'grid', placeItems:'center', fontFamily:"var(--crm-font-ui)", color:'#6b7fa3' }}>Loading workspace...</div>}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  )
}
