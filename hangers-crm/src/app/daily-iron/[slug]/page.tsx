import { LOGO_BLUE_URL } from '@/lib/branding'

export const dynamic = 'force-dynamic'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'

const money = (value: any) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`

const dateLabel = (value: any) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const monthLabel = (value: any) => {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

async function loadDailyIron(slug: string) {
  const res = await fetch(`${API_BASE_URL}/public/daily-iron/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  const payload = await res.json()
  return payload?.data?.dailyIron || payload?.dailyIron || null
}

export default async function PublicDailyIronPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await loadDailyIron(slug)

  if (!data) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7fb', padding: 24, fontFamily: 'var(--crm-font-ui)' }}>
        <section style={{ width: '100%', maxWidth: 440, background: '#fff', border: '1px solid #e3edf6', borderRadius: 14, padding: 28, textAlign: 'center' }}>
          <img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" style={{ height: 42, objectFit: 'contain', marginBottom: 18 }} />
          <h1 style={{ margin: 0, color: '#142033', fontSize: 24 }}>Daily Iron account not found</h1>
          <p style={{ color: '#6b7fa3', fontSize: 14, lineHeight: 1.6 }}>Please check the link or contact Hangers Clothes Spa.</p>
        </section>
      </main>
    )
  }

  const logs = data.logs || []
  const bills = data.bills || []

  return (
    <main className="daily-iron-page" style={{ minHeight: '100vh', background: '#f4f7fb', padding: '28px 16px 48px', fontFamily: 'var(--crm-font-ui)', color: '#1a2332' }}>
      <style>{`
        .daily-iron-shell {
          max-width: 880px;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #dbe8f2;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 45px rgba(2,60,98,0.08);
        }
        .daily-iron-header {
          padding: 24px 26px;
          border-bottom: 1px solid #edf3f8;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
        }
        .daily-iron-summary {
          padding: 18px 26px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          border-bottom: 1px solid #edf3f8;
        }
        .daily-iron-card {
          background: #f7fafc;
          border: 1px solid #edf3f8;
          border-radius: 10px;
          padding: 12px;
        }
        .daily-iron-section { padding: 24px 26px; border-bottom: 1px solid #edf3f8; }
        .daily-iron-table-wrap { overflow-x: auto; }
        @media (max-width: 640px) {
          main.daily-iron-page { padding: 12px 10px 28px !important; }
          .daily-iron-shell { border-radius: 12px; }
          .daily-iron-header { padding: 18px 16px; display: block; }
          .daily-iron-summary { padding: 14px; grid-template-columns: 1fr; }
          .daily-iron-section { padding: 18px 14px; }
          .daily-iron-table-wrap table { min-width: 560px; }
        }
      `}</style>
      <section className="daily-iron-shell">
        <header className="daily-iron-header">
          <div>
            <img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" style={{ height: 42, objectFit: 'contain', marginBottom: 12 }} />
            <div style={{ color: '#6b7fa3', fontSize: 13 }}>Daily Iron running log</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h1 style={{ margin: '0 0 6px', color: '#023c62', fontSize: 28 }}>Daily Iron</h1>
            <div style={{ color: '#142033', fontWeight: 800 }}>{data.customer?.name || 'Customer'}</div>
            <div style={{ color: '#6b7fa3', fontSize: 13 }}>{monthLabel(data.period?.start)}</div>
          </div>
        </header>

        <div className="daily-iron-summary">
          <div className="daily-iron-card">
            <div style={{ color: '#6b7fa3', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Status</div>
            <div style={{ marginTop: 6, color: '#023c62', fontWeight: 900 }}>{data.subscription?.status || '-'}</div>
          </div>
          <div className="daily-iron-card">
            <div style={{ color: '#6b7fa3', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Month Pieces</div>
            <div style={{ marginTop: 6, color: '#023c62', fontWeight: 900 }}>{data.totals?.pieces || 0}</div>
          </div>
          <div className="daily-iron-card">
            <div style={{ color: '#6b7fa3', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Month Amount</div>
            <div style={{ marginTop: 6, color: '#023c62', fontWeight: 900 }}>{money(data.totals?.amount)}</div>
          </div>
        </div>

        <section className="daily-iron-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 14 }}>
            <h2 style={{ margin: 0, color: '#023c62', fontSize: 18 }}>Updated Daily Logs</h2>
            <span style={{ color: '#6b7fa3', fontSize: 12 }}>{logs.length} entries</span>
          </div>
          {!logs.length ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#9dafc8', background: '#f7fafc', borderRadius: 10 }}>No Daily Iron logs for this month yet.</div>
          ) : (
            <div className="daily-iron-table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: '#f7fafc', color: '#6b7fa3', textAlign: 'left', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 14px' }}>Date</th>
                    <th style={{ padding: '12px 14px' }}>Item</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Pieces</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr key={log.id} style={{ borderTop: '1px solid #edf3f8' }}>
                      <td style={{ padding: '13px 14px', fontWeight: 700 }}>{dateLabel(log.date)}</td>
                      <td style={{ padding: '13px 14px', color: '#142033' }}>{log.serviceName}</td>
                      <td style={{ padding: '13px 14px', textAlign: 'right' }}>{log.pieces}</td>
                      <td style={{ padding: '13px 14px', textAlign: 'right' }}>{money(log.ratePerPiece)}</td>
                      <td style={{ padding: '13px 14px', textAlign: 'right', fontWeight: 800 }}>{money(log.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="daily-iron-section" style={{ borderBottom: 'none' }}>
          <h2 style={{ margin: '0 0 14px', color: '#023c62', fontSize: 18 }}>Monthly Bills</h2>
          {!bills.length ? (
            <div style={{ color: '#9dafc8', fontSize: 14 }}>No monthly bill generated yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {bills.map((bill: any) => {
                const balance = Math.max(0, Number(bill.totalAmount || 0) - Number(bill.paidAmount || 0))
                return (
                  <div key={bill.id} style={{ border: '1px solid #edf3f8', borderRadius: 10, padding: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#142033' }}>{monthLabel(bill.billingPeriodStart)}</div>
                      <div style={{ color: '#6b7fa3', fontSize: 12, marginTop: 3 }}>{bill.totalPieces} pieces · {bill.status}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 900, color: '#023c62' }}>{money(bill.totalAmount)}</div>
                      <div style={{ color: balance > 0 ? '#991b1b' : '#166534', fontSize: 12, marginTop: 3 }}>Balance {money(balance)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
