'use client'

import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  ArrowRight,
  Banknote,
  BarChart3,
  CalendarRange,
  Download,
  Receipt,
  Shirt,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react'
import { metadataAPI, reportsAPI } from '@/lib/api'

const fmtCurrency = (n: number) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtNumber = (n: number) => (n || 0).toLocaleString('en-IN')
const HISTORY_START_DATE = '2025-01-01'
const formatLocalDateInput = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const REPORT_META: Record<
  string,
  {
    icon: any
    tone: 'blue' | 'amber' | 'green' | 'violet'
    title: string
    description: string
  }
> = {
  sales: {
    icon: TrendingUp,
    tone: 'blue',
    title: 'Sales',
    description: 'Revenue, collection, and outstanding picture for the selected period, excluding cancelled orders.',
  },
  orders: {
    icon: BarChart3,
    tone: 'amber',
    title: 'Orders',
    description: 'Status mix and operational volume across the date range.',
  },
  customers: {
    icon: Users,
    tone: 'green',
    title: 'Customers',
    description: 'New customer intake and tag distribution for the selected window.',
  },
  payments: {
    icon: Banknote,
    tone: 'violet',
    title: 'Payments',
    description: 'Collection volume and payment mode split from the same master records.',
  },
  expenses: {
    icon: Receipt,
    tone: 'amber',
    title: 'Expenses',
    description: 'Expense outflow and category-level spend visibility.',
  },
  staff: {
    icon: UserCog,
    tone: 'blue',
    title: 'Staff',
    description: 'Attendance and working-hours view using the existing staff records.',
  },
  garments: {
    icon: Shirt,
    tone: 'green',
    title: 'Garments',
    description: 'Most common garment/service movement from current order item history.',
  },
}

const TONE = {
  blue: { color: '#023c62', soft: '#e8f0f7', border: '#d5e3ee' },
  amber: { color: '#9a4d00', soft: '#fff4e5', border: '#f1dcc0' },
  green: { color: '#0d7a4e', soft: '#e8f7f0', border: '#cdebdc' },
  violet: { color: '#5b2fb0', soft: '#f0ebff', border: '#dfd3fb' },
} as const

const FUTURE_REPORTS = [
  { title: 'AR Aging', description: 'Outstanding buckets by age using current unpaid and partially paid order balances.' },
  { title: 'Delivery Performance', description: 'Completion rate, failed delivery reasons, and rider-level workload from current order and delivery history.' },
  { title: 'Plant Throughput', description: 'How long garments spend in plant stages and where bottlenecks appear in the current workflow.' },
  { title: 'Service Mix', description: 'Revenue and volume split by service category using existing order items and service master records.' },
  { title: 'Coupon And Loyalty Impact', description: 'How discounts, loyalty redemptions, and write-offs affect realized collection and margins.' },
  { title: 'Daily Iron Billing', description: 'Subscriber growth, billed vs paid amount, and pending Daily Iron collections.' },
  { title: 'Customer Retention', description: 'Repeat ordering behavior, dormant customers, and reactivation windows from current customer and order history.' },
  { title: 'Pickup Slot Demand', description: 'Most-used pickup slots and dates to help plan staffing and route load.' },
  { title: 'Payment Recovery', description: 'Write-off trends, collection lag, and follow-up candidates from receivables and payment history.' },
]

const reportCacheKey = (type: string, from: string, to: string) => `${type}:${from}:${to}`

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 24,
        border: '1px solid #e4edf5',
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
          <h1
            style={{
              fontFamily: 'var(--crm-font-display)',
              fontWeight: 700,
              fontSize: 19,
              color: '#023c62',
              margin: '0 0 4px',
            }}
          >
            {title}
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7fa3', lineHeight: 1.45 }}>{subtitle}</p>
        </div>
        {action}
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </section>
  )
}

