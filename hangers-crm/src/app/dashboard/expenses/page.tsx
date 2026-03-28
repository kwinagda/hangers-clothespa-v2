'use client'
import { useEffect, useState } from 'react'
import { expensesAPI } from '@/lib/api'

const CATEGORIES = ['SALARY','RENT','SUPPLIES','UTILITIES','TRANSPORT','OTHER']
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
  const [expenses, setExpenses]   = useState<any[]>([])
  const [total, setTotal]         = useState(0)
  const [byCategory, setByCategory] = useState<Record<string,number>>({})
  const [month, setMonth]         = useState(new Date().getMonth() + 1)
  const [year, setYear]           = useState(new Date().getFullYear())
  const [showAdd, setShowAdd]     = useState(false)
  const [form, setForm]           = useState({ category: 'SUPPLIES', description: '', amount: '', date: new Date().toISOString().split('T')[0], paidBy: '' })
  const [loading, setLoading]     = useState(false)

  const load = () => {
    expensesAPI.get(month, year).then((r: any) => {
      setExpenses(r.data?.expenses || [])
      setTotal(r.data?.total || 0)
      setByCategory(r.data?.byCategory || {})
    })
  }

  useEffect(() => { load() }, [month, year])

  const add = async () => {
    if (!form.description || !form.amount) return
    setLoading(true)
    await expensesAPI.add(form)
    setShowAdd(false)
    setForm({ category: 'SUPPLIES', description: '', amount: '', date: new Date().toISOString().split('T')[0], paidBy: '' })
    load()
    setLoading(false)
  }

  const del = async (id: string) => {
    if (!confirm('Delete this expense?')) return
    await expensesAPI.delete(id)
    load()
  }

  const fmt = (n: number) => `₹${(n||0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const s = { fontFamily: "'DM Sans',sans-serif" }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1000, margin: '0 auto', ...s }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: '#023c62', margin: 0 }}>Expenses</h1>
        <button onClick={() => setShowAdd(true)}
          style={{ padding: '10px 20px', background: '#023c62', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          + Add Expense
        </button>
      </div>

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
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: '#991b1b' }}>{fmt(total)}</div>
        </div>
        {Object.entries(byCategory).slice(0,3).map(([cat, amt]) => (
          <div key={cat} style={{ background: CAT_STYLE[cat]?.bg || '#f9fafb', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: CAT_STYLE[cat]?.color || '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat}</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: CAT_STYLE[cat]?.color || '#374151' }}>{fmt(amt as number)}</div>
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
              {expenses.map((e: any) => (
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

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Add Expense</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Category', key: 'category', type: 'select', options: CATEGORIES },
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
                      {f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
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
