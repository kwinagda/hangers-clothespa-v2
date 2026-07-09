'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileStack,
  IndianRupee,
  PackagePlus,
  Receipt,
  Shirt,
  Truck,
  Users,
} from 'lucide-react'
import { authAPI, ironAPI, metadataAPI, ordersAPI } from '@/lib/api'
import { Badge } from '@/components/ui'

const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

const AVATAR_TONES = [
  { bg: '#e8f0f7', fg: '#023c62' },
  { bg: '#e0f2fe', fg: '#075985' },
  { bg: '#e8f7f0', fg: '#0d7a4e' },
  { bg: '#fff4e5', fg: '#9a4d00' },
  { bg: '#f1ebff', fg: '#5b2fb0' },
  { bg: '#fde8ef', fg: '#9d174d' },
]

const avatarTone = (name: string) => {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length]
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '—'

function CustomerAvatar({ name }: { name: string }) {
  const tone = avatarTone(name)
  return (
    <span className="crm3-avatar" style={{ background: tone.bg, color: tone.fg }}>
      {initials(name)}
    </span>
  )
}

function CompletionRing({ pct, loading }: { pct: number; loading: boolean }) {
  const R = 30
  const C = 2 * Math.PI * R
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <svg width={84} height={84} viewBox="0 0 84 84" role="img" aria-label={`Today's completion ${clamped}%`}>
      <circle cx={42} cy={42} r={R} fill="none" stroke="rgba(184,208,232,0.28)" strokeWidth={7} />
      <circle
        cx={42}
        cy={42}
        r={R}
        fill="none"
        stroke="#b8d0e8"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C - (C * clamped) / 100}
        transform="rotate(-90 42 42)"
        style={{ transition: 'stroke-dashoffset 700ms var(--crm-ease)' }}
      />
      <text x={42} y={40} textAnchor="middle" fill="#fff" fontSize={17} fontWeight={800} fontFamily="var(--crm-font-display)">
        {loading ? '—' : `${clamped}%`}
      </text>
      <text x={42} y={54} textAnchor="middle" fill="#b8d0e8" fontSize={8.5} fontWeight={700} letterSpacing="0.08em">
        DONE
      </text>
    </svg>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null)
  const [ironSummary, setIronSummary] = useState<any>(null)
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({})
  const [statusColors, setStatusColors] = useState<Record<string, string>>({})
  const [staffName, setStaffName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authAPI
      .me()
      .then((r: any) => {
        const staff = r?.staff || r?.data?.staff || null
        setStaffName((staff?.name || '').split(/\s+/)[0] || '')
      })
      .catch(() => setStaffName(''))

    const load = async () => {
      try {
        metadataAPI
          .getAll()
          .then((r: any) => {
            const metadata = r?.metadata || r?.data?.metadata || {}
            const orderStatuses = metadata.orderStatuses || []
            setStatusLabels(
              orderStatuses.reduce((acc: Record<string, string>, item: any) => {
                acc[item.key] = item.label || item.key
                return acc
              }, {})
            )
            setStatusColors(
              orderStatuses.reduce((acc: Record<string, string>, item: any) => {
                if (item.color) acc[item.key] = item.color
                return acc
              }, {})
            )
          })
          .catch(() => {
            toast.error('Failed to load dashboard metadata')
          })

        const orderPromise = ordersAPI.stats().then((r: any) => setStats(r.data)).catch(() => {
          toast.error('Failed to load order dashboard summary')
          setStats(null)
        })

        const ironPromise = (async () => {
          try {
            const all = await ironAPI.listSubscriptions()
            const subscriptions = asArray(all?.data, ['subscriptions', 'items'])
            const active = subscriptions.filter((sub: any) => sub.applicationStatus === 'ACTIVE')
            const pending = subscriptions.filter((sub: any) => sub.applicationStatus === 'PENDING_REVIEW')
            const today = new Date().toISOString().slice(0, 10)

            const [logResponses, billResponses] = await Promise.all([
              Promise.all(
                active.map((sub: any) =>
                  ironAPI.getLogsByPeriod(sub.customerId, today, today).catch(() => ({ data: { totals: { pieces: 0 } } }))
                )
              ),
              Promise.all(active.map((sub: any) => ironAPI.getBills(sub.customerId).catch(() => ({ data: { bills: [] } })))),
            ])

            const piecesToday = logResponses.reduce((sum: number, res: any) => sum + (res?.data?.totals?.pieces || 0), 0)
            const billsPending = billResponses.reduce((sum: number, res: any) => {
              const bills = res?.data?.bills || []
              return sum + bills.filter((bill: any) => bill.status !== 'PAID').length
            }, 0)

            setIronSummary({ active: active.length, pending: pending.length, piecesToday, billsPending })
          } catch {
            toast.error('Failed to load Daily Iron dashboard summary')
            setIronSummary(null)
          }
        })()

        await Promise.all([orderPromise, ironPromise])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const todayDate = useMemo(
    () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    []
  )

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`
  const recentOrders = stats?.recentOrders || []
  const deliveredToday = stats?.today?.delivered || 0
  const totalToday = stats?.today?.orders || 0
  const pendingOrders = stats?.active?.pending || 0
  const readyOrders = stats?.active?.ready || 0
  const activeSubscribers = ironSummary?.active || 0
  const pendingApplications = ironSummary?.pending || 0
  const piecesToday = ironSummary?.piecesToday || 0
  const billsPending = ironSummary?.billsPending || 0
  const completionPct = totalToday ? Math.round((deliveredToday / totalToday) * 100) : 0

  const queueSegments = [
    { label: 'In queue', value: pendingOrders, color: '#f4b45c', href: '/dashboard/orders?status=PROCESSING' },
    { label: 'Ready to dispatch', value: readyOrders, color: '#3ec98e', href: '/dashboard/orders?status=READY_FOR_DELIVERY' },
    { label: 'Delivered today', value: deliveredToday, color: '#4f9fd4', href: '/dashboard/orders?status=DELIVERED' },
  ]
  const queueTotal = queueSegments.reduce((sum, seg) => sum + seg.value, 0)

  const attentionRows = [
    {
      label: 'Ready orders needing dispatch',
      note: 'Route and assign delivery',
      value: readyOrders,
      href: '/dashboard/orders?status=READY_FOR_DELIVERY',
      icon: Truck,
    },
    {
      label: 'Daily Iron bills pending',
      note: 'Unpaid subscription bills',
      value: billsPending,
      href: '/dashboard/finance',
      icon: Receipt,
    },
    {
      label: 'Daily Iron applications',
      note: 'Awaiting review and approval',
      value: pendingApplications,
      href: '/dashboard/iron/applications',
      icon: FileStack,
    },
  ]

  const quickActions = [
    { href: '/dashboard/orders/new', icon: PackagePlus, label: 'Walk-in order' },
    { href: '/dashboard/customers', icon: Users, label: 'Customers' },
    { href: '/dashboard/finance', icon: Receipt, label: 'Finance' },
    { href: '/dashboard/reports', icon: BarChart3, label: 'Reports' },
  ]

  const ironStats = [
    { label: 'Active', value: activeSubscribers, icon: Users },
    { label: 'Pending Apps', value: pendingApplications, icon: Clock3 },
    { label: 'Pieces Today', value: piecesToday, icon: Shirt },
    { label: 'Bills Pending', value: billsPending, icon: Receipt },
  ]

  return (
    <div className="crm-page-enter crm2-page">
      {/* Greeting header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8ba0bb', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            {todayDate}
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--crm-font-display)',
              fontSize: 30,
              fontWeight: 700,
              color: '#142033',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            {greeting}
            {staffName ? `, ${staffName}` : ''}
          </h1>
          <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#6b7fa3' }}>
            {loading
              ? 'Pulling today&apos;s operations…'
              : `${totalToday} order${totalToday === 1 ? '' : 's'} today · ${readyOrders} ready for dispatch · ${fmt(stats?.today?.revenue)} collected`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Link href="/dashboard/reports" className="crm2-btn-secondary">
            <BarChart3 size={15} />
            Reports
          </Link>
          <Link href="/dashboard/orders/new" className="crm2-btn-primary">
            <PackagePlus size={15} />
            New Order
          </Link>
        </div>
      </div>

      {/* Command band */}
      <section className="crm3-band" style={{ marginBottom: 20 }}>
        <div className="crm3-band-grid">
          <Link href="/dashboard/orders" className="crm3-band-cell">
            <div className="crm3-band-label"><ClipboardList size={13} /> Today&apos;s Orders</div>
            <div className="crm3-band-value">{loading ? '—' : totalToday}</div>
            <div className="crm3-band-sub">{loading ? ' ' : `${deliveredToday} already delivered`}</div>
          </Link>
          <div className="crm3-band-cell">
            <div className="crm3-band-label"><IndianRupee size={13} /> Collections Today</div>
            <div className="crm3-band-value">{loading ? '—' : fmt(stats?.today?.revenue)}</div>
            <div className="crm3-band-sub">{loading ? ' ' : `${fmt(stats?.allTime?.revenue)} all-time`}</div>
          </div>
          <Link href="/dashboard/orders?status=PROCESSING" className="crm3-band-cell">
            <div className="crm3-band-label"><Clock3 size={13} /> In Queue</div>
            <div className="crm3-band-value">{loading ? '—' : pendingOrders}</div>
            <div className="crm3-band-sub">Pending &amp; in-process orders</div>
          </Link>
          <Link href="/dashboard/orders?status=READY_FOR_DELIVERY" className="crm3-band-cell">
            <div className="crm3-band-label"><Truck size={13} /> Ready to Dispatch</div>
            <div className="crm3-band-value">{loading ? '—' : readyOrders}</div>
            <div className="crm3-band-sub">Cleaned, awaiting delivery</div>
          </Link>
          <div
            className="crm3-band-cell crm3-band-ring"
            style={{ borderLeft: '1px solid rgba(184,208,232,0.18)', display: 'flex', alignItems: 'center', gap: 16, paddingRight: 28 }}
          >
            <CompletionRing pct={completionPct} loading={loading} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3, whiteSpace: 'nowrap' }}>Today&apos;s completion</div>
              <div style={{ fontSize: 11.5, color: 'rgba(184,208,232,0.85)', lineHeight: 1.45 }}>
                {loading ? '…' : `${deliveredToday} of ${totalToday} orders delivered`}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="crm2-main-grid">
        {/* Main column */}
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          {/* Queue composition */}
          <section className="crm2-panel" style={{ padding: '16px 18px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <h2 className="crm2-panel-title">Live Queue</h2>
              <span style={{ fontSize: 12, color: '#8ba0bb' }}>{loading ? '—' : `${queueTotal} orders across the active pipeline`}</span>
            </div>

            {/* Segmented composition bar (2px surface gaps) */}
            <div style={{ display: 'flex', gap: 2, height: 14, borderRadius: 999, overflow: 'hidden', background: '#eef3f8', marginBottom: 14 }}>
              {queueTotal > 0 &&
                queueSegments
                  .filter((seg) => seg.value > 0)
                  .map((seg) => (
                    <div
                      key={seg.label}
                      title={`${seg.label}: ${seg.value}`}
                      style={{ width: `${(seg.value / queueTotal) * 100}%`, background: seg.color, minWidth: 6 }}
                    />
                  ))}
            </div>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {queueSegments.map((seg) => (
                <Link key={seg.label} href={seg.href} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 9, color: '#142033' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: '#51657f', fontWeight: 600 }}>{seg.label}</span>
                  <span style={{ fontFamily: 'var(--crm-font-display)', fontSize: 16, fontWeight: 800 }}>{loading ? '—' : seg.value}</span>
                  <ChevronRight size={13} color="#b8d0e8" />
                </Link>
              ))}
            </div>
          </section>

          {/* Recent orders */}
          <section className="crm2-panel" style={{ overflow: 'hidden' }}>
            <div className="crm2-panel-head">
              <div>
                <h2 className="crm2-panel-title">Recent Orders</h2>
                <p className="crm2-panel-sub">Latest activity for fast drill-down</p>
              </div>
              <Link href="/dashboard/orders" className="crm2-panel-link">
                View all orders <ArrowRight size={13} />
              </Link>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="crm2-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Order</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#9dafc8', fontSize: 13 }}>
                        Loading recent orders…
                      </td>
                    </tr>
                  ) : !recentOrders.length ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#9dafc8', fontSize: 13 }}>
                        No orders yet.{' '}
                        <Link href="/dashboard/orders/new" style={{ color: '#023c62', fontWeight: 700 }}>
                          Create the first one
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    recentOrders.map((order: any) => (
                      <tr
                        key={order.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          window.location.href = `/dashboard/orders/${order.id}`
                        }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                            <CustomerAvatar name={order.customer?.name || '—'} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#162235', lineHeight: 1.3 }}>{order.customer?.name || '—'}</div>
                              <div style={{ fontSize: 11.5, color: '#8da2bc', marginTop: 1 }}>+91 {order.customer?.phone}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--crm-font-mono)', fontSize: 12.5, fontWeight: 700, color: '#023c62', whiteSpace: 'nowrap' }}>
                          {order.orderNumber}
                        </td>
                        <td>
                          <Badge
                            label={statusLabels[order.status] || order.status}
                            status={order.status}
                            color={statusColors[order.status]}
                            size="sm"
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 800, color: '#023c62', whiteSpace: 'nowrap' }}>
                          ₹{order.totalAmount?.toLocaleString('en-IN')}
                        </td>
                        <td style={{ fontSize: 12, color: '#6b7fa3', whiteSpace: 'nowrap' }}>
                          {format(new Date(order.createdAt), 'dd MMM, h:mm a')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right rail */}
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          {/* Needs attention */}
          <section className="crm2-panel" style={{ overflow: 'hidden' }}>
            <div className="crm2-panel-head">
              <div>
                <h2 className="crm2-panel-title">Needs Attention</h2>
                <p className="crm2-panel-sub">Open the relevant work queue</p>
              </div>
            </div>
            <div>
              {attentionRows.map((row) => (
                <Link key={row.label} href={row.href} className="crm2-list-row">
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: '#e8f0f7',
                      color: '#023c62',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <row.icon size={16} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{row.label}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#8ba0bb', marginTop: 1 }}>{row.note}</span>
                  </span>
                  <span
                    style={{
                      minWidth: 28,
                      height: 24,
                      padding: '0 8px',
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: row.value > 0 ? '#023c62' : '#eef3f8',
                      color: row.value > 0 ? '#fff' : '#8ba0bb',
                      fontWeight: 800,
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {loading ? '—' : row.value}
                  </span>
                  <ChevronRight size={15} color="#b8d0e8" style={{ flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          </section>

          {/* Quick actions — icon grid */}
          <section className="crm2-panel" style={{ padding: '16px 16px 16px' }}>
            <h2 className="crm2-panel-title" style={{ marginBottom: 12 }}>Quick Actions</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="crm-card-hover"
                  style={{
                    textDecoration: 'none',
                    borderRadius: 12,
                    border: '1px solid #e3ebf3',
                    background: '#fbfdff',
                    padding: '13px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 9,
                    color: '#142033',
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: '#023c62',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <action.icon size={15} />
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {action.label}
                    <ArrowUpRight size={12} color="#8ba0bb" />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Daily Iron */}
          <section className="crm2-panel" style={{ overflow: 'hidden' }}>
            <div className="crm2-panel-head">
              <div>
                <h2 className="crm2-panel-title">Daily Iron</h2>
                <p className="crm2-panel-sub">Subscription service snapshot</p>
              </div>
              <Link href="/dashboard/iron/logs" className="crm2-panel-link">
                Open logs <ArrowRight size={13} />
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, padding: '14px 18px 18px' }}>
              {ironStats.map((item) => (
                <div
                  key={item.label}
                  style={{
                    borderRadius: 12,
                    border: '1px solid #e8f0f7',
                    background: '#fbfdff',
                    padding: '12px 13px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <item.icon size={14} color="#6b7fa3" />
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7fa3', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      {item.label}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'var(--crm-font-display)', fontWeight: 800, fontSize: 22, color: '#142033', lineHeight: 1 }}>
                    {loading ? '—' : item.value}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
