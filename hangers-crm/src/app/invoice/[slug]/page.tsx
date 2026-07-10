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

async function loadInvoice(slug: string) {
  const res = await fetch(`${API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  const payload = await res.json()
  return payload?.data?.invoice || payload?.invoice || null
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const invoice = await loadInvoice(slug)

  if (!invoice) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7fb', padding: 24, fontFamily: 'var(--crm-font-ui)' }}>
        <section style={{ width: '100%', maxWidth: 440, background: '#fff', border: '1px solid #e3edf6', borderRadius: 14, padding: 28, textAlign: 'center' }}>
          <img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" style={{ height: 42, objectFit: 'contain', marginBottom: 18 }} />
          <h1 style={{ margin: 0, color: '#142033', fontSize: 24 }}>Invoice not found</h1>
          <p style={{ color: '#6b7fa3', fontSize: 14, lineHeight: 1.6 }}>Please check the invoice link or contact Hangers Clothes Spa.</p>
        </section>
      </main>
    )
  }

  const rows = [
    ['Subtotal', money(invoice.subtotal)],
    ['Discount', `-${money(Number(invoice.discount || 0) + Number(invoice.couponDiscount || 0))}`],
    ['Upcharge', money(invoice.upcharge)],
    ['Total', money(invoice.totalAmount)],
    ['Paid', money(invoice.paidAmount)],
    ['Balance Due', money(invoice.balanceDue)],
  ]

  return (
    <main className="public-invoice-page" style={{ minHeight: '100vh', background: '#f4f7fb', padding: '28px 16px 48px', fontFamily: 'var(--crm-font-ui)', color: '#1a2332' }}>
      <style>{`
        .public-invoice-shell {
          max-width: 860px;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #dbe8f2;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 45px rgba(2,60,98,0.08);
        }
        .public-invoice-header {
          padding: 24px 26px;
          border-bottom: 1px solid #edf3f8;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
        }
        .public-invoice-meta {
          padding: 26px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 18px;
          border-bottom: 1px solid #edf3f8;
        }
        .public-invoice-table-wrap { overflow-x: auto; }
        .public-invoice-mobile-items { display: none; }
        .public-invoice-footer {
          padding: 26px;
          display: flex;
          justify-content: flex-end;
        }
        @media (max-width: 640px) {
          main.public-invoice-page {
            padding: 12px 10px 28px !important;
          }
          .public-invoice-shell {
            border-radius: 12px;
          }
          .public-invoice-header {
            padding: 18px 16px;
            display: block;
          }
          .public-invoice-header-summary {
            text-align: left !important;
            margin-top: 16px;
          }
          .public-invoice-meta {
            padding: 16px;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
          }
          .public-invoice-table-wrap { display: none; }
          .public-invoice-mobile-items {
            display: grid;
            gap: 10px;
            padding: 14px;
            border-bottom: 1px solid #edf3f8;
          }
          .public-invoice-item-card {
            border: 1px solid #e3edf6;
            border-radius: 10px;
            padding: 12px;
            background: #fff;
          }
          .public-invoice-item-title {
            font-weight: 800;
            color: #142033;
            line-height: 1.35;
            overflow-wrap: anywhere;
          }
          .public-invoice-item-service {
            margin-top: 4px;
            color: #6b7fa3;
            font-size: 12.5px;
            line-height: 1.4;
            overflow-wrap: anywhere;
          }
          .public-invoice-item-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin-top: 12px;
          }
          .public-invoice-item-metric {
            background: #f7fafc;
            border-radius: 8px;
            padding: 8px;
            min-width: 0;
          }
          .public-invoice-item-label {
            color: #6b7fa3;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            white-space: nowrap;
          }
          .public-invoice-item-value {
            margin-top: 4px;
            color: #023c62;
            font-weight: 800;
            font-size: 12.5px;
            white-space: nowrap;
          }
          .public-invoice-footer {
            padding: 16px;
          }
        }
      `}</style>
      <section className="public-invoice-shell">
        <header className="public-invoice-header">
          <div>
            <img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" style={{ height: 42, objectFit: 'contain', marginBottom: 12 }} />
            <div style={{ color: '#6b7fa3', fontSize: 13 }}>Premium garment care</div>
          </div>
          <div className="public-invoice-header-summary" style={{ textAlign: 'right' }}>
            <h1 style={{ margin: '0 0 6px', color: '#023c62', fontSize: 28 }}>Invoice</h1>
            <div style={{ fontFamily: 'var(--crm-font-mono)', color: '#023c62', fontWeight: 700 }}>{invoice.orderNumber}</div>
            <div style={{ marginTop: 8, display: 'inline-block', padding: '5px 10px', borderRadius: 999, background: '#eef6fb', color: '#023c62', fontSize: 12, fontWeight: 700 }}>{invoice.paymentStatus}</div>
          </div>
        </header>

        <div className="public-invoice-meta">
          <div>
            <div style={{ color: '#6b7fa3', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Customer</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{invoice.customer?.name || 'Customer'}</div>
            <div style={{ color: '#6b7fa3', fontSize: 13 }}>{invoice.customer?.phone ? `+91 ${String(invoice.customer.phone).replace(/^91/, '')}` : '—'}</div>
          </div>
          <div>
            <div style={{ color: '#6b7fa3', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Order Date</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{dateLabel(invoice.createdAt)}</div>
          </div>
          <div>
            <div style={{ color: '#6b7fa3', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Expected Delivery</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{dateLabel(invoice.deliveryDate)}</div>
          </div>
          <div>
            <div style={{ color: '#6b7fa3', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Status</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>{invoice.status}</div>
          </div>
        </div>

        <div className="public-invoice-table-wrap">
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
              {(invoice.items || []).map((item: any, index: number) => (
                <tr key={`${item.serviceName}-${item.garmentType}-${index}`} style={{ borderTop: '1px solid #edf3f8' }}>
                  <td style={{ padding: '14px 18px', fontWeight: 700 }}>{item.garmentType || item.serviceName}</td>
                  <td style={{ padding: '14px 18px', color: '#6b7fa3' }}>{item.serviceName}{item.variant ? ` · ${item.variant}` : ''}</td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>{item.quantity}</td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>{money(item.unitPrice)}</td>
                  <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700 }}>{money(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="public-invoice-mobile-items">
          {(invoice.items || []).map((item: any, index: number) => (
            <article className="public-invoice-item-card" key={`${item.serviceName}-${item.garmentType}-mobile-${index}`}>
              <div className="public-invoice-item-title">{item.garmentType || item.serviceName}</div>
              <div className="public-invoice-item-service">{item.serviceName}{item.variant ? ` · ${item.variant}` : ''}</div>
              <div className="public-invoice-item-grid">
                <div className="public-invoice-item-metric">
                  <div className="public-invoice-item-label">Qty</div>
                  <div className="public-invoice-item-value">{item.quantity}</div>
                </div>
                <div className="public-invoice-item-metric">
                  <div className="public-invoice-item-label">Rate</div>
                  <div className="public-invoice-item-value">{money(item.unitPrice)}</div>
                </div>
                <div className="public-invoice-item-metric">
                  <div className="public-invoice-item-label">Amount</div>
                  <div className="public-invoice-item-value">{money(item.subtotal)}</div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <footer className="public-invoice-footer">
          <div style={{ width: '100%', maxWidth: 360 }}>
            {rows.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #edf3f8', fontWeight: label === 'Total' || label === 'Balance Due' ? 800 : 600, color: label === 'Balance Due' ? '#023c62' : '#1a2332' }}>
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
            <p style={{ margin: '18px 0 0', color: '#6b7fa3', fontSize: 12, lineHeight: 1.6 }}>Thank you for choosing Hangers Clothes Spa.</p>
          </div>
        </footer>
      </section>
    </main>
  )
}
