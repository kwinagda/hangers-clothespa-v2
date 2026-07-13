import { LOGO_BLUE_URL } from '@/lib/branding'

export const dynamic = 'force-dynamic'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'

const money = (value: any) => `₹${Number(value || 0).toLocaleString('en-IN')}`

const dateLabel = (value: any) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function loadQuotation(slug: string) {
  const res = await fetch(`${API_BASE_URL}/public/quotations/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  const payload = await res.json()
  return payload?.data?.quotation || payload?.quotation || null
}

export default async function PublicQuotationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const quotation = await loadQuotation(slug)

  if (!quotation) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7fb', padding: 24, fontFamily: 'var(--crm-font-ui)' }}>
        <section style={{ width: '100%', maxWidth: 440, background: '#fff', border: '1px solid #e3edf6', borderRadius: 14, padding: 28, textAlign: 'center' }}>
          <img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" style={{ height: 42, objectFit: 'contain', marginBottom: 18 }} />
          <h1 style={{ margin: 0, color: '#142033', fontSize: 24 }}>Quotation not found</h1>
          <p style={{ color: '#6b7fa3', fontSize: 14, lineHeight: 1.6 }}>Please check the quotation link or contact Hangers Clothes Spa.</p>
        </section>
      </main>
    )
  }

  const rows = [
    ['Subtotal', money(quotation.subtotal)],
    ['Discount', `-${money(quotation.discount)}`],
    ['Total Estimate', money(quotation.totalAmount)],
  ]

  const itemDetail = (item: any) => `${item.serviceName}${item.variant ? ` · ${item.variant}` : ''}`

  return (
    <main className="public-quotation-page" style={{ minHeight: '100vh', background: '#f4f7fb', padding: '28px 16px 48px', fontFamily: 'var(--crm-font-ui)', color: '#1a2332' }}>
      <style>{`
        .public-quotation-shell {
          max-width: 860px;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #dbe8f2;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 45px rgba(2,60,98,0.08);
        }
        .public-quotation-header {
          padding: 24px 26px;
          border-bottom: 1px solid #edf3f8;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
        }
        .public-quotation-meta {
          padding: 26px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 18px;
          border-bottom: 1px solid #edf3f8;
        }
        .public-quotation-table-wrap { overflow-x: auto; }
        .public-quotation-mobile-items { display: none; }
        .public-quotation-footer {
          padding: 26px;
          display: flex;
          justify-content: flex-end;
        }
        @media (max-width: 640px) {
          main.public-quotation-page { padding: 12px 10px 28px !important; }
          .public-quotation-shell { border-radius: 12px; }
          .public-quotation-header { padding: 18px 16px; display: block; }
          .public-quotation-header-summary { text-align: left !important; margin-top: 16px; }
          .public-quotation-meta { padding: 16px; grid-template-columns: 1fr 1fr; gap: 14px; }
          .public-quotation-table-wrap { display: none; }
          .public-quotation-mobile-items {
            display: grid;
            gap: 10px;
            padding: 14px;
            border-bottom: 1px solid #edf3f8;
          }
          .public-quotation-item-card {
            border: 1px solid #e3edf6;
            border-radius: 10px;
            padding: 12px;
            background: #fff;
          }
          .public-quotation-item-title {
            font-weight: 800;
            color: #142033;
            line-height: 1.35;
            overflow-wrap: anywhere;
          }
          .public-quotation-item-service {
            margin-top: 4px;
            color: #6b7fa3;
            font-size: 12.5px;
            line-height: 1.4;
            overflow-wrap: anywhere;
          }
          .public-quotation-item-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin-top: 12px;
          }
          .public-quotation-item-metric {
            background: #f7fafc;
            border-radius: 8px;
            padding: 8px;
            min-width: 0;
          }
          .public-quotation-item-label {
            color: #6b7fa3;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            white-space: nowrap;
          }
          .public-quotation-item-value {
            margin-top: 4px;
            color: #023c62;
            font-weight: 800;
            font-size: 12.5px;
            white-space: nowrap;
          }
          .public-quotation-footer { padding: 16px; }
        }
      `}</style>
      <section className="public-quotation-shell">
        <header className="public-quotation-header">
          <div>
            <img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" style={{ height: 42, objectFit: 'contain', marginBottom: 12 }} />
            <div style={{ color: '#6b7fa3', fontSize: 13 }}>Premium garment care</div>
          </div>
          <div className="public-quotation-header-summary" style={{ textAlign: 'right' }}>
            <h1 style={{ margin: '0 0 6px', color: '#023c62', fontSize: 28 }}>Quotation</h1>
            <div style={{ fontFamily: 'var(--crm-font-mono)', color: '#023c62', fontWeight: 700 }}>{quotation.orderNumber}</div>
            <div style={{ marginTop: 8, display: 'inline-block', padding: '5px 10px', borderRadius: 999, background: '#eef6fb', color: '#023c62', fontSize: 12, fontWeight: 700 }}>{quotation.quotationStatus || 'DRAFT'}</div>
          </div>
        </header>

        <div className="public-quotation-meta">
          <div>
            <div style={{ color: '#6b7fa3', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Customer</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{quotation.customer?.name || 'Customer'}</div>
          </div>
          <div>
            <div style={{ color: '#6b7fa3', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Quotation Date</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{dateLabel(quotation.createdAt)}</div>
          </div>
          <div>
            <div style={{ color: '#6b7fa3', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Valid Until</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{dateLabel(quotation.validUntil)}</div>
          </div>
          <div>
            <div style={{ color: '#6b7fa3', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Estimated Total</div>
            <div style={{ marginTop: 6, fontWeight: 800, color: '#023c62' }}>{money(quotation.totalAmount)}</div>
          </div>
        </div>

        <div className="public-quotation-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr style={{ background: '#f7fafc', color: '#6b7fa3', textAlign: 'left', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                <th style={{ padding: '13px 18px' }}>Item</th>
                <th style={{ padding: '13px 18px' }}>Service</th>
                <th style={{ padding: '13px 18px', textAlign: 'right' }}>Qty</th>
                <th style={{ padding: '13px 18px', textAlign: 'right' }}>Rate</th>
                <th style={{ padding: '13px 18px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(quotation.items || []).map((item: any, index: number) => (
                <tr key={`${item.serviceName}-${item.garmentType}-${index}`} style={{ borderTop: '1px solid #edf3f8' }}>
                  <td style={{ padding: '14px 18px', fontWeight: 700 }}>{item.garmentType || item.serviceName}</td>
                  <td style={{ padding: '14px 18px', color: '#6b7fa3' }}>{itemDetail(item)}</td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>{item.quantity}</td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>{money(item.unitPrice)}</td>
                  <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700 }}>{money(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="public-quotation-mobile-items">
          {(quotation.items || []).map((item: any, index: number) => (
            <article className="public-quotation-item-card" key={`${item.serviceName}-${item.garmentType}-mobile-${index}`}>
              <div className="public-quotation-item-title">{item.garmentType || item.serviceName}</div>
              <div className="public-quotation-item-service">{itemDetail(item)}</div>
              <div className="public-quotation-item-grid">
                <div className="public-quotation-item-metric">
                  <div className="public-quotation-item-label">Qty</div>
                  <div className="public-quotation-item-value">{item.quantity}</div>
                </div>
                <div className="public-quotation-item-metric">
                  <div className="public-quotation-item-label">Rate</div>
                  <div className="public-quotation-item-value">{money(item.unitPrice)}</div>
                </div>
                <div className="public-quotation-item-metric">
                  <div className="public-quotation-item-label">Amount</div>
                  <div className="public-quotation-item-value">{money(item.subtotal)}</div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <footer className="public-quotation-footer">
          <div style={{ width: '100%', maxWidth: 360 }}>
            {rows.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #edf3f8', fontWeight: label === 'Total Estimate' ? 800 : 600, color: label === 'Total Estimate' ? '#023c62' : '#1a2332' }}>
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
            {quotation.notes && (
              <p style={{ margin: '18px 0 0', color: '#53657d', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{quotation.notes}</p>
            )}
            <p style={{ margin: '18px 0 0', color: '#6b7fa3', fontSize: 12, lineHeight: 1.6 }}>This quotation is an estimate and may change after garment inspection. Thank you for choosing Hangers Clothes Spa.</p>
          </div>
        </footer>
      </section>
    </main>
  )
}
