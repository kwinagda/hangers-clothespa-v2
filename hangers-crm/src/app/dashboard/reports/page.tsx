'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  Download,
  Receipt,
  Search,
  Shirt,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react'
import { metadataAPI, reportsAPI } from '@/lib/api'

const HISTORY_START_DATE = '2025-01-01'
const fmtCurrency = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtNumber = (n: number) => (Number(n) || 0).toLocaleString('en-IN')
const formatDate = (value: Date) => {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const daysBetween = (from: string, to: string) => {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
}
const previousRange = (from: string, to: string) => {
  const length = daysBetween(from, to)
  const end = new Date(`${from}T00:00:00`)
  end.setDate(end.getDate() - 1)
  const start = new Date(end)
  start.setDate(start.getDate() - length + 1)
  return { from: formatDate(start), to: formatDate(end) }
}
const pct = (current: number, previous: number) => {
  if (!previous && !current) return 0
  if (!previous) return 100
  return ((current - previous) / previous) * 100
}

type ReportType = { value: string; label: string; group?: string }
type ReportRow = { label: string; value: number; [key: string]: any }

const REPORT_META: Record<string, { icon: any; group: string; description: string; currency?: boolean; hours?: boolean }> = {
  overview: { icon: BarChart3, group: 'DASHBOARDS', description: 'Orders, revenue, collections, customers, and payments in one view.' },
  sales: { icon: TrendingUp, group: 'SALES', description: 'Revenue, paid amount, and outstanding balance.' },
  orders: { icon: BarChart3, group: 'DASHBOARDS', description: 'Order count and workflow status split.' },
  sales_by_item: { icon: Shirt, group: 'SALES', description: 'Garment and item quantity movement.' },
  sales_by_service: { icon: TrendingUp, group: 'SALES', description: 'Revenue split by service name.', currency: true },
  sales_by_date: { icon: CalendarDays, group: 'SALES', description: 'Daily sales total for the selected period.', currency: true },
  sales_by_order: { icon: Receipt, group: 'SALES', description: 'Order-wise billed value and paid amount.', currency: true },
  sales_by_customer: { icon: Users, group: 'SALES', description: 'Customer-wise billed value and order count.', currency: true },
  customers: { icon: Users, group: 'CUSTOMERS', description: 'New customers and customer tag movement.' },
  payments: { icon: Banknote, group: 'FINANCE', description: 'Collection amount and payment mode split.' },
  pending_payments: { icon: Receipt, group: 'FINANCE', description: 'Orders with unpaid balances.', currency: true },
  income: { icon: TrendingUp, group: 'FINANCE', description: 'Order sales, collections, and balance.', currency: true },
  discounts: { icon: Receipt, group: 'FINANCE', description: 'Explicit and imported discounts from order totals.', currency: true },
  adjustments: { icon: Receipt, group: 'FINANCE', description: 'Zero bills and positive order adjustments. Returns stay under cancellations.', currency: true },
  cash_ups: { icon: Banknote, group: 'FINANCE', description: 'Cash book entries grouped by type.', currency: true },
  staff_collection: { icon: UserCog, group: 'FINANCE', description: 'Collections grouped by staff.', currency: true },
  expenses: { icon: Receipt, group: 'FINANCE', description: 'Expense total and category split.' },
  customer_vs_sale: { icon: Users, group: 'CUSTOMERS', description: 'Customer-wise sales and collections.', currency: true },
  customer_wallet: { icon: Banknote, group: 'CUSTOMERS', description: 'Current customer wallet balances.', currency: true },
  cancellations: { icon: Receipt, group: 'OPERATIONS', description: 'Cancelled and return order count by reason.' },
  staff: { icon: UserCog, group: 'OPERATIONS', description: 'Attendance records and staff working hours.' },
  garments: { icon: Shirt, group: 'CATALOG', description: 'Top garments and services by quantity.' },
  catalog_vs_sales: { icon: Shirt, group: 'CATALOG', description: 'Catalog service revenue movement.', currency: true },
  loyalty: { icon: Users, group: 'OTHERS', description: 'Loyalty points movement by transaction type.' },
}

const QUICK_RANGES = [
  {
    label: 'This Month vs Last Month',
    range: () => {
      const now = new Date()
      return { from: formatDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: formatDate(now) }
    },
  },
  {
    label: 'Today',
    range: () => {
      const today = formatDate(new Date())
      return { from: today, to: today }
    },
  },
  {
    label: 'Last Month',
    range: () => {
      const now = new Date()
      return { from: formatDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: formatDate(new Date(now.getFullYear(), now.getMonth(), 0)) }
    },
  },
  {
    label: 'All History',
    range: () => ({ from: HISTORY_START_DATE, to: formatDate(new Date()) }),
  },
]

function mainValue(type: string, data: any) {
  if (!data) return 0
  if (typeof data.total === 'number') return Number(data.total || 0)
  if (typeof data.revenue === 'number') return Number(data.revenue || 0)
  if (type === 'sales') return Number(data.revenue || 0)
  if (type === 'orders') return Number(data.total || 0)
  if (type === 'customers') return Number(data.total || 0)
  if (type === 'payments') return Number(data.total || 0)
  if (type === 'expenses') return Number(data.total || 0)
  if (type === 'staff') return Number(data.records || 0)
  if (Array.isArray(data.rows)) return data.rows.reduce((sum: number, item: any) => sum + Number(item.value || 0), 0)
  if (type === 'garments') return (data.topItems || []).reduce((sum: number, item: any) => sum + Number(item[1] || 0), 0)
  return 0
}

function valueFor(type: string, value: number) {
  return REPORT_META[type]?.currency || ['sales', 'payments', 'expenses'].includes(type) ? fmtCurrency(value) : fmtNumber(value)
}

function lineValueFor(type: string, label: string, value: number) {
  if (type === 'sales' && label.toLowerCase() === 'orders') return fmtNumber(value)
  if (type === 'overview' && ['order sales', 'collected', 'outstanding'].includes(label.toLowerCase())) return fmtCurrency(value)
  if (REPORT_META[type]?.hours || type === 'staff') return `${Number(value || 0).toFixed(1)}h`
  if (REPORT_META[type]?.currency || ['sales', 'payments', 'expenses'].includes(type)) return fmtCurrency(value)
  return fmtNumber(value)
}

function detailValueFor(type: string, row: ReportRow) {
  if (type === 'cancellations') {
    const amount = Number(row.amount || 0)
    return amount ? `${fmtNumber(row.value)} / ${fmtCurrency(amount)}` : fmtNumber(row.value)
  }
  return lineValueFor(type, String(row.label), Number(row.value) || 0)
}

function MiniBars({ rows, formatValue }: { rows: Array<[string, number]>; formatValue: (label: string, value: number) => string }) {
  const max = Math.max(...rows.map((r) => Math.abs(Number(r[1]) || 0)), 1)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.slice(0, 8).map(([label, value]) => (
        <div key={label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#52677f', marginBottom: 5 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.replace(/_/g, ' ')}</span>
            <strong style={{ color: '#142033' }}>{formatValue(label, value)}</strong>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: '#edf3f8', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(5, (Math.abs(Number(value)) / max) * 100)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#23a6d5,#023c62)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points, 1)
  const width = 320
  const height = 118
  const path = points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width
      const y = height - (point / max) * (height - 18) - 9
      return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 150, display: 'block' }}>
      {[0, 1, 2, 3].map((i) => <line key={i} x1="0" x2={width} y1={18 + i * 28} y2={18 + i * 28} stroke="#edf3f8" />)}
      <path d={path} fill="none" stroke="#23a6d5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => {
        const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width
        const y = height - (point / max) * (height - 18) - 9
        return <circle key={index} cx={x} cy={y} r="4" fill="#fff" stroke="#023c62" strokeWidth="2" />
      })}
    </svg>
  )
}

