'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { LogOut, Plus } from 'lucide-react'
import { authAPI, metadataAPI } from '@/lib/api'
import { LOGO_WHITE_URL } from '@/lib/branding'

// SVG icons exactly matching the design
const Ico = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: d }} />
)

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', d: '<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>' },
      { href: '/dashboard/reports', label: 'Reports', d: '<path d="M4 20V10"/><path d="M11 20V4"/><path d="M18 20v-7"/>' },
    ],
  },
  {
    label: 'Orders',
    items: [
      { href: '/dashboard/orders', label: 'All Orders', d: '<path d="M4 8l8-4 8 4-8 4-8-4z"/><path d="M4 8v8l8 4 8-4V8"/><path d="M12 12v8"/>' },
      { href: '/dashboard/orders?view=in_process', label: 'In Process', d: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/>' },
      { href: '/dashboard/orders?view=ready', label: 'Ready For Delivery', d: '<path d="M12 3l1.8 4.3L18 9l-4.2 1.7L12 15l-1.8-4.3L6 9l4.2-1.7L12 3z"/><path d="M19 15l.8 1.9L22 18l-2.2.9L19 21l-.8-2.1L16 18l2.2-1.1L19 15z"/>' },
      { href: '/dashboard/orders?view=delivered', label: 'Delivered', d: '<circle cx="12" cy="12" r="9"/><path d="M8 12.2l2.6 2.6L16 9.5"/>' },
    ],
  },
  {
    label: 'Workflow',
    items: [
      { href: '/dashboard/quotations', label: 'Quotations', d: '<path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 12h6M9 16h6M9 8h3"/>' },
      { href: '/dashboard/plantchallans', label: 'Plant Challans', d: '<path d="M2.5 16V8a1 1 0 0 1 1-1H14v9"/><path d="M14 10.5h3.6l3 3V16h-1.6"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>' },
      { href: '/dashboard/recurring', label: 'Recurring Pickups', d: '<path d="M4 12a8 8 0 0 1 13.6-5.7L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.6 5.7L4 16"/><path d="M4 20v-4h4"/>' },
    ],
  },
  {
    label: 'Customers & Growth',
    items: [
      { href: '/dashboard/customers', label: 'Customer Directory', d: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17.5" cy="9" r="2.4"/><path d="M15 19c.2-2.2 1.6-3.7 3.5-4"/>' },
      { href: '/dashboard/referrals', label: 'Referrals', d: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>' },
      { href: '/dashboard/promotions', label: 'Promotions', d: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.2a2 2 0 0 0 0 3.6V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.2a2 2 0 0 0 0-3.6V8z"/><path d="M12 6.5v2M12 11v2M12 15.5v2"/>' },
      { href: '/dashboard/marketing', label: 'Campaigns', d: '<path d="M3 10v4h3.5L13 18V6L6.5 10H3z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 6.5a7.5 7.5 0 0 1 0 11"/>' },
    ],
  },
  {
    label: 'Daily Iron',
    items: [
      { href: '/dashboard/iron/logs', label: 'Iron Logs', d: '<path d="M8.5 4l-4.5 2 1.8 3.2L8 8v10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8l2.2 1.2L20 6l-4.5-2s-.5 2-3.5 2-3.5-2-3.5-2z"/>' },
      { href: '/dashboard/iron/applications', label: 'Applications', d: '<path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M8.5 12.5l2.3 2.3L15.5 10"/>' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/dashboard/pricing', label: 'Pricing', d: '<path d="M6 5h12M6 8h12M8 5c0 5 8 5 8 10a4 4 0 0 1-4 4M8 15h8"/>' },
      { href: '/dashboard/finance', label: 'Finance', d: '<path d="M5 4h14v15l-2.5-1.5L14 19l-2.5-1.5L9 19l-2.5-1.5L5 19V4z"/><path d="M8.5 9h7M8.5 12.5h7"/>' },
      { href: '/dashboard/cashbook', label: 'Cash Book', d: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3.5 18h17"/>' },
      { href: '/dashboard/expenses', label: 'Expenses', d: '<path d="M3.5 7l2-3h13l2 3"/><path d="M3.5 7h17v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7z"/><circle cx="16.5" cy="12.5" r="1.4"/>' },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/dashboard/staff', label: 'Staff', d: '<path d="M9 3.5h6l.8 3H8.2l.8-3z"/><path d="M6.5 6.5h11v14a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-14z"/><circle cx="12" cy="12.5" r="2.1"/><path d="M9.3 18h5.4"/>' },
      { href: '/dashboard/attendance', label: 'Attendance', d: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M8 3v4M16 3v4M4 9.5h16"/><path d="M9 14l2 2 4-4"/>' },
    ],
  },
]

function DashboardShell({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [staff, setStaff] = useState<any>(null)
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
    metadataAPI.getAll().catch(() => {
      toast.error('Failed to load dashboard metadata')
    })
  }, [])

  const handleLogout = async () => {
    try { await authAPI.logout() } catch { toast.error('Logout request failed, clearing session locally') }
    router.replace('/login')
  }

  const isFullscreenWorkspace = pathname === '/dashboard/orders/new'
  const showFloatingOrderButton = pathname !== '/dashboard/orders/new'

  if (authLoading) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'var(--crm-font-ui)', color: '#6b7fa3' }}>Loading workspace...</div>
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--crm-font-ui)' }}>

      {/* ── Sidebar — matches design exactly ── */}
      <aside style={{
        width: 254,
        flexShrink: 0,
        background: '#023c62',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}>

        {/* Logo */}
        <div style={{ padding: '22px 20px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <img src={LOGO_WHITE_URL} alt="Hangers Clothes Spa" style={{ height: 30, width: 'auto', objectFit: 'contain' }} />
          <div style={{ color: 'rgba(184,208,232,0.5)', fontSize: 10, letterSpacing: '0.14em', marginTop: 2, fontWeight: 600 }}>CRM</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
          {NAV_SECTIONS.map(section => {
            return (
              <div key={section.label}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(184,208,232,0.42)', padding: '0 10px 8px' }}>
                  {section.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {section.items.map(n => {
                    const [itemPath, itemQuery = ''] = n.href.split('?')
                    const currentView = searchParams.get('view') || ''
                    const itemView = new URLSearchParams(itemQuery).get('view') || ''
                    const active = n.href === '/dashboard'
                      ? pathname === '/dashboard'
                      : itemPath === '/dashboard/orders'
                        ? pathname === '/dashboard/orders' && currentView === itemView
                        : pathname.startsWith(itemPath)
                    return (
                      <Link key={n.href} href={n.href} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        padding: '9px 10px',
                        borderRadius: 8,
                        textDecoration: 'none',
                        background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                        color: active ? '#fff' : 'rgba(214,232,247,0.82)',
                        fontSize: 13.5,
                        fontWeight: active ? 600 : 500,
                      }}>
                        <Ico d={n.d} />
                        {n.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{staff?.name || staff?.email || 'Staff'}</div>
            <div style={{ color: 'rgba(184,208,232,0.55)', fontSize: 10.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{staff?.role?.replace(/_/g, ' ') || ''}</div>
          </div>
          <button onClick={handleLogout} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(214,232,247,0.65)', flexShrink: 0, cursor: 'pointer' }}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex: 1, minHeight: '100vh', background: '#f4f7fb', overflow: isFullscreenWorkspace ? 'hidden' : 'auto' }}>
        {isFullscreenWorkspace ? children : (
          <div className="crm-page-enter crm-page-shell">{children}</div>
        )}
        {showFloatingOrderButton && (
          <Link href="/dashboard/orders/new" className="crm-floating-order" style={{
            position: 'fixed', right: 24, bottom: 24,
            display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 14px',
            borderRadius: 999, background: 'linear-gradient(135deg,#023c62,#035a8f)', color: '#fff',
            textDecoration: 'none', boxShadow: '0 18px 42px rgba(2,60,98,0.28)',
            border: '1px solid rgba(184,208,232,0.26)', zIndex: 40,
          }}>
            <span style={{ width: 34, height: 34, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.16)', flexShrink: 0 }}>
              <Plus size={17} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.1 }}>New Order</span>
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.72)', lineHeight: 1.1 }}>Quick create</span>
            </span>
          </Link>
        )}
      </main>
      <Toaster position="top-right" toastOptions={{ style: { fontFamily: 'var(--crm-font-ui)', background: '#023c62', color: '#fff', borderRadius: '12px' } }} />
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'var(--crm-font-ui)', color: '#6b7fa3' }}>Loading workspace...</div>}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  )
}
