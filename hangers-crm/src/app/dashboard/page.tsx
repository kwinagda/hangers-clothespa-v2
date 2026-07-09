'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  IndianRupee,
  PackagePlus,
  Receipt,
  Shirt,
  Truck,
  Users,
} from 'lucide-react'
import { ironAPI, metadataAPI, ordersAPI } from '@/lib/api'
import { PageHeader } from '@/components/ui'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

type StatCardProps = {
  icon: any
  label: string
  value: string | number
  note: string
  tone?: 'blue' | 'amber' | 'green' | 'violet'
}

const TONE = {
  blue: {
    color: '#023c62',
    soft: '#e8f0f7',
    border: '#cfe0ec',
  },
  amber: {
    color: '#9a4d00',
    soft: '#fff4e5',
    border: '#f4d5a9',
  },
  green: {
    color: '#0d7a4e',
    soft: '#e8f7f0',
    border: '#bfe6d2',
  },
  violet: {
    color: '#5b2fb0',
    soft: '#f1ebff',
    border: '#d6c6fa',
  },
} as const

function StatCard({ icon: Icon, label, value, note, tone = 'blue' }: StatCardProps) {
  const palette = TONE[tone]
  return (
    <div
      className="crm-card-hover"
      style={{
        background: '#fff',
        borderRadius: 22,
        border: `1px solid ${palette.border}`,
        padding: '20px 20px 18px',
        boxShadow: '0 10px 28px rgba(2,60,98,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: palette.soft,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: palette.color,
          }}
        >
          <Icon size={20} />
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#6b7fa3',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--crm-font-ui)', fontWeight: 800, fontSize: 32, color: '#142033', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#8ca1bc', marginTop: 8, lineHeight: 1.45 }}>{note}</div>
    </div>
  )
}

