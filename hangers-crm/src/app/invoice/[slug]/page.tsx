import { LOGO_BLUE_URL, LOGO_WHITE_URL } from '@/lib/branding'
import { Fragment } from 'react'

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
  return payload?.data?.paymentSummary
    ? { kind: 'PAYMENT_SUMMARY', paymentSummary: payload.data.paymentSummary }
    : payload?.data?.invoice
      ? { kind: 'INVOICE', invoice: payload.data.invoice }
      : payload?.invoice
        ? { kind: 'INVOICE', invoice: payload.invoice }
        : null
}

const sourceLabel = (sourceType: string) => {
  if (sourceType === 'FIELD_SERVICE') return 'Sofa Cleaning'
  if (sourceType === 'DAILY_IRON') return 'Daily Iron'
  return 'Order'
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const loaded = await loadInvoice(slug)

  if (!loaded) {
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

  if (loaded.kind === 'PAYMENT_SUMMARY') {
    const summary = loaded.paymentSummary
    const rows = summary?.receivables || []
    return (
      <main className="public-invoice-page" style={{ minHeight: '100vh', background: '#f4f7fb', padding: '28px 16px 48px', fontFamily: 'var(--crm-font-ui)', color: '#1a2332' }}>
        <style>{`
          .summary-shell { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #d7e4ee; border-radius: 16px; overflow: hidden; box-shadow: 0 18px 45px rgba(2,60,98,0.08); }
          .summary-header { padding: 24px 26px; background: linear-gradient(135deg, #022d4d 0%, #023c62 58%, #2a6b97 100%); color: #fff; display: flex; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
          .summary-logo { height: 42px; object-fit: contain; margin-bottom: 12px; }
          .summary-card { min-width: 230px; padding: 14px 16px; border: 1px solid rgba(255,255,255,0.16); border-radius: 14px; background: rgba(255,255,255,0.12); text-align: right; }
          .summary-meta { padding: 22px 26px; display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; border-bottom: 1px solid #edf3f8; }
          .summary-meta-card { border: 1px solid #dce8f0; border-radius: 14px; padding: 14px 16px; background: #fff; }
          .summary-label { color: #7d91a7; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
          .summary-value { margin-top: 6px; color: #182538; font-weight: 900; overflow-wrap: anywhere; }
          .summary-table-wrap { overflow-x: auto; padding: 22px 26px 26px; }
          .summary-detail-row { background: #fbfdff; }
          .summary-detail-box { margin: 0 16px 14px; border: 1px solid #e3edf6; border-radius: 12px; overflow: hidden; }
          .summary-detail-line { display: grid; grid-template-columns: minmax(0, 1fr) 70px 90px 100px; gap: 10px; align-items: center; padding: 10px 12px; border-top: 1px solid #edf3f8; font-size: 12.5px; }
          .summary-detail-line:first-child { border-top: 0; }
          .summary-detail-name { font-weight: 800; color: #24364b; overflow-wrap: anywhere; }
          .summary-detail-service { margin-top: 2px; color: #7b8ca8; font-size: 11px; font-weight: 600; }
          .summary-mobile { display: none; }
          @media (max-width: 640px) {
            main.public-invoice-page { padding: 12px 10px 28px !important; }
            .summary-shell { border-radius: 12px; }
            .summary-header { padding: 18px 16px; display: block; }
            .summary-card { text-align: left; margin-top: 16px; min-width: 0; }
            .summary-meta { padding: 16px; grid-template-columns: 1fr 1fr; gap: 10px; }
            .summary-table-wrap { display: none; }
            .summary-mobile { display: grid; gap: 10px; padding: 14px; }
            .summary-item { border: 1px solid #e3edf6; border-radius: 10px; padding: 12px; background: #fff; }
            .summary-item-title { font-weight: 900; color: #023c62; overflow-wrap: anywhere; }
            .summary-item-sub { margin-top: 4px; color: #6b7fa3; font-size: 12px; }
            .summary-item-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
            .summary-item-metric { background: #f7fafc; border-radius: 8px; padding: 8px; min-width: 0; }
            .summary-item-lines { margin-top: 10px; border-top: 1px solid #edf3f8; padding-top: 8px; display: grid; gap: 7px; }
            .summary-item-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; font-size: 12px; }
          }
        `}</style>
        <section className="summary-shell">
          <header className="summary-header">
            <div>
              <img className="summary-logo" src={LOGO_WHITE_URL} alt="Hangers Clothes Spa" />
              <div style={{ color: '#dcecf9', fontSize: 13 }}>Premium garment care</div>
            </div>
            <div className="summary-card">
              <h1 style={{ margin: '0 0 6px', color: '#fff', fontSize: 27 }}>Outstanding Summary</h1>
              <div style={{ color: '#e8f5ff', fontWeight: 800 }}>{summary.invoiceCount || 0} open bills/orders</div>
              <div style={{ marginTop: 10, fontSize: 24, fontWeight: 900 }}>{money(summary?.totals?.balanceDue)}</div>
            </div>
          </header>

          <div className="summary-meta">
            <div className="summary-meta-card">
              <div className="summary-label">Customer</div>
              <div className="summary-value">{summary.customer?.name || 'Customer'}</div>
              <div style={{ color: '#6b7fa3', fontSize: 13, marginTop: 3 }}>{summary.customer?.phone ? `+91 ${String(summary.customer.phone).replace(/^91/, '')}` : '—'}</div>
            </div>
            <div className="summary-meta-card">
              <div className="summary-label">Total Billed</div>
              <div className="summary-value">{money(summary?.totals?.totalAmount)}</div>
            </div>
            <div className="summary-meta-card">
              <div className="summary-label">Paid</div>
              <div className="summary-value" style={{ color: '#15803d' }}>{money(summary?.totals?.paidAmount)}</div>
            </div>
            <div className="summary-meta-card">
              <div className="summary-label">Balance Due</div>
              <div className="summary-value" style={{ color: '#b91c1c' }}>{money(summary?.totals?.balanceDue)}</div>
            </div>
          </div>

          <div className="summary-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 680, border: '1px solid #dce8f0', borderRadius: 14, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#f4f8fb', color: '#476581', textAlign: 'left', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  <th style={{ padding: '13px 16px' }}>Bill / Order</th>
                  <th style={{ padding: '13px 16px' }}>Type</th>
                  <th style={{ padding: '13px 16px' }}>Due Date</th>
                  <th style={{ padding: '13px 16px', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '13px 16px', textAlign: 'right' }}>Paid</th>
                  <th style={{ padding: '13px 16px', textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item: any) => (
                  <Fragment key={item.invoiceId}>
                    <tr style={{ borderTop: '1px solid #edf3f8' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 900, color: '#023c62' }}>{item.sourceNumber || item.invoiceNumber}</td>
                      <td style={{ padding: '14px 16px', color: '#52647e', fontWeight: 700 }}>{sourceLabel(item.sourceType)}</td>
                      <td style={{ padding: '14px 16px', color: '#6b7fa3' }}>{dateLabel(item.dueDate)}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>{money(item.totalAmount)}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', color: '#15803d' }}>{money(item.paidAmount)}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900, color: '#b91c1c' }}>{money(item.balanceDue)}</td>
                    </tr>
                    <tr className="summary-detail-row">
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div className="summary-detail-box">
                          {(item.items || []).map((line: any, index: number) => (
                            <div className="summary-detail-line" key={`${item.invoiceId}-line-${index}`}>
                              <div>
                                <div className="summary-detail-name">{line.serviceName || line.garmentType || 'Service'}</div>
                                <div className="summary-detail-service">{line.garmentType && line.garmentType !== line.serviceName ? line.garmentType : sourceLabel(item.sourceType)}</div>
                              </div>
                              <div style={{ textAlign: 'right', fontWeight: 800 }}>Qty {line.quantity}</div>
                              <div style={{ textAlign: 'right', color: '#52647e' }}>{money(line.unitPrice)}</div>
                              <div style={{ textAlign: 'right', fontWeight: 900 }}>{money(line.subtotal)}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="summary-mobile">
            {rows.map((item: any) => (
              <article className="summary-item" key={`${item.invoiceId}-mobile`}>
                <div className="summary-item-title">{item.sourceNumber || item.invoiceNumber}</div>
                <div className="summary-item-sub">{sourceLabel(item.sourceType)} · Due {dateLabel(item.dueDate)}</div>
                <div className="summary-item-grid">
                  <div className="summary-item-metric"><div className="summary-label">Total</div><div className="summary-value">{money(item.totalAmount)}</div></div>
                  <div className="summary-item-metric"><div className="summary-label">Paid</div><div className="summary-value" style={{ color: '#15803d' }}>{money(item.paidAmount)}</div></div>
                  <div className="summary-item-metric"><div className="summary-label">Balance</div><div className="summary-value" style={{ color: '#b91c1c' }}>{money(item.balanceDue)}</div></div>
                </div>
                <div className="summary-item-lines">
                  {(item.items || []).map((line: any, index: number) => (
                    <div className="summary-item-line" key={`${item.invoiceId}-mobile-line-${index}`}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: '#24364b', overflowWrap: 'anywhere' }}>{line.serviceName || line.garmentType || 'Service'}</div>
                        <div style={{ color: '#7b8ca8', marginTop: 2 }}>{line.garmentType && line.garmentType !== line.serviceName ? line.garmentType : sourceLabel(item.sourceType)}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 900 }}>{line.quantity} x {money(line.unitPrice)}<br /><span style={{ color: '#b91c1c' }}>{money(line.subtotal)}</span></div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <p style={{ margin: 0, padding: '0 26px 24px', color: '#6b7fa3', fontSize: 12, lineHeight: 1.6 }}>This summary shows currently unpaid bills and orders in your Hangers Clothes Spa account.</p>
        </section>
      </main>
    )
  }

  const invoice = loaded.invoice

  const rows = [
    ['Subtotal', money(invoice.subtotal)],
    ['Discount', `-${money(Number(invoice.discount || 0) + Number(invoice.couponDiscount || 0))}`],
    ['Upcharge', money(invoice.upcharge)],
    ['Total', money(invoice.totalAmount)],
    ['Paid', money(invoice.paidAmount)],
    ['Balance Due', money(invoice.balanceDue)],
  ]

  const itemDetail = (item: any) => {
    const variant = invoice.invoiceType === 'IRON_BILL' ? dateLabel(item.variant) : item.variant
    return `${item.serviceName}${variant && variant !== '—' ? ` · ${variant}` : ''}`
  }

  return (
    <main className="public-invoice-page" style={{ minHeight: '100vh', background: '#f4f7fb', padding: '28px 16px 48px', fontFamily: 'var(--crm-font-ui)', color: '#1a2332' }}>
      <style>{`
        .public-invoice-shell {
          max-width: 860px;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #d7e4ee;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 45px rgba(2,60,98,0.08);
        }
        .public-invoice-header {
          padding: 24px 26px;
          background: linear-gradient(135deg, #022d4d 0%, #023c62 58%, #2a6b97 100%);
          color: #fff;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
        }
        .public-invoice-logo {
          height: 42px;
          object-fit: contain;
          margin-bottom: 12px;
        }
        .public-invoice-kicker {
          color: #dcecf9;
          font-size: 13px;
        }
        .public-invoice-summary-card {
          min-width: 220px;
          padding: 14px 16px;
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 14px;
          background: rgba(255,255,255,0.12);
        }
        .public-invoice-status-pill {
          margin-top: 8px;
          display: inline-block;
          padding: 5px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.14);
          color: #fff;
          font-size: 12px;
          font-weight: 800;
        }
        .public-invoice-meta {
          padding: 26px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 18px;
          border-bottom: 1px solid #edf3f8;
        }
        .public-invoice-meta-card {
          border: 1px solid #dce8f0;
          border-radius: 14px;
          padding: 14px 16px;
          background: #fff;
        }
        .public-invoice-meta-label {
          color: #7d91a7;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .public-invoice-meta-value {
          margin-top: 6px;
          color: #182538;
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .public-invoice-table-wrap {
          overflow-x: auto;
          padding: 0 26px 24px;
        }
        .public-invoice-section-title {
          padding: 24px 26px 12px;
          color: #023c62;
          font-size: 13px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .public-invoice-mobile-items { display: none; }
        .public-invoice-footer {
          padding: 26px;
          display: flex;
          justify-content: flex-end;
          border-top: 1px solid #edf3f8;
          background: #fbfdff;
        }
        .public-invoice-total-card {
          width: 100%;
          max-width: 360px;
          border: 1px solid #dce8f0;
          border-radius: 14px;
          overflow: hidden;
          background: #fff;
        }
        .public-invoice-total-row {
          display: flex;
          justify-content: space-between;
          padding: 11px 14px;
          border-bottom: 1px solid #edf3f8;
          font-weight: 700;
          color: #53657d;
        }
        .public-invoice-total-row:last-child {
          border-bottom: 0;
        }
        .public-invoice-total-row.strong {
          background: #023c62;
          color: #fff;
          font-weight: 900;
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
            <img className="public-invoice-logo" src={LOGO_WHITE_URL} alt="Hangers Clothes Spa" />
            <div className="public-invoice-kicker">Premium garment care</div>
          </div>
          <div className="public-invoice-header-summary public-invoice-summary-card" style={{ textAlign: 'right' }}>
            <h1 style={{ margin: '0 0 6px', color: '#fff', fontSize: 28 }}>Invoice</h1>
            <div style={{ fontFamily: 'var(--crm-font-mono)', color: '#e8f5ff', fontWeight: 800 }}>{invoice.orderNumber}</div>
            <div className="public-invoice-status-pill">{invoice.paymentStatus}</div>
          </div>
        </header>

        <div className="public-invoice-meta">
          <div className="public-invoice-meta-card">
            <div className="public-invoice-meta-label">Customer</div>
            <div className="public-invoice-meta-value">{invoice.customer?.name || 'Customer'}</div>
            <div style={{ color: '#6b7fa3', fontSize: 13, marginTop: 3 }}>{invoice.customer?.phone ? `+91 ${String(invoice.customer.phone).replace(/^91/, '')}` : '—'}</div>
          </div>
          <div className="public-invoice-meta-card">
            <div className="public-invoice-meta-label">Order Date</div>
            <div className="public-invoice-meta-value">{dateLabel(invoice.createdAt)}</div>
          </div>
          <div className="public-invoice-meta-card">
            <div className="public-invoice-meta-label">Expected Delivery</div>
            <div className="public-invoice-meta-value">{dateLabel(invoice.deliveryDate)}</div>
          </div>
          <div className="public-invoice-meta-card">
            <div className="public-invoice-meta-label">Status</div>
            <div className="public-invoice-meta-value">{invoice.status}</div>
          </div>
        </div>

        <div className="public-invoice-section-title">Garments / Service</div>
        <div className="public-invoice-table-wrap">
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 620, border: '1px solid #dce8f0', borderRadius: 14, overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#f4f8fb', color: '#476581', textAlign: 'left', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' }}>
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
                  <td style={{ padding: '14px 18px', color: '#6b7fa3' }}>{itemDetail(item)}</td>
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
              <div className="public-invoice-item-service">{itemDetail(item)}</div>
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
          <div className="public-invoice-total-card">
            {rows.map(([label, value]) => (
              <div key={label} className={`public-invoice-total-row ${label === 'Total' || label === 'Balance Due' ? 'strong' : ''}`}>
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </footer>
        <p style={{ margin: 0, padding: '0 26px 24px', color: '#6b7fa3', fontSize: 12, lineHeight: 1.6 }}>Thank you for choosing Hangers Clothes Spa.</p>
      </section>
    </main>
  )
}
