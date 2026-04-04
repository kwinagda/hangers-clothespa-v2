'use client'
import { useEffect, useState } from 'react'
import { cashBookAPI } from '@/lib/api'
import { PaginationControls } from '@/components/ui/PaginationControls'

const TYPE_STYLE: Record<string, { bg: string, color: string }> = {
  IN:    { bg: '#dcfce7', color: '#166534' },
  OUT:   { bg: '#fee2e2', color: '#991b1b' },
  OPEN:  { bg: '#dbeafe', color: '#1e40af' },
  CLOSE: { bg: '#f3f4f6', color: '#374151' },
}

export default function CashBookPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [summary, setSummary] = useState({ totalIn: 0, totalOut: 0, balance: 0 })
  const [date, setDate]       = useState(new Date().toISOString().split('T')[0])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState({ type: 'IN', amount: '', description: '' })
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const load = () => {
    cashBookAPI.get(date).then((r: any) => {
      setEntries(r.data?.entries || [])
      setSummary({ totalIn: r.data?.totalIn || 0, totalOut: r.data?.totalOut || 0, balance: r.data?.balance || 0 })
    })
  }

  useEffect(() => { load() }, [date])

  const add = async () => {
    if (!form.amount) return
    setLoading(true)
    await cashBookAPI.add(form)
    setShowAdd(false)
    setForm({ type: 'IN', amount: '', description: '' })
    load()
    setLoading(false)
  }

  const fmt = (n: number) => `₹${(n||0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const s = { fontFamily: "var(--crm-font-ui)" }
  const pagedEntries = entries.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div style={{ padding: '32px 36px', maxWidth: 800, margin: '0 auto', ...s }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 26, color: '#023c62', margin: 0 }}>Cash Book</h1>
        <button onClick={() => setShowAdd(true)}
          style={{ padding: '10px 20px', background: '#023c62', color: '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          + Add Entry
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: '#6b7fa3' }}>Date:</span>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontSize: 13 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Cash In', value: fmt(summary.totalIn), bg: '#f0fdf4', color: '#166534' },
          { label: 'Cash Out', value: fmt(summary.totalOut), bg: '#fef2f2', color: '#991b1b' },
          { label: 'Balance', value: fmt(summary.balance), bg: '#eff6ff', color: summary.balance >= 0 ? '#1e40af' : '#991b1b' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: c.color, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
            <div style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 800, fontSize: 24, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8f0f7', overflow: 'hidden' }}>
        {entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9dafc8', fontSize: 14 }}>No entries for this date</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Time','Type','Description','Amount'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 11, color: '#9dafc8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #e8f0f7' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedEntries.map((e: any) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '10px 16px', color: '#6b7fa3' }}>
                    {new Date(e.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: TYPE_STYLE[e.type]?.bg || '#f3f4f6', color: TYPE_STYLE[e.type]?.color || '#374151' }}>
                      {e.type}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>{e.description || '—'}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: e.type === 'OUT' || e.type === 'CLOSE' ? '#991b1b' : '#166534' }}>
                    {e.type === 'OUT' || e.type === 'CLOSE' ? '-' : '+'}{fmt(e.amount)}
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
        totalItems={entries.length}
        itemLabel="entries"
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        pageSizeOptions={[10, 20, 30, 50]}
      />

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontFamily: "var(--crm-font-ui)", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>Add Cash Entry</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Type', key: 'type', type: 'select', options: [['IN','Cash In'],['OUT','Cash Out'],['OPEN','Open Register'],['CLOSE','Close Register']] },
                { label: 'Amount (₹)', key: 'amount', type: 'number' },
                { label: 'Description', key: 'description', type: 'text' },
              ].map((f: any) => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: '#6b7fa3', display: 'block', marginBottom: 6 }}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                      {f.options.map(([v, l]: string[]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : (
                    <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxSizing: 'border-box' }} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '8px 16px', fontSize: 13, color: '#6b7fa3', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={add} disabled={loading}
                style={{ padding: '8px 16px', background: '#023c62', color: '#fff', borderRadius: 8, fontSize: 13, border: 'none', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
                {loading ? 'Saving...' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
