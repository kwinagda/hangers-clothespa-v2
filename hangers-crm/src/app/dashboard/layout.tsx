'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Toaster } from 'react-hot-toast'
import Cookies from 'js-cookie'
import { authAPI } from '@/lib/api'

const NAV = [
  { href: '/dashboard',           icon: '▦',  label: 'Dashboard'    },
  { href: '/dashboard/orders',    icon: '📦', label: 'Orders'       },
  { href: '/dashboard/customers', icon: '👥', label: 'Customers'    },
  { href: '/dashboard/pricing',   icon: '💰', label: 'Pricing'      },
  { href: '/dashboard/finance',   icon: '🧾', label: 'Finance'      },
  { href: '/dashboard/print',     icon: '🖨️', label: 'Print Center' },
{ href: '/dashboard/cashbook',    icon: '💵', label: 'Cash Book'     },
  { href: '/dashboard/expenses',    icon: '🧾', label: 'Expenses'      },
  { href: '/dashboard/ar-challans', icon: '📋', label: 'Plant Challans' },
  { href: '/dashboard/attendance',  icon: '🕐', label: 'Attendance'    },
  { href: '/dashboard/promotions',  icon: '🎟️', label: 'Promotions'   },
  { href: '/dashboard/recurring',   icon: '🔄', label: 'Recurring'     },
  { href: '/dashboard/marketing',   icon: '📢', label: 'Campaigns'     },
  { href: '/dashboard/reports',     icon: '📊', label: 'Reports'       },
  { href: '/dashboard/search',      icon: '🔍', label: 'Search'        },
  { href: '/dashboard/staff',     icon: '🪪', label: 'Staff'        },
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
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:"'DM Sans',sans-serif" }}>

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside style={{
        width:        sideOpen ? 240 : 72,
        minHeight:    '100vh',
        background:   'linear-gradient(180deg,#023c62 0%,#01294a 100%)',
        display:      'flex',
        flexDirection:'column',
        flexShrink:   0,
        transition:   'width 0.2s',
        position:     'sticky',
        top:          0,
        overflow:     'hidden',
      }}>

        {/* Logo */}
        <div style={{ padding:'24px 16px 20px', borderBottom:'1px solid rgba(184,208,232,0.1)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,0.12)', border:'1px solid rgba(184,208,232,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
            🧺
          </div>
          {sideOpen && (
            <div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:16, color:'#fff', lineHeight:1.2 }}>Hangers</div>
              <div style={{ fontSize:10, color:'rgba(184,208,232,0.5)', letterSpacing:'0.08em' }}>CRM DASHBOARD</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'12px 10px', display:'flex', flexDirection:'column', gap:4 }}>
          {NAV.map(n => {
            const active = n.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(n.href)
            return (
              <Link key={n.href} href={n.href} style={{
                display:'flex', alignItems:'center', gap:12, padding:sideOpen ? '10px 12px' : '10px',
                borderRadius:12, textDecoration:'none', justifyContent: sideOpen ? 'flex-start' : 'center',
                background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                color:      active ? '#fff' : 'rgba(184,208,232,0.65)',
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{n.icon}</span>
                {sideOpen && <span style={{ fontSize:14, fontWeight:500 }}>{n.label}</span>}
              </Link>
            )
          })}

          {/* Divider */}
          <div style={{ borderTop:'1px solid rgba(184,208,232,0.1)', margin:'8px 0' }} />

          {/* New Order shortcut */}
          <Link href="/dashboard/orders/new" style={{
            display:'flex', alignItems:'center', gap:12, padding:sideOpen ? '11px 12px' : '11px',
            borderRadius:12, textDecoration:'none', justifyContent: sideOpen ? 'flex-start' : 'center',
            background:'rgba(255,255,255,0.1)', border:'1px solid rgba(184,208,232,0.2)',
            color:'rgba(184,208,232,0.9)', transition:'all 0.15s',
          }}>
            <span style={{ fontSize:18, flexShrink:0 }}>＋</span>
            {sideOpen && <span style={{ fontSize:14, fontWeight:600 }}>New Order</span>}
          </Link>
        </nav>

        {/* Staff info & collapse */}
        <div style={{ padding:'12px 10px', borderTop:'1px solid rgba(184,208,232,0.1)' }}>
          {staff && sideOpen && (
            <div style={{ padding:'10px 12px', borderRadius:12, background:'rgba(255,255,255,0.07)', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:600, color:'#fff', marginBottom:3 }}>{staff.name || staff.email}</div>
              <div style={{ fontSize:11, color:roleColor(staff.role), fontWeight:600, letterSpacing:'0.05em' }}>{staff.role?.replace(/_/g,' ')}</div>
            </div>
          )}
          <button onClick={handleLogout} style={{
            display:'flex', alignItems:'center', gap:10, width:'100%',
            padding: sideOpen ? '9px 12px' : '9px',
            borderRadius:10, background:'transparent', border:'none', cursor:'pointer',
            color:'rgba(184,208,232,0.5)', fontSize:13, justifyContent: sideOpen ? 'flex-start' : 'center',
          }}>
            <span style={{fontSize:16}}>🚪</span>
            {sideOpen && 'Log Out'}
          </button>
          <button onClick={() => setSideOpen(o => !o)} style={{
            display:'flex', alignItems:'center', justifyContent:'center', width:'100%',
            padding:8, borderRadius:10, background:'transparent', border:'none',
            cursor:'pointer', color:'rgba(184,208,232,0.35)', fontSize:18, marginTop:4,
          }}>
            {sideOpen ? '◀' : '▶'}
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────── */}
      <main style={{ flex:1, minHeight:'100vh', background:'#f4f7fb', overflow:'auto' }}>
        {children}
      </main><Toaster position="top-right" toastOptions={{style:{fontFamily:"DM Sans",background:"#023c62",color:"#fff",borderRadius:"12px"}}}/>
    </div>
  )
}
