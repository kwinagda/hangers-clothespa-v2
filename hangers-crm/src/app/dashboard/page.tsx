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
  Sparkles,
  Truck,
  Users,
} from 'lucide-react'
import { ironAPI, metadataAPI, ordersAPI } from '@/lib/api'
import { Badge, PageHeader, StatCard } from '@/components/ui'

const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null)
  const [ironSummary, setIronSummary] = useState<any>(null)
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({})
  const [statusColors, setStatusColors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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

  const pipelineStages = [
    {
      label: 'In Queue',
      value: pendingOrders,
      helper: 'Waiting across pickup and plant flow',
      href: '/dashboard/orders?status=PROCESSING',
      color: '#9a4d00',
      bg: '#fff4e5',
    },
    {
      label: 'Ready to Dispatch',
      value: readyOrders,
      helper: 'Cleaned and awaiting delivery routing',
      href: '/dashboard/orders?status=READY_FOR_DELIVERY',
      color: '#0d7a4e',
      bg: '#e8f7f0',
    },
    {
      label: 'Delivered Today',
      value: deliveredToday,
      helper: totalToday ? `${completionPct}% of today's orders completed` : 'No orders created today yet',
      href: '/dashboard/orders?status=DELIVERED',
      color: '#023c62',
      bg: '#e8f0f7',
    },
  ]

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
    { href: '/dashboard/orders/new', icon: PackagePlus, label: 'Create walk-in order' },
    { href: '/dashboard/customers', icon: Users, label: 'Customer directory' },
    { href: '/dashboard/finance', icon: Receipt, label: 'Finance & collections' },
    { href: '/dashboard/reports', icon: BarChart3, label: 'Reports & insights' },
  ]

  const ironStats = [
    { label: 'Active', value: activeSubscribers, icon: Users },
    { label: 'Pending Apps', value: pendingApplications, icon: Clock3 },
    { label: 'Pieces Today', value: piecesToday, icon: Shirt },
    { label: 'Bills Pending', value: billsPending, icon: Receipt },
  ]

  return (
    <div className="crm-page-enter crm2-page">
      <PageHeader
        breadcrumb={['Workspace', 'Overview']}
        title="Dashboard"
        subtitle={todayDate}
        actions={
          <>
            <Link href="/dashboard/reports" className="crm2-btn-secondary">
              <BarChart3 size={15} />
              Reports
            </Link>
            <Link href="/dashboard/orders/new" className="crm2-btn-primary">
              <PackagePlus size={15} />
              New Order
            </Link>
          </>
        }
      />

      {/* KPI band */}
      <div className="crm2-kpi-grid" style={{ marginBottom: 18 }}>
        <Link href="/dashboard/orders" className="crm-card-hover" style={{ textDecoration: 'none', display: 'block' }}>
          <StatCard
            label="Today's Orders"
            value={totalToday}
            sub={`${deliveredToday} delivered so far`}
            icon={<ClipboardList size={16} />}
            loading={loading}
          />
        </Link>
        <StatCard
          label="Collections Today"
          value={fmt(stats?.today?.revenue)}
          sub={`${fmt(stats?.allTime?.revenue)} all-time`}
          icon={<IndianRupee size={16} />}
          loading={loading}
        />
        <Link href="/dashboard/orders?status=PROCESSING" className="crm-card-hover" style={{ textDecoration: 'none', display: 'block' }}>
          <StatCard
            label="In Queue"
            value={pendingOrders}
            sub="Pending and in-process orders"
            icon={<Clock3 size={16} />}
            loading={loading}
          />
        </Link>
        <Link href="/dashboard/orders?status=READY_FOR_DELIVERY" className="crm-card-hover" style={{ textDecoration: 'none', display: 'block' }}>
          <StatCard
            label="Ready to Dispatch"
            value={readyOrders}
            sub="Cleaned, awaiting delivery"
            icon={<Truck size={16} />}
            loading={loading}
          />
        </Link>
      </div>

      <div className="crm2-main-grid">
        {/* Main column */}
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          {/* Pipeline */}
          <section className="crm2-panel">
            <div className="crm2-panel-head">
              <div>
                <h2 className="crm2-panel-title">Today&apos;s Pipeline</h2>
                <p className="crm2-panel-sub">Queue pressure across the live workflow</p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: completionPct >= 50 ? '#0d7a4e' : '#6b7fa3' }}>
                {loading ? '—' : `${completionPct}% completed today`}
              </span>
            </div>
            <div style={{ padding: '16px 18px 18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                {pipelineStages.map((stage, index) => (
                  <Link
                    key={stage.label}
                    href={stage.href}
                    className="crm-card-hover"
                    style={{
                      textDecoration: 'none',
                      borderRadius: 12,
                      border: '1px solid #e8f0f7',
                      background: '#fbfdff',
                      padding: '13px 14px',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7fa3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        {stage.label}
                      </span>
                      {index < pipelineStages.length - 1 ? (
                        <ChevronRight size={14} color="#b8d0e8" />
                      ) : (
                        <ArrowUpRight size={14} color="#b8d0e8" />
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--crm-font-ui)', fontSize: 26, fontWeight: 800, color: '#142033', lineHeight: 1 }}>
                        {loading ? '—' : stage.value}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: stage.color,
                          background: stage.bg,
                          borderRadius: 999,
                          padding: '2px 8px',
                        }}
                      >
                        orders
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#8ba0bb', marginTop: 8, lineHeight: 1.4 }}>{stage.helper}</div>
                  </Link>
                ))}
              </div>

              {/* Completion meter (delivered vs created today) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7fa3', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>Today&apos;s completion</span>
                  <span>{loading ? '—' : `${deliveredToday} of ${totalToday} orders delivered`}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#e8f0f7', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, completionPct)}%`,
                      borderRadius: 999,
                      background: 'linear-gradient(90deg,#035a8f,#023c62)',
                      transition: 'width 500ms var(--crm-ease)',
                    }}
                  />
                </div>
              </div>
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
                    <th>Order</th>
                    <th>Customer</th>
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
                        <td style={{ fontFamily: 'var(--crm-font-mono)', fontSize: 12.5, fontWeight: 700, color: '#023c62', whiteSpace: 'nowrap' }}>
                          {order.orderNumber}
                        </td>
                        <td>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#162235', lineHeight: 1.3 }}>{order.customer?.name || '—'}</div>
                          <div style={{ fontSize: 11.5, color: '#8da2bc', marginTop: 2 }}>+91 {order.customer?.phone}</div>
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
                  <div style={{ fontFamily: 'var(--crm-font-ui)', fontWeight: 800, fontSize: 22, color: '#142033', lineHeight: 1 }}>
                    {loading ? '—' : item.value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Quick actions */}
          <section className="crm2-panel" style={{ overflow: 'hidden' }}>
            <div className="crm2-panel-head">
              <div>
                <h2 className="crm2-panel-title">Quick Actions</h2>
                <p className="crm2-panel-sub">Common operational jumps</p>
              </div>
            </div>
            <div>
              {quickActions.map((action) => (
                <Link key={action.href} href={action.href} className="crm2-list-row">
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 9,
                      background: '#e8f0f7',
                      color: '#023c62',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <action.icon size={15} />
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{action.label}</span>
                  <ArrowRight size={14} color="#b8d0e8" style={{ flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          </section>

          {/* Cleaned-today accent card */}
          <section
            className="crm2-panel"
            style={{
              background: 'linear-gradient(135deg,#022f50 0%,#035a8f 100%)',
              border: '1px solid #023c62',
              padding: '18px 18px 16px',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Sparkles size={15} color="#b8d0e8" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b8d0e8' }}>
                Operational cue
              </span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(232,240,247,0.92)' }}>
              {loading
                ? 'Loading dashboard insight…'
                : readyOrders > 0
                  ? `${readyOrders} cleaned order${readyOrders === 1 ? ' is' : 's are'} waiting for delivery planning.`
                  : pendingOrders > 0
                    ? 'No dispatch bottleneck — keep an eye on plant throughput.'
                    : 'All clear. No queue pressure right now.'}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