function SectionCard({
  title,
  subtitle,
  actionHref,
  actionLabel,
  children,
}: {
  title: string
  subtitle: string
  actionHref?: string
  actionLabel?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 24,
        border: '1px solid #e3edf6',
        boxShadow: '0 10px 28px rgba(2,60,98,0.06)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '20px 24px 18px',
          borderBottom: '1px solid #edf3f8',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--crm-font-display)',
              fontWeight: 700,
              fontSize: 19,
              color: '#023c62',
              margin: '0 0 4px',
            }}
          >
            {title}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7fa3', lineHeight: 1.45 }}>{subtitle}</p>
        </div>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            style={{
              textDecoration: 'none',
              color: '#035a8f',
              fontSize: 13,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
            }}
          >
            {actionLabel}
            <ArrowRight size={14} />
          </Link>
        )}
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null)
  const [ironSummary, setIronSummary] = useState<any>(null)
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        metadataAPI
          .getAll()
          .then((r: any) => {
            const metadata = r?.metadata || r?.data?.metadata || {}
            const labels = (metadata.orderStatuses || []).reduce((acc: Record<string, string>, item: any) => {
              acc[item.key] = item.label || item.key
              return acc
            }, {})
            setStatusLabels(labels)
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
  const billsPending = ironSummary?.billsPending || 0

  const workflowHealth = [
    {
      label: 'Orders In Queue',
      value: pendingOrders,
      helper: 'Orders waiting across pickup and plant flow',
      tone: 'amber' as const,
    },
    {
      label: 'Ready For Delivery',
      value: readyOrders,
      helper: 'Orders available for routing and dispatch',
      tone: 'green' as const,
    },
    {
      label: 'Delivered Today',
      value: deliveredToday,
      helper: totalToday ? `${Math.round((deliveredToday / totalToday) * 100)}% of today's orders completed` : 'No completed orders yet today',
      tone: 'blue' as const,
    },
  ]

  const attentionRows = [
    {
      label: 'Ready orders needing dispatch',
      value: readyOrders,
      href: '/dashboard/orders?status=READY_FOR_DELIVERY',
      tone: 'green' as const,
    },
    {
      label: 'Daily Iron bills pending',
      value: billsPending,
      href: '/dashboard/finance',
      tone: 'violet' as const,
    },
    {
      label: 'Daily Iron applications pending',
      value: pendingApplications,
      href: '/dashboard/iron/applications',
      tone: 'amber' as const,
    },
  ]

  return (
    <div style={{ padding: '30px 34px', maxWidth: 1380, margin: '0 auto' }}>
      <PageHeader
        title="Operations Dashboard"
        subtitle={todayDate}
        actions={<Link href="/dashboard/orders/new" style={{display:'inline-flex',alignItems:'center',gap:8,background:'#1a3c5e',color:'#fff',textDecoration:'none',padding:'9px 18px',borderRadius:10,fontWeight:700,fontSize:13}}><PackagePlus size={14}/> New Order</Link>}
      />
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
          gap: 14,
          marginBottom: 22,
        }}
      >
        <StatCard icon={ClipboardList} label="Today's Orders" value={loading ? '—' : totalToday} note="Total orders created today across channels" tone="blue" />
        <StatCard icon={Clock3} label="Queue Load" value={loading ? '—' : pendingOrders} note="Pending and in-process orders needing movement" tone="amber" />
        <StatCard icon={Truck} label="Ready To Dispatch" value={loading ? '—' : readyOrders} note="Orders cleaned and ready for delivery assignment" tone="green" />
        <StatCard icon={IndianRupee} label="Collections Today" value={loading ? '—' : fmt(stats?.today?.revenue)} note="Actual payments recorded today" tone="violet" />
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px,0.95fr) minmax(0,1.35fr)',
          gap: 18,
          marginBottom: 22,
        }}
      >
        <SectionCard title="Quick Actions" subtitle="Common operational jumps without browsing through the full nav.">
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              {
                href: '/dashboard/orders/new',
                icon: PackagePlus,
                title: 'Create Walk-in Order',
                note: 'Use for counter-created bookings and same-visit orders',
              },
              {
                href: '/dashboard/orders?status=READY_FOR_DELIVERY',
                icon: Truck,
                title: 'Open Ready Orders',
                note: 'Review delivery-ready work and move it to dispatch',
              },
              {
                href: '/dashboard/customers',
                icon: Users,
                title: 'Open Customer Directory',
                note: 'Search profiles, address history, and repeat activity',
              },
              {
                href: '/dashboard/finance',
                icon: Receipt,
                title: 'Review Finance',
                note: 'Check collections, balances, and open receivables',
              },
              {
                href: '/dashboard/reports',
                icon: BarChart3,
                title: 'Open Reports',
                note: 'View imported orders, payments, garments, and sales history',
              },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="crm-card-hover"
                style={{
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 18,
                  background: '#f7fafc',
                  border: '1px solid #e6eef5',
                  color: '#142033',
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    background: '#e8f0f7',
                    color: '#023c62',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <action.icon size={18} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 800, marginBottom: 3 }}>{action.title}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#6b7fa3', lineHeight: 1.45 }}>{action.note}</span>
                </span>
                <ArrowRight size={15} color="#6b7fa3" />
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Workflow Health" subtitle="The main operational pressure points to scan before opening individual queues.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 16 }}>
            {workflowHealth.map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: 20,
                  border: `1px solid ${TONE[item.tone].border}`,
                  background: TONE[item.tone].soft,
                  padding: '16px 18px',
                }}
              >
                <div style={{ fontSize: 11, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontFamily: 'var(--crm-font-ui)', fontWeight: 800, fontSize: 30, color: TONE[item.tone].color, lineHeight: 1 }}>
                  {loading ? '—' : item.value}
                </div>
                <div style={{ fontSize: 12, color: '#59708f', marginTop: 8, lineHeight: 1.5 }}>{item.helper}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              borderRadius: 20,
              border: '1px solid #e6eef5',
              background: '#fbfdff',
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#023c62' }}>Operational cues</div>
              <span style={{ fontSize: 12, color: '#8ba0bb' }}>Based on current summary data</span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                readyOrders > 0
                  ? `${readyOrders} orders are waiting for delivery planning.`
                  : 'No ready-for-delivery bottleneck right now.',
                pendingOrders > readyOrders
                  ? 'Processing load is higher than dispatch load; plant throughput should be watched.'
                  : 'Dispatch load is keeping pace with the processing queue.',
                totalToday > 0
                  ? `${deliveredToday} of ${totalToday} today’s orders are already completed.`
                  : 'No orders have been created today yet.',
              ].map((line) => (
                <div
                  key={line}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    fontSize: 13,
                    color: '#3f5876',
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: '#6ea8cc', marginTop: 6, flexShrink: 0 }} />
                  <span>{loading ? 'Loading dashboard insight…' : line}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </section>

      <section style={{ marginBottom: 22 }}>
        <SectionCard
          title="Daily Iron"
          subtitle="Applications, active subscribers, pieces logged today, and unpaid bill pressure."
          actionHref="/dashboard/iron/logs"
          actionLabel="Open logs"
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
            {[
              { label: 'Active Subscribers', value: activeSubscribers, tone: 'blue' as const, icon: Users },
              { label: 'Pending Applications', value: pendingApplications, tone: 'amber' as const, icon: Clock3 },
              { label: 'Pieces Today', value: ironSummary?.piecesToday || 0, tone: 'green' as const, icon: Shirt },
              { label: 'Bills Pending', value: billsPending, tone: 'violet' as const, icon: Receipt },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: 20,
                  border: `1px solid ${TONE[item.tone].border}`,
                  background: '#fff',
                  padding: '18px 18px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</span>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: TONE[item.tone].soft,
                      color: TONE[item.tone].color,
                    }}
                  >
                    <item.icon size={17} />
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--crm-font-ui)', fontWeight: 800, fontSize: 30, color: '#142033', lineHeight: 1 }}>
                  {loading ? '—' : item.value}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section>
        <SectionCard title="Recent Orders" subtitle="Latest activity for fast drill-down into live customer work." actionHref="/dashboard/orders" actionLabel="View all orders">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: '#f7fafc' }}>
                  {['Order #', 'Customer', 'Status', 'Amount', 'Date'].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: '12px 18px',
                        textAlign: 'left',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#6b7fa3',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        borderBottom: '1px solid #e8f0f7',
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 42, textAlign: 'center', color: '#9dafc8' }}>
                      Loading dashboard orders…
                    </td>
                  </tr>
                ) : !recentOrders.length ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 42, textAlign: 'center', color: '#9dafc8' }}>
                      No orders yet. <Link href="/dashboard/orders/new" style={{ color: '#023c62' }}>Create the first one</Link>
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((order: any) => (
                    <tr
                      key={order.id}
                      className="crm-table-row"
                      style={{ borderBottom: '1px solid #eef4f8', cursor: 'pointer' }}
                      onClick={() => {
                        window.location.href = `/dashboard/orders/${order.id}`
                      }}
                    >
                      <td style={{ padding: '14px 18px', fontFamily: 'var(--crm-font-mono)', fontSize: 13, fontWeight: 600, color: '#023c62' }}>
                        {order.orderNumber}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#162235', marginBottom: 2 }}>{order.customer?.name || '—'}</div>
                        <div style={{ fontSize: 12, color: '#8da2bc' }}>+91 {order.customer?.phone}</div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span className={`status-badge status-${order.status}`}>{statusLabels[order.status] || order.status}</span>
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 14, fontWeight: 700, color: '#023c62' }}>
                        ₹{order.totalAmount?.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 13, color: '#6b7fa3' }}>
                        {format(new Date(order.createdAt), 'dd MMM, h:mm a')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>
    </div>
  )
}