export default function ReportsPage() {
  const [reportTypes, setReportTypes] = useState<ReportType[]>([])
  const [selectedType, setSelectedType] = useState('overview')
  const [rangeLabel, setRangeLabel] = useState(QUICK_RANGES[0].label)
  const initial = QUICK_RANGES[0].range()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [dataByType, setDataByType] = useState<Record<string, any>>({})
  const [previousData, setPreviousData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    metadataAPI.getAll()
      .then((r: any) => {
        const metadata = r?.metadata || r?.data?.metadata || {}
        const nextTypes = metadata.reportTypes || []
        setReportTypes(nextTypes)
        if (nextTypes.length) setSelectedType((current) => nextTypes.some((item: ReportType) => item.value === current) ? current : nextTypes[0].value)
      })
      .catch(() => toast.error('Failed to load report types'))
  }, [])

  useEffect(() => {
    if (!reportTypes.length) return
    const loadReports = async () => {
      setLoading(true)
      try {
        const entries = await Promise.all(reportTypes.map(async (report) => {
          const result = await reportsAPI.get(report.value, from, to)
          return [report.value, result.data] as const
        }))
        setDataByType(Object.fromEntries(entries))
        const prev = previousRange(from, to)
        const prevResult = await reportsAPI.get(selectedType, prev.from, prev.to)
        setPreviousData(prevResult.data)
      } catch (e: any) {
        toast.error(e.message || 'Failed to load reports')
      } finally {
        setLoading(false)
      }
    }
    loadReports()
  }, [from, reportTypes, selectedType, to])

  const selectedData = dataByType[selectedType]
  const selectedMeta = REPORT_META[selectedType] || REPORT_META.overview
  const selectedLabel = reportTypes.find((item) => item.value === selectedType)?.label || selectedType
  const currentMain = mainValue(selectedType, selectedData)
  const previousMain = mainValue(selectedType, previousData)
  const change = pct(currentMain, previousMain)
  const ChangeIcon = change >= 0 ? ArrowUpRight : ArrowDownRight

  const overviewCards = useMemo(() => {
    const sales = dataByType.sales || dataByType.overview || {}
    const orders = dataByType.orders || {}
    const customers = dataByType.customers || {}
    const payments = dataByType.payments || {}
    return [
      { label: 'Orders', value: fmtNumber(orders.total || sales.orders || 0), subLeft: 'Live order count', subRight: 'Status tracked', tone: 'linear-gradient(135deg,#ffe9f2,#f7d8ff)' },
      { label: 'Order Sales', value: fmtCurrency(sales.revenue || 0), subLeft: `${fmtCurrency(sales.paid || 0)} collected`, subRight: `${fmtCurrency(sales.outstanding || 0)} due`, tone: 'linear-gradient(135deg,#dffbe8,#fff1a8)' },
      { label: 'New Customers', value: fmtNumber(customers.total || 0), subLeft: `${Object.keys(customers.byTag || {}).length} tags`, subRight: `${fmtNumber(payments.count || 0)} payments`, tone: 'linear-gradient(135deg,#d5f3ff,#c4f0ed)' },
    ]
  }, [dataByType])

  const detailRows = useMemo<ReportRow[]>(() => {
    if (!selectedData) return []
    if (Array.isArray(selectedData.rows)) return selectedData.rows.map((row: any) => ({
      label: String(row.label || 'Unknown'),
      value: Number(row.value || 0),
      ...row,
    }))
    if (selectedType === 'orders') return Object.entries(selectedData.byStatus || {}).map(([label, value]) => ({ label, value: Number(value || 0) }))
    if (selectedType === 'customers') return Object.entries(selectedData.byTag || {}).map(([label, value]) => ({ label, value: Number(value || 0) }))
    if (selectedType === 'payments') return Object.entries(selectedData.byMode || {}).map(([label, value]) => ({ label, value: Number(value || 0) }))
    if (selectedType === 'expenses') return Object.entries(selectedData.byCategory || {}).map(([label, value]) => ({ label, value: Number(value || 0) }))
    if (selectedType === 'garments') return (selectedData.topItems || []).map(([label, value]: [string, number]) => ({ label, value: Number(value || 0) }))
    if (selectedType === 'staff') return Object.entries(selectedData.byStaff || {}).map(([id, info]: any) => ({ label: info.name || id, value: Number(info.totalHours || 0), days: info.days }))
    return []
  }, [selectedData, selectedType])

  const chartRows = detailRows.map((row) => [String(row.label), Number(row.value) || 0] as [string, number])
  const sparkPoints = overviewCards.map((item) => Number(String(item.value).replace(/[₹,\s]/g, '')) || 0)
  const visibleCatalog = reportTypes.reduce<Record<string, ReportType[]>>((groups, report) => {
    const group = report.group || REPORT_META[report.value]?.group || 'OTHERS'
    if (search && !report.label.toLowerCase().includes(search.toLowerCase())) return groups
    groups[group] = groups[group] || []
    groups[group].push(report)
    return groups
  }, {})

  const selectQuickRange = (label: string) => {
    const item = QUICK_RANGES.find((range) => range.label === label)
    if (!item) return
    const next = item.range()
    setRangeLabel(label)
    setFrom(next.from)
    setTo(next.to)
  }

  const exportCsv = () => {
    if (!selectedData) return
    const hasAmounts = detailRows.some((row) => row.amount !== undefined)
    const rows: string[][] = [
      ['Report', selectedLabel],
      ['From', from],
      ['To', to],
      [],
      hasAmounts ? ['Name', 'Count', 'Amount'] : ['Name', 'Value'],
      ...detailRows.map((row) => hasAmounts ? [String(row.label), String(row.value), String(row.amount || 0)] : [String(row.label), String(row.value)]),
    ]
    const csv = rows.map((row: string[]) => row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `hangers_${selectedType}_${from}_${to}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '22px 24px', fontFamily: 'var(--crm-font-ui)', background: '#f3f6fb', minHeight: '100vh' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        <aside style={{ background: '#fff', border: '1px solid #dce8f0', borderRadius: 14, overflow: 'hidden', position: 'sticky', top: 18, maxHeight: 'calc(100vh - 36px)' }}>
          <div style={{ padding: 14, borderBottom: '1px solid #edf3f8' }}>
            <div style={{ fontWeight: 900, color: '#023c62', fontSize: 15 }}>Reports</div>
            <div style={{ position: 'relative', marginTop: 10 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#8da2bc' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search report" style={{ width: '100%', border: '1px solid #dce8f0', borderRadius: 9, padding: '8px 10px 8px 30px', fontSize: 12, outline: 'none' }} />
            </div>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 112px)', padding: '10px 0' }}>
            {Object.entries(visibleCatalog).map(([group, items]) => (
              <div key={group} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7fa3', fontWeight: 900, padding: '7px 18px', letterSpacing: '0.05em' }}>{group}</div>
                {items.map((report) => {
                  const active = report.value === selectedType
                  return (
                    <button key={report.value} onClick={() => setSelectedType(report.value)}
                      style={{ width: '100%', border: 'none', background: active ? '#e8f0f7' : '#fff', color: '#142033', padding: '7px 18px', textAlign: 'left', fontSize: 12.5, fontWeight: active ? 800 : 600, cursor: 'pointer' }}>
                      {report.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </aside>

        <main>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h1 style={{ margin: 0, color: '#023c62', fontSize: 26, fontFamily: 'var(--crm-font-display)', fontWeight: 900 }}>Insights</h1>
              <div style={{ color: '#6b7fa3', fontSize: 13, marginTop: 3 }}>{selectedMeta.description}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={rangeLabel} onChange={(e) => selectQuickRange(e.target.value)} style={{ border: '1px solid #dce8f0', borderRadius: 10, padding: '9px 12px', background: '#fff', color: '#142033', minWidth: 220 }}>
                {QUICK_RANGES.map((range) => <option key={range.label}>{range.label}</option>)}
              </select>
              <input type="date" value={from} onChange={(e) => { setRangeLabel('Custom'); setFrom(e.target.value) }} style={{ border: '1px solid #dce8f0', borderRadius: 10, padding: '8px 10px', background: '#fff' }} />
              <input type="date" value={to} onChange={(e) => { setRangeLabel('Custom'); setTo(e.target.value) }} style={{ border: '1px solid #dce8f0', borderRadius: 10, padding: '8px 10px', background: '#fff' }} />
              <button onClick={exportCsv} disabled={!selectedData} style={{ border: 'none', borderRadius: 10, padding: '10px 13px', background: '#023c62', color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Download size={15} /> Export
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14, marginBottom: 14 }}>
            {overviewCards.map((card) => (
              <div key={card.label} style={{ background: card.tone, borderRadius: 10, border: '1px solid rgba(2,60,98,0.08)', minHeight: 128, padding: 18, boxShadow: '0 10px 24px rgba(2,60,98,0.06)' }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#023c62' }}>{card.label}</div>
                <div style={{ marginTop: 8, fontSize: 23, fontWeight: 900, color: '#0f2336' }}>{card.value}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid rgba(2,60,98,0.10)', marginTop: 16, paddingTop: 12, gap: 10, color: '#52677f', fontSize: 12 }}>
                  <span>{card.subLeft}</span>
                  <span>{card.subRight}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(340px,0.9fr)', gap: 14, marginBottom: 14 }}>
            <section style={{ background: '#fff', border: '1px solid #dce8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #edf3f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 900, color: '#142033' }}>{selectedLabel} Comparison</div>
                  <div style={{ color: '#6b7fa3', fontSize: 12, marginTop: 3 }}>{from} to {to}</div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: change >= 0 ? '#0d7a4e' : '#b42318', fontWeight: 900, fontSize: 13 }}>
                  <ChangeIcon size={16} /> {Math.abs(change).toFixed(2)}%
                </div>
              </div>
              <div style={{ padding: 18 }}>
                <Sparkline points={sparkPoints} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 6 }}>
                  <div style={{ border: '1px solid #edf3f8', borderRadius: 10, padding: 12 }}>
                    <div style={{ color: '#6b7fa3', fontSize: 11, fontWeight: 900 }}>THIS PERIOD</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#023c62', marginTop: 4 }}>{valueFor(selectedType, currentMain)}</div>
                  </div>
                  <div style={{ border: '1px solid #edf3f8', borderRadius: 10, padding: 12 }}>
                    <div style={{ color: '#6b7fa3', fontSize: 11, fontWeight: 900 }}>PREVIOUS PERIOD</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#64748b', marginTop: 4 }}>{valueFor(selectedType, previousMain)}</div>
                  </div>
                </div>
              </div>
            </section>

            <section style={{ background: '#fff', border: '1px solid #dce8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #edf3f8' }}>
                <div style={{ fontWeight: 900, color: '#142033' }}>{selectedLabel} Split</div>
                <div style={{ color: '#6b7fa3', fontSize: 12, marginTop: 3 }}>Top categories from live records</div>
              </div>
              <div style={{ padding: 18 }}>{chartRows.length ? <MiniBars rows={chartRows} formatValue={(label, value) => lineValueFor(selectedType, label, value)} /> : <div style={{ color: '#9dafc8', padding: 24, textAlign: 'center' }}>No data for this period</div>}</div>
            </section>
          </div>

          <section style={{ background: '#fff', border: '1px solid #dce8f0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '15px 18px', borderBottom: '1px solid #edf3f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900, color: '#142033' }}>Report Details</div>
                <div style={{ color: '#6b7fa3', fontSize: 12, marginTop: 3 }}>Same data, table view for checking and export.</div>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#6b7fa3', fontSize: 12 }}><CalendarDays size={14} /> {loading ? 'Loading...' : `${detailRows.length} rows`}</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: '#f7fafc' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: '#8da2bc', letterSpacing: '0.08em' }}>REPORT LINE</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 11, color: '#8da2bc', letterSpacing: '0.08em' }}>VALUE</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row, index) => (
                    <tr key={`${String(row.label)}-${index}`} style={{ borderTop: '1px solid #edf3f8' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: '#142033' }}>
                        {String(row.label).replace(/_/g, ' ')}
                        {row.customer && <div style={{ fontSize: 11, color: '#8da2bc', marginTop: 3 }}>{row.customer}</div>}
                        {row.method && <div style={{ fontSize: 11, color: '#8da2bc', marginTop: 3 }}>{row.method}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#023c62', fontWeight: 900 }}>{detailValueFor(selectedType, row)}</td>
                    </tr>
                  ))}
                  {!detailRows.length && <tr><td colSpan={2} style={{ padding: 36, textAlign: 'center', color: '#9dafc8' }}>No report data found.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
