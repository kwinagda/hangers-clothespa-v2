'use client'
import { useEffect, useState } from 'react'
import { expensesAPI, metadataAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { PageHeader, Button } from '@/components/ui'
import { PaginationControls } from '@/components/ui/PaginationControls'
const asArray = (value: any, keys: string[] = []) => {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

const CAT_STYLE: Record<string,{bg:string,color:string}> = {
  SALARY:    {bg:'#f3e8ff',color:'#6b21a8'},
  RENT:      {bg:'#fff7ed',color:'#c2410c'},
  SUPPLIES:  {bg:'#eff6ff',color:'#1d4ed8'},
  UTILITIES: {bg:'#fefce8',color:'#a16207'},
  TRANSPORT: {bg:'#f0fdf4',color:'#15803d'},
  OTHER:     {bg:'#f9fafb',color:'#374151'},
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function ExpensesPage() {
  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: string; label: string }>>([])
  const [expenses, setExpenses]   = useState<any[]>([])
  const [total, setTotal]         = useState(0)
  const [byCategory, setByCategory] = useState<Record<string,number>>({})
  const [month, setMonth]         = useState(new Date().getMonth() + 1)
  const [year, setYear]           = useState(new Date().getFullYear())
  const [showAdd, setShowAdd]     = useState(false)
  const [form, setForm]           = useState({ category: 'SUPPLIES', description: '', amount: '', date: new Date().toISOString().split('T')[0], paidBy: '' })
  const [loading, setLoading]     = useState(false)
  const [page, setPage]           = useState(1)
  const [pageSize, setPageSize]   = useState(20)

  const load = () => {
    expensesAPI.get(month, year).then((r: any) => {
      setExpenses(asArray(r.data, ['expenses', 'items']))
      setTotal(r.data?.total || 0)
      setByCategory(r.data?.byCategory || {})
    }).catch(() => {
      toast.error('Failed to load expenses')
    })
  }

  useEffect(() => { load() }, [month, year])
  useEffect(() => {
    metadataAPI.getAll().then((r:any) => {
      const metadata = r?.metadata || r?.data?.metadata || {}
      const nextCategories = metadata.expenseCategories || []
      setCategoryOptions(nextCategories)
      if (nextCategories.length) {
        setForm((prev) => ({
          ...prev,
          category: nextCategories.some((item:any) => item.value === prev.category) ? prev.category : nextCategories[0].value,
        }))
      }
    }).catch(() => {
      toast.error('Failed to load expense categories')
    })
  }, [])

  const add = async () => {
    if (!form.description || !form.amount) { toast.error('Description and amount are required'); return }
    setLoading(true)
    try {
      await expensesAPI.add(form)
      setShowAdd(false)
      setForm({ category: 'SUPPLIES', description: '', amount: '', date: new Date().toISOString().split('T')[0], paidBy: '' })
      load()
    } catch (e:any) {
      toast.error(e.message || 'Failed to save expense')
    } finally {
      setLoading(false)
    }
  }

  const del = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    try {
      await expensesAPI.delete(id)
      load()
    } catch (e:any) {
      toast.error(e.message || 'Failed to delete expense')
    }
  }

  const fmt = (n: number) => `₹${(n||0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const s = { fontFamily: "var(--crm-font-ui)" }
  const pagedExpenses = expenses.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1000, margin: '0 auto', ...s }}>
      <PageHeader
        title="Expenses"
        subtitle="Shop expenses outside customer orders"
        actions={<Button variant="primary" onClick={() => setShowAdd(true)}>+ Add Expense</Button>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}>
          {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#fef2f2', borderRadius: 12, padding: 16, gridColumn: 'span 1' }}>
          <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Expenses</div>
          <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 24, color: '#991b1b' }}>{fmt(total)}</div>
        </div>
        {Object.entries(byCategory).slice(0,3).map(([cat, amt]) => (
          <div key={cat} style={{ background: CAT_STYLE[cat]?.bg || '#f9fafb', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: CAT_STYLE[cat]?.color || '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat}</div>
            <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 20, color: CAT_STYLE[cat]?.color || '#374151' }}>{fmt(amt as number)}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', overflow: 'hidden' }}>
        {expenses.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8', fontSize: 14 }}>No expenses this month</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Date','Category','Description','Paid By','Amount',''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 11, color: '#9dafc8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #e8f0f7' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedExpenses.map((e: any) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '10px 16px', color: '#6b7fa3' }}>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: CAT_STYLE[e.category]?.bg || '#f9fafb', color: CAT_STYLE[e.category]?.color || '#374151' }}>
                      {e.category}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>{e.description}</td>
                  <td style={{ padding: '10px 16px', color: '#6b7fa3' }}>{e.paidBy || '—'}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#991b1b' }}>{fmt(e.amount)}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <button onClick={() => del(e.id)} style={{ fontSize: 12, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalItems={expenses.length}
        itemLabel="expenses"
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        pageSizeOptions={[10, 20, 30, 50]}
      />

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Add Expense</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Category', key: 'category', type: 'select', options: categoryOptions },
                { label: 'Description *', key: 'description', type: 'text', placeholder: 'What was this expense for?' },
                { label: 'Amount (₹) *', key: 'amount', type: 'number' },
                { label: 'Date', key: 'date', type: 'date' },
                { label: 'Paid By', key: 'paidBy', type: 'text', placeholder: 'Staff name (optional)' },
              ].map((f: any) => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      {f.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box' }} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '8px 16px', fontSize: 13, color: '#6b7fa3', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={add} disabled={loading}
                style={{ padding: '8px 16px', background: '#023c62', color: '#fff', borderRadius: 8, fontSize: 13, border: 'none', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
                {loading ? 'Saving...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
