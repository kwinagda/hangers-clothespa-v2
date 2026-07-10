'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
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
    <div style={{ padding: '30px 36px 60px', maxWidth: 1360, margin: '0 auto' }}>
      <PageHeader
        title="Dashboard"
        subtitle={todayDate}
        actions={<Link href="/dashboard/orders/new" style={{display:'inline-flex',alignItems:'center',gap:8,background:'#023c62',color:'#fff',textDecoration:'none',padding:'10px 18px',borderRadius:10,fontWeight:700,fontSize:13.5}}><PackagePlus size={15}/> New Order</Link>}
      />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:14, marginBottom:20 }}>
        <StatCard icon={ClipboardList} label="Today's Orders" value={loading ? '—' : totalToday} note="vs yesterday" tone="blue" />
        <StatCard icon={Clock3} label="Queue Load" value={loading ? '—' : pendingOrders} note="pending + in process" tone="amber" />
        <StatCard icon={Truck} label="Ready To Dispatch" value={loading ? '—' : readyOrders} note="awaiting delivery" tone="green" />
        <StatCard icon={IndianRupee} label="Collections Today" value={loading ? '—' : fmt(stats?.today?.revenue)} note="cash + digital" tone="violet" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.2fr', gap:16, marginBottom:20 }}>
        <div style={{ background:'#fff', border:'1px solid #e3edf6', borderRadius:14 }}>
          <div style={{ padding:'17px 20px', borderBottom:'1px solid #edf3f8', fontFamily:'var(--crm-font-display)', fontWeight:700, fontSize:15.5, color:'#023c62' }}>Quick Actions</div>
          <div style={{ padding:8, display:'flex', flexDirection:'column', gap:2 }}>
            {([
              { href:'/dashboard/orders/new', icon:PackagePlus, label:'Create Walk-in Order' },
              { href:'/dashboard/orders?status=READY_FOR_DELIVERY', icon:Truck, label:'Open Ready Orders' },
              { href:'/dashboard/customers', icon:Users, label:'Customer Directory' },
              { href:'/dashboard/finance', icon:Receipt, label:'Review Finance' },
            ] as const).map(action => (
              <Link key={action.href} href={action.href} className="crm-qa-item" style={{ display:'flex', alignItems:'center', gap:11, padding:'10px 12px', borderRadius:9, color:'#1a2332', fontSize:13.5, fontWeight:600, textDecoration:'none' }}>
                <span style={{ width:32, height:32, borderRadius:9, background:'#e8f0f7', color:'#023c62', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <action.icon size={16} />
                </span>
                {action.label}
              </Link>
            ))}
          </div>
        </div>
        <div style={{ background:'#fff', border:'1px solid #e3edf6', borderRadius:14 }}>
          <div style={{ padding:'17px 20px', borderBottom:'1px solid #edf3f8', fontFamily:'var(--crm-font-display)', fontWeight:700, fontSize:15.5, color:'#023c62' }}>Needs Attention</div>
          <div style={{ padding:8, display:'flex', flexDirection:'column', gap:2 }}>
            {attentionRows.map(row => (
              <Link key={row.label} href={row.href} className="crm-attn-row" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 12px', borderRadius:9, fontSize:13.5, color:'#3d5470', textDecoration:'none' }}>
                {row.label}
                <span style={{ minWidth:28, height:24, padding:'0 8px', borderRadius:999, background:'#e8f0f7', color:'#023c62', fontSize:12, fontWeight:800, fontFamily:'var(--crm-font-mono)', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                  {loading ? '—' : row.value}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background:'#fff', border:'1px solid #e3edf6', borderRadius:14 }}>
        <div style={{ padding:'17px 20px', borderBottom:'1px solid #edf3f8', fontFamily:'var(--crm-font-display)', fontWeight:700, fontSize:15.5, color:'#023c62', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          Recent Orders
          <Link href="/dashboard/orders" style={{ fontSize:12.5, fontWeight:600, color:'#035a8f', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:5 }}>
            View all
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </Link>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Order', 'Customer', 'Status', 'Amount', 'Date'].map(h => (
                  <th key={h} style={{ textAlign:'left', fontSize:10.5, fontWeight:700, color:'#6b7fa3', letterSpacing:'0.07em', textTransform:'uppercase', padding:'11px 18px', borderBottom:'1px solid #e8f0f7', background:'#f7f9fc' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding:42, textAlign:'center', color:'#9dafc8' }}>Loading…</td></tr>
              ) : !recentOrders.length ? (
                <tr><td colSpan={5} style={{ padding:42, textAlign:'center', color:'#9dafc8' }}>No orders yet. <Link href="/dashboard/orders/new" style={{ color:'#023c62' }}>Create the first one</Link></td></tr>
              ) : recentOrders.map((order: any) => (
                <tr key={order.id} className="crm-table-row" style={{ borderBottom:'1px solid #eef4f8', cursor:'pointer' }} onClick={() => { window.location.href = `/dashboard/orders/${order.id}` }}>
                  <td style={{ padding:'13px 18px', fontFamily:'var(--crm-font-mono)', fontSize:13.5, color:'#023c62' }}>{order.orderNumber}</td>
                  <td style={{ padding:'13px 18px', fontSize:13.5, color:'#1a2332' }}>{order.customer?.name || '—'}</td>
                  <td style={{ padding:'13px 18px' }}>
                    <span className={`status-badge status-${order.status}`}>{statusLabels[order.status] || order.status}</span>
                  </td>
                  <td style={{ padding:'13px 18px', fontFamily:'var(--crm-font-mono)', fontWeight:700, color:'#023c62', fontSize:13.5 }}>₹{order.totalAmount?.toLocaleString('en-IN')}</td>
                  <td style={{ padding:'13px 18px', fontSize:13.5, color:'#6b7fa3' }}>{format(new Date(order.createdAt), 'dd MMM, h:mm a')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
