'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Toaster } from 'react-hot-toast'
import Cookies from 'js-cookie'
import {
  BarChart3,
  Banknote,
  BadgeIcon,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
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
  Shirt,
  TicketPercent,
  Users,
  Wallet,
} from 'lucide-react'
import { authAPI } from '@/lib/api'
import { LOGO_WHITE_URL } from '@/lib/branding'

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', note: 'Today' },
      { href: '/dashboard/search', icon: Search, label: 'Search', note: 'Quick find' },
      { href: '/dashboard/reports', icon: BarChart3, label: 'Reports', note: 'Insights' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/dashboard/orders', icon: Package, label: 'Orders', note: 'Queue' },
      { href: '/dashboard/customers', icon: Users, label: 'Customers', note: 'Directory' },
      { href: '/dashboard/recurring', icon: RefreshCw, label: 'Recurring', note: 'Schedules' },
      { href: '/dashboard/ar-challans', icon: ClipboardList, label: 'Plant Challans', note: 'Transfers' },
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
    label: 'Money',
    items: [
      { href: '/dashboard/pricing', icon: IndianRupee, label: 'Pricing', note: 'Rate cards' },
      { href: '/dashboard/finance', icon: Receipt, label: 'Finance', note: 'Collections' },
      { href: '/dashboard/cashbook', icon: Banknote, label: 'Cash Book', note: 'Ledger' },
      { href: '/dashboard/expenses', icon: Receipt, label: 'Expenses', note: 'Outflow' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/dashboard/attendance', icon: Clock3, label: 'Attendance', note: 'Staff time' },
      { href: '/dashboard/promotions', icon: TicketPercent, label: 'Promotions', note: 'Offers' },
      { href: '/dashboard/marketing', icon: Megaphone, label: 'Campaigns', note: 'Messaging' },
      { href: '/dashboard/staff', icon: BadgeIcon, label: 'Staff', note: 'Access' },
    ],
  },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [staff,    setStaff]    = useState<any>(null)
  const [sideOpen, setSideOpen] = useState(true)

  useEffect(() => {
    const token = Cookies.get('crm_token')
    if (!token) { router.push('/login'); return }
    authAPI.me().then((r: any) => setStaff(r.data.staff)).catch(() => router.push('/login'))
  }, [])

  const handleLogout = async () => {
    try { await authAPI.logout() } catch {}
    Cookies.remove('crm_token')
    router.push('/login')
  }

  const roleColor = (role: string) => {
    const map: Record<string, string> = {
      SUPER_ADMIN: '#fbbf24', MANAGER: '#60a5fa', COUNTER_STAFF: '#34d399',
      ACCOUNTS: '#a78bfa', DELIVERY_MANAGER: '#f472b6',
    }
    return map[role] || '#b8d0e8'
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:"var(--crm-font-ui)" }}>

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside style={{
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
        <div style={{ padding: sideOpen ? '18px 16px 14px' : '18px 12px 14px', borderBottom:'1px solid rgba(184,208,232,0.1)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:44, height:44, borderRadius:14, background:'linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.08))', border:'1px solid rgba(184,208,232,0.24)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 10px 24px rgba(0,0,0,0.18)' }}>
            <img src={LOGO_WHITE_URL} alt="Hangers logo" style={{ width:26, height:26, objectFit:'contain' }} />
          </div>
          {sideOpen && (
            <div style={{ minWidth:0 }}>
              <img src={LOGO_WHITE_URL} alt="Hangers" style={{ height:20, width:'auto', objectFit:'contain', display:'block', marginBottom:4 }} />
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:10, color:'rgba(184,208,232,0.54)', letterSpacing:'0.12em' }}>CRM WORKSPACE</span>
                <span style={{ width:4, height:4, borderRadius:999, background:'#6ee7b7' }} />
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding: sideOpen ? '12px 10px 14px' : '12px 8px 14px', overflowY:'auto', overflowX:'hidden', display:'flex', flexDirection:'column', gap:10 }}>
          {sideOpen && (
            <div style={{ padding:'0 6px 2px' }}>
              <div style={{ fontSize:11, color:'rgba(184,208,232,0.5)', lineHeight:1.45 }}>
                Grouped navigation keeps the frequent actions together and reduces scan time.
              </div>
            </div>
          )}
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
                  const active = n.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(n.href)
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
      <main style={{ flex:1, minHeight:'100vh', background:'#f4f7fb', overflow:'auto' }}>
        <div className="crm-page-enter">
          {children}
        </div>
        <Link
          href="/dashboard/orders/new"
          className="crm-floating-order"
          style={{
            position:'fixed',
            right:24,
            bottom:24,
            display:'inline-flex',
            alignItems:'center',
            gap:12,
            padding:'14px 18px',
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
            width:38,
            height:38,
            borderRadius:999,
            display:'inline-flex',
            alignItems:'center',
            justifyContent:'center',
            background:'rgba(255,255,255,0.16)',
            flexShrink:0,
          }}>
            <Plus size={18} />
          </span>
          <span style={{ display:'flex', flexDirection:'column', gap:2, minWidth:0 }}>
            <span style={{ fontSize:14, fontWeight:800, lineHeight:1.1 }}>New Order</span>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.72)', lineHeight:1.1 }}>Quick create</span>
          </span>
        </Link>
      </main><Toaster position="top-right" toastOptions={{style:{fontFamily:"var(--crm-font-ui)",background:"#023c62",color:"#fff",borderRadius:"12px"}}}/>
    </div>
  )
}