function MetricCard({
  label,
  value,
  note,
  tone = 'blue',
}: {
  label: string
  value: string | number
  note: string
  tone?: keyof typeof TONE
}) {
  const palette = TONE[tone]
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        padding: '18px 18px 16px',
        border: `1px solid ${palette.border}`,
        boxShadow: '0 8px 22px rgba(2,60,98,0.04)',
      }}
    >
      <div style={{ fontSize: 11, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--crm-font-ui)', fontWeight: 800, fontSize: 30, color: '#142033', lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#8ba0bb', lineHeight: 1.45 }}>{note}</div>
    </div>
  )
}

export default function ReportsPage() {
  const [selectedType, setSelectedType] = useState('sales')
  const [displayType, setDisplayType] = useState('sales')
  const [reportTypes, setReportTypes] = useState<Array<{ value: string; label: string }>>([])
  const [from, setFrom] = useState(HISTORY_START_DATE)
  const [to, setTo] = useState(() => formatLocalDateInput(new Date()))
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const reportCache = useRef<Record<string, any>>({})

  useEffect(() => {
    metadataAPI
      .getAll()
      .then((r: any) => {
        const metadata = r?.metadata || r?.data?.metadata || {}
        const nextTypes = metadata.reportTypes || []
        setReportTypes(nextTypes)
        if (nextTypes.length) {
          setSelectedType((current) => (nextTypes.some((item: any) => item.value === current) ? current : nextTypes[0].value))
        }
      })
      .catch(() => {
        toast.error('Failed to load report types')
      })
  }, [])

  useEffect(() => {
    const cached = reportCache.current[reportCacheKey(selectedType, from, to)]

    if (cached) {
      startTransition(() => {
        setDisplayType(selectedType)
        setData(cached)
        setLoadedOnce(true)
      })
    }
  }, [from, selectedType, to])

  useEffect(() => {
    if (!reportTypes.length) return

    const loadAll = async () => {
      setLoading(true)
      try {
        const results = await Promise.all(
          reportTypes.map(async (report) => {
            const key = reportCacheKey(report.value, from, to)
            if (reportCache.current[key]) {
              return [report.value, reportCache.current[key]] as const
            }
            const result = await reportsAPI.get(report.value, from, to)
            return [report.value, result.data] as const
          })
        )

        results.forEach(([type, reportData]) => {
          reportCache.current[reportCacheKey(type, from, to)] = reportData
        })

        const nextData = reportCache.current[reportCacheKey(selectedType, from, to)]
        startTransition(() => {
          setDisplayType(selectedType)
          setData(nextData || null)
          setLoadedOnce(true)
        })
      } catch (e: any) {
        toast.error(e.message || 'Failed to load report')
      } finally {
        setLoading(false)
      }
    }

    loadAll()
  }, [from, reportTypes, selectedType, to])

  const activeMeta = REPORT_META[displayType] || REPORT_META.sales

  const withFourMetrics = (metrics: Array<{ label: string; value: string; note?: string; tone?: keyof typeof TONE }>) => metrics.slice(0, 4)

  const headlineMetrics = useMemo(() => {
    if (!data) return []

    if (displayType === 'sales') {
      return withFourMetrics([
        { label: 'Orders', value: fmtNumber(data.orders || 0) },
        { label: 'Revenue', value: fmtCurrency(data.revenue || 0) },
        { label: 'Collected', value: fmtCurrency(data.paid || 0) },
        { label: 'Outstanding', value: fmtCurrency(data.outstanding || 0) },
      ])
    }

    if (displayType === 'orders') {
      const topStatus = Object.entries(data.byStatus || {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0] as [string, number] | undefined
      const activeStatuses = Object.values(data.byStatus || {}).filter((count) => Number(count) > 0).length
      return withFourMetrics([
        { label: 'Total Orders', value: fmtNumber(data.total || 0) },
        { label: 'Active Statuses', value: fmtNumber(activeStatuses) },
        { label: 'Top Status', value: topStatus?.[0]?.replace(/_/g, ' ') || '—' },
        { label: 'Top Status Qty', value: fmtNumber(topStatus?.[1] || 0) },
      ])
    }

    if (displayType === 'customers') {
      const topTag = Object.entries(data.byTag || {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0] as [string, number] | undefined
      return withFourMetrics([
        { label: 'New Customers', value: fmtNumber(data.total || 0) },
        { label: 'Tags Seen', value: fmtNumber(Object.keys(data.byTag || {}).length) },
        { label: 'Top Tag', value: topTag?.[0] || '—' },
        { label: 'Top Tag Qty', value: fmtNumber(topTag?.[1] || 0) },
      ])
    }

    if (displayType === 'payments') {
      const topModes = Object.entries(data.byMode || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 2)
      return withFourMetrics([
        { label: 'Total Collected', value: fmtCurrency(data.total || 0) },
        { label: 'Transactions', value: fmtNumber(data.count || 0) },
        ...topModes.map(([mode, amount]) => ({ label: mode, value: fmtCurrency(amount as number) })),
      ])
    }

    if (displayType === 'expenses') {
      const topCategory = Object.entries(data.byCategory || {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0] as [string, number] | undefined
      return withFourMetrics([
        { label: 'Total Expense', value: fmtCurrency(data.total || 0) },
        { label: 'Categories Seen', value: fmtNumber(Object.keys(data.byCategory || {}).length) },
        { label: 'Top Category', value: topCategory?.[0] || '—' },
        { label: 'Top Category Spend', value: fmtCurrency(topCategory?.[1] || 0) },
      ])
    }

    if (displayType === 'staff') {
      const staffEntries = Object.values(data.byStaff || {}) as Array<any>
      const totalDays = staffEntries.reduce((sum, item) => sum + Number(item.days || 0), 0)
      const totalHours = staffEntries.reduce((sum, item) => sum + Number(item.totalHours || 0), 0)
      return withFourMetrics([
        { label: 'Records', value: fmtNumber(data.records || 0) },
        { label: 'Staff Seen', value: fmtNumber(staffEntries.length) },
        { label: 'Staff Days', value: fmtNumber(totalDays) },
        { label: 'Hours Worked', value: totalHours.toFixed(1) },
      ])
    }

    if (displayType === 'garments') {
      const topItems = data.topItems || []
      const topItem = topItems[0]
      const totalQty = topItems.reduce((sum: number, item: any) => sum + Number(item[1] || 0), 0)
      return withFourMetrics([
        { label: 'Ranked Items', value: fmtNumber(topItems.length) },
        { label: 'Pieces Counted', value: fmtNumber(totalQty) },
        { label: 'Top Item', value: topItem?.[0] || '—' },
        { label: 'Top Qty', value: fmtNumber(topItem?.[1] || 0) },
      ])
    }

    return []
  }, [data, displayType])

  const exportCsv = () => {
    if (!data) return

    const rows: string[][] = []

    if (displayType === 'sales') {
      rows.push(['Metric', 'Value'])
      rows.push(['Orders', String(data.orders || 0)])
      rows.push(['Revenue', String(data.revenue || 0)])
      rows.push(['Collected', String(data.paid || 0)])
      rows.push(['Outstanding', String(data.outstanding || 0)])
    } else if (displayType === 'orders' && data.byStatus) {
      rows.push(['Status', 'Count'])
      Object.entries(data.byStatus).forEach(([status, count]) => rows.push([status, String(count)]))
    } else if (displayType === 'customers' && data.byTag) {
      rows.push(['Tag', 'Count'])
      Object.entries(data.byTag).forEach(([tag, count]) => rows.push([tag, String(count)]))
    } else if (displayType === 'payments' && data.byMode) {
      rows.push(['Mode', 'Amount'])
      Object.entries(data.byMode).forEach(([mode, amount]) => rows.push([mode, String(amount)]))
    } else if (displayType === 'expenses' && data.byCategory) {
      rows.push(['Category', 'Amount'])
      Object.entries(data.byCategory).forEach(([category, amount]) => rows.push([category, String(amount)]))
    } else if (displayType === 'garments' && data.topItems) {
      rows.push(['Item', 'Quantity'])
      data.topItems.forEach(([name, qty]: [string, number]) => rows.push([name, String(qty)]))
    } else if (displayType === 'staff' && data.byStaff) {
      rows.push(['Staff', 'Days', 'Total Hours'])
      Object.entries(data.byStaff).forEach(([id, info]: any) =>
        rows.push([(info as any).name || id, String(info.days || 0), String(Number(info.totalHours || 0).toFixed(1))])
      )
    }

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `hangers_${displayType}_${from}_${to}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const quickRanges = [
    {
      label: 'All History',
      apply: () => {
        setFrom(HISTORY_START_DATE)
        setTo(formatLocalDateInput(new Date()))
      },
    },
    {
      label: 'Today',
      apply: () => {
        const current = formatLocalDateInput(new Date())
        setFrom(current)
        setTo(current)
      },
    },
    {
      label: 'This Month',
      apply: () => {
        const now = new Date()
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        setFrom(formatLocalDateInput(start))
        setTo(formatLocalDateInput(now))
      },
    },
    {
      label: 'Last Month',
      apply: () => {
        const now = new Date()
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const end = new Date(now.getFullYear(), now.getMonth(), 0)
        setFrom(formatLocalDateInput(start))
        setTo(formatLocalDateInput(end))
      },
    },
    {
      label: 'Quarter To Date',
      apply: () => {
        const now = new Date()
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
        const start = new Date(now.getFullYear(), quarterStartMonth, 1)
        setFrom(formatLocalDateInput(start))
        setTo(formatLocalDateInput(now))
      },
    },
  ]

  const narrative = useMemo(() => {
    if (!data || loading) return 'Loading report summary…'

    if (displayType === 'sales') {
      return `${fmtNumber(data.orders || 0)} orders generated ${fmtCurrency(data.revenue || 0)} in billed value for this period, with ${fmtCurrency(data.outstanding || 0)} still outstanding.`
    }
    if (displayType === 'orders') {
      return `${fmtNumber(data.total || 0)} orders were created in this range, broken down by the current workflow statuses below.`
    }
    if (displayType === 'customers') {
      return `${fmtNumber(data.total || 0)} customers were created in the selected period, with distribution across the current customer tags.`
    }
    if (displayType === 'payments') {
      return `${fmtCurrency(data.total || 0)} was collected across ${fmtNumber(data.count || 0)} payment records, split by the available payment modes.`
    }
    if (displayType === 'expenses') {
      return `${fmtCurrency(data.total || 0)} of expense was recorded in this period, with the largest categories shown below.`
    }
    if (displayType === 'staff') {
      return `${fmtNumber(data.records || 0)} attendance records were logged for the date range, summarized by staff days and hours worked.`
    }
    if (displayType === 'garments') {
      return `The ranking below shows the most frequently processed garment/service items from the current order history for this time window.`
    }
    return activeMeta.description
  }, [activeMeta.description, data, displayType, loading])

  const detailConfig = useMemo(() => {
    if (displayType === 'sales') {
      return {
        title: 'Sales Snapshot',
        subtitle: 'Primary commercial numbers for the selected date range, excluding cancelled orders from revenue and balance.',
      }
    }
    if (displayType === 'orders') {
      return {
        title: 'Order Status Mix',
        subtitle: 'How the selected period breaks down across the current workflow statuses.',
      }
    }
    if (displayType === 'customers') {
      return {
        title: 'Customer Intake And Tags',
        subtitle: 'New customers recorded in the range and how they are tagged in the master customer table.',
      }
    }
    if (displayType === 'payments') {
      return {
        title: 'Payment Collection Mix',
        subtitle: 'Collection performance and mode distribution from the existing payment records.',
      }
    }
    if (displayType === 'expenses') {
      return {
        title: 'Expense Breakdown',
        subtitle: 'Total expense and category split using the current expense rows in the master database.',
      }
    }
    if (displayType === 'garments') {
      return {
        title: 'Top Garments And Services',
        subtitle: 'Most processed garment and service items from existing order item history for this period.',
      }
    }
    return {
      title: 'Staff Attendance Summary',
      subtitle: 'Attendance records grouped by staff name, day count, and total hours worked.',
    }
  }, [displayType])

  const detailMetrics = useMemo(() => {
    if (!data) return []

    if (displayType === 'sales') {
      return [
        { label: 'Orders', value: fmtNumber(data.orders || 0), note: 'Orders included in the selected range', tone: 'blue' as const },
        { label: 'Revenue', value: fmtCurrency(data.revenue || 0), note: 'Billed order value, excluding cancelled orders', tone: 'blue' as const },
        { label: 'Collected', value: fmtCurrency(data.paid || 0), note: 'Paid plus write-off effect captured in current records', tone: 'green' as const },
        { label: 'Outstanding', value: fmtCurrency(data.outstanding || 0), note: 'Current unpaid balance from the same order records', tone: 'amber' as const },
      ]
    }
    if (displayType === 'orders') {
      return [
        { label: 'Total Orders', value: fmtNumber(data.total || 0), note: 'Orders created in the selected range', tone: 'blue' as const },
        ...Object.entries(data.byStatus || {}).map(([status, count]) => ({
          label: status.replace(/_/g, ' '),
          value: fmtNumber(count as number),
          note: 'Orders in this workflow status',
          tone: 'amber' as const,
        })),
      ]
    }
    if (displayType === 'customers') {
      return [
        { label: 'New Customers', value: fmtNumber(data.total || 0), note: 'Customer records created during the selected period', tone: 'green' as const },
        ...Object.entries(data.byTag || {}).map(([tag, count]) => ({
          label: tag,
          value: fmtNumber(count as number),
          note: 'Customers tagged this way in current records',
          tone: 'blue' as const,
        })),
      ]
    }
    if (displayType === 'payments') {
      return [
        { label: 'Total Collected', value: fmtCurrency(data.total || 0), note: 'All payment rows in the selected period', tone: 'green' as const },
        { label: 'Transactions', value: fmtNumber(data.count || 0), note: 'Number of payment entries recorded', tone: 'blue' as const },
        ...Object.entries(data.byMode || {}).map(([mode, amount]) => ({
          label: mode,
          value: fmtCurrency(amount as number),
          note: 'Collection through this payment mode',
          tone: 'violet' as const,
        })),
      ]
    }
    if (displayType === 'expenses') {
      return [
        { label: 'Total Expense', value: fmtCurrency(data.total || 0), note: 'Expense recorded in the selected period', tone: 'amber' as const },
        ...Object.entries(data.byCategory || {}).map(([category, amount]) => ({
          label: category,
          value: fmtCurrency(amount as number),
          note: 'Spend in this expense category',
          tone: 'blue' as const,
        })),
      ]
    }
    if (displayType === 'staff') {
      return [
        { label: 'Attendance Records', value: fmtNumber(data.records || 0), note: 'Total attendance rows in the selected range', tone: 'blue' as const },
        { label: 'Tracked Staff', value: fmtNumber(Object.keys(data.byStaff || {}).length), note: 'Unique staff members in attendance data', tone: 'green' as const },
        {
          label: 'Total Hours',
          value: fmtNumber(Object.values(data.byStaff || {}).reduce((sum: number, info: any) => sum + Number(info.totalHours || 0), 0)),
          note: 'Combined hours from current attendance records',
          tone: 'violet' as const,
        },
      ]
    }
    return []
  }, [data, displayType])

  return (
    <div style={{ padding: '30px 34px', maxWidth: 1380, margin: '0 auto', fontFamily: 'var(--crm-font-ui)' }}>
      <section
        style={{
          background: 'linear-gradient(135deg,#022f50 0%,#035a8f 55%,#0b6f84 100%)',
          borderRadius: 28,
          padding: '26px 28px',
          color: '#fff',
          boxShadow: '0 22px 52px rgba(2,60,98,0.18)',
          marginBottom: 22,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.45fr) minmax(320px,0.85fr)', gap: 20, alignItems: 'stretch' }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 999,
                padding: '7px 12px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 16,
              }}
            >
              <CalendarRange size={14} />
              Business Reports
            </div>
            <h1 style={{ fontFamily: 'var(--crm-font-display)', fontWeight: 800, fontSize: 34, lineHeight: 1.05, margin: '0 0 8px' }}>
              KPI-first reporting from the live master database.
            </h1>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'rgba(230,241,250,0.78)', maxWidth: 700, lineHeight: 1.6 }}>
              Select a report and date range, then read the top numbers immediately before drilling into the detailed split below.
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(230,241,250,0.72)' }}>
              <activeMeta.icon size={16} />
              <span>{activeMeta.title}</span>
              {loading && selectedType !== displayType && (
                <>
                  <span style={{ width: 4, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.5)' }} />
                  <span>Switching to {REPORT_META[selectedType]?.title || selectedType}</span>
                </>
              )}
              <span style={{ width: 4, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.5)' }} />
              <span>{from}</span>
              <ArrowRight size={14} />
              <span>{to}</span>
            </div>
          </div>

            <div
              style={{
                background: 'rgba(255,255,255,0.1)',
              borderRadius: 24,
              border: '1px solid rgba(255,255,255,0.14)',
              padding: '22px 22px 18px',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(230,241,250,0.66)', marginBottom: 8 }}>
              Active Report
            </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                <activeMeta.icon size={20} />
              </span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{activeMeta.title}</div>
                <div style={{ fontSize: 13, color: 'rgba(230,241,250,0.72)', marginTop: 4, lineHeight: 1.45 }}>{activeMeta.description}</div>
              </div>
              </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: headlineMetrics.length <= 2 ? '1fr' : '1fr 1fr',
                gap: 10,
                marginTop: 8,
                alignContent: 'start',
              }}
            >
              {headlineMetrics.map((metric) => (
                <div key={metric.label} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '12px 12px 11px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(230,241,250,0.64)', marginBottom: 6 }}>{metric.label}</div>
                  <div style={{ fontSize: metric.value.length > 16 ? 15 : 22, fontWeight: 800, lineHeight: 1.15 }}>{metric.value}</div>
                </div>
              ))}
            </div>
            <button
              onClick={exportCsv}
              disabled={!data || loading}
              style={{
                width: '100%',
                background: !data || loading ? 'rgba(255,255,255,0.12)' : '#fff',
                color: !data || loading ? 'rgba(255,255,255,0.6)' : '#023c62',
                border: 'none',
                borderRadius: 16,
                padding: '13px 14px',
                fontSize: 14,
                fontWeight: 800,
                cursor: !data || loading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 12,
              }}
            >
              <Download size={16} />
              Export Current Report
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(340px,0.8fr)', gap: 18, marginBottom: 22 }}>
        <SectionCard title="Report Types" subtitle="The tabs below are backed by the report types already exposed from metadata and the current report API.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
            {reportTypes.map((report) => {
              const meta = REPORT_META[report.value] || REPORT_META.sales
              const palette = TONE[meta.tone]
              const active = selectedType === report.value
              return (
                <button
                  key={report.value}
                  onClick={() => setSelectedType(report.value)}
                  style={{
                    textAlign: 'left',
                    padding: '16px 16px 15px',
                    borderRadius: 20,
                    border: active ? `2px solid ${palette.color}` : `1px solid ${palette.border}`,
                    background: active ? palette.soft : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 13,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: active ? '#fff' : palette.soft,
                        color: palette.color,
                      }}
                    >
                      <meta.icon size={18} />
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: active ? palette.color : '#8ca1bc', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {active && loading ? 'Loading' : active ? 'Selected' : 'Available'}
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#142033', marginBottom: 5 }}>{report.label}</div>
                  <div style={{ fontSize: 12, color: '#6b7fa3', lineHeight: 1.45 }}>{meta.description}</div>
                </button>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard title="Date Range" subtitle="Switch between quick periods or set the exact report window you want.">
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.08em' }}>From</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  style={{ border: '1px solid #dce8f0', borderRadius: 12, padding: '11px 12px', fontSize: 14, background: '#fbfdff' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7fa3', textTransform: 'uppercase', letterSpacing: '0.08em' }}>To</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  style={{ border: '1px solid #dce8f0', borderRadius: 12, padding: '11px 12px', fontSize: 14, background: '#fbfdff' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {quickRanges.map((range) => (
                <button
                  key={range.label}
                  onClick={range.apply}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    border: '1px solid #dce8f0',
                    background: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#35506f',
                    cursor: 'pointer',
                  }}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <div style={{ borderRadius: 16, border: '1px solid #e7eef5', background: '#fbfdff', padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7fa3', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Snapshot</div>
              <div style={{ fontSize: 13, color: '#5e7592', lineHeight: 1.55 }}>{narrative}</div>
            </div>
          </div>
        </SectionCard>
      </section>

      <div
        style={{
          position: 'relative',
          transition: 'opacity 220ms ease, transform 220ms ease, filter 220ms ease',
          opacity: 1,
          transform: 'translateY(0)',
          filter: 'none',
        }}
      >
      {data ? (
        <SectionCard title={detailConfig.title} subtitle={detailConfig.subtitle}>
          {detailMetrics.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(Math.max(detailMetrics.length, 1), 5)},minmax(0,1fr))`, gap: 12, marginBottom: displayType === 'garments' ? 18 : 0 }}>
              {detailMetrics.map((metric) => (
                <MetricCard key={metric.label} label={metric.label} value={metric.value} note={metric.note} tone={metric.tone} />
              ))}
            </div>
          )}

          {displayType === 'garments' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr style={{ background: '#f7fafc' }}>
                    {['Item', 'Quantity'].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: '12px 16px',
                          textAlign: heading === 'Quantity' ? 'right' : 'left',
                          fontSize: 11,
                          color: '#8da2bc',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          borderBottom: '1px solid #e8f0f7',
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.topItems || []).map(([name, qty]: [string, number]) => (
                    <tr key={name} style={{ borderBottom: '1px solid #f0f4f8' }}>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#162235', fontWeight: 700 }}>{name}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 14, color: '#023c62', fontWeight: 800 }}>{fmtNumber(qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {displayType === 'staff' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#f7fafc' }}>
                    {['Staff', 'Days', 'Total Hours'].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: '12px 16px',
                          textAlign: 'left',
                          fontSize: 11,
                          color: '#8da2bc',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          borderBottom: '1px solid #e8f0f7',
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.byStaff || {}).map(([id, info]: any) => (
                    <tr key={id} style={{ borderBottom: '1px solid #f0f4f8' }}>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#162235', fontWeight: 700 }}>{info.name || id}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#35506f' }}>{fmtNumber(info.days || 0)}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#023c62', fontWeight: 800 }}>{Number(info.totalHours || 0).toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : (
        !loadedOnce ? <div style={{ padding: 64, textAlign: 'center', color: '#9dafc8', fontSize: 14 }}>Loading report workspace…</div> : null
      )}

      {loading && loadedOnce && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(244,247,251,0.18), rgba(244,247,251,0.42))',
            pointerEvents: 'none',
            borderRadius: 24,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: 16,
          }}
        >
          <div style={{ background: 'rgba(255,255,255,0.92)', border: '1px solid #e4edf5', borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#4d6787', boxShadow: '0 8px 20px rgba(2,60,98,0.08)' }}>
            Updating report...
          </div>
        </div>
      )}
      </div>

      <section style={{ marginTop: 22 }}>
        <SectionCard title="Planned Reports From Existing Master Data" subtitle="These are realistic reports we can implement later on the same database and report API, but they are not live numeric reports yet.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
            {FUTURE_REPORTS.map((item) => (
              <div
                key={item.title}
                style={{
                  borderRadius: 20,
                  border: '1px solid #e4edf5',
                  background: '#fbfdff',
                  padding: '18px 18px 16px',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 800, color: '#142033', marginBottom: 8 }}>{item.title}</div>
                <div style={{ fontSize: 12.5, color: '#607895', lineHeight: 1.55 }}>{item.description}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

    </div>
  )
}
