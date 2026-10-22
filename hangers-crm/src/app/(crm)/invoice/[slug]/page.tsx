import { LOGO_BLUE_URL, LOGO_WHITE_URL } from '@/lib/branding'
import InvoicePaymentButton from './InvoicePaymentButton'
import CallbackDiagnostic from './CallbackDiagnostic'

export const dynamic = 'force-dynamic'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api/v1'
const SERVER_API_BASE_URL = process.env.CRM_SERVER_API_URL || API_BASE_URL

const money = (value: unknown) => {
  if (value == null || value === '') return 'Unavailable'
  const amount = Number(value)
  return Number.isFinite(amount) ? `₹${amount.toLocaleString('en-IN')}` : 'Unavailable'
}

const customerPhoneLabel = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return 'Unavailable'
  const display = String(value).trim()
  if (!display) return 'Unavailable'
  if (display.startsWith('+91')) return display
  const digits = display.replace(/\D/g, '')
  if (digits.length === 10) return `+91 ${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2)}`
  return display
}

const dateLabel = (value: any) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function loadInvoice(slug: string) {
  try {
    const res = await fetch(`${SERVER_API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    })
    if (res.status === 404) return null
    if (!res.ok) return { kind: 'UNAVAILABLE' as const }
    const payload = await res.json()
    return payload?.data?.paymentSummary
      ? { kind: 'PAYMENT_SUMMARY' as const, paymentSummary: payload.data.paymentSummary }
      : payload?.data?.invoice
        ? { kind: 'INVOICE' as const, invoice: payload.data.invoice }
        : payload?.invoice
          ? { kind: 'INVOICE' as const, invoice: payload.invoice }
          : null
  } catch {
    return { kind: 'UNAVAILABLE' as const }
  }
}

const LegalTerms = ({ terms }: { terms: any }) => {
  const sections = Array.isArray(terms?.sections) ? terms.sections : []
  if (!sections.length) return null
  return (
    <section className="public-legal-terms">
      <h2>{terms.title || 'Terms and Conditions'}</h2>
      <div className="public-legal-grid">
        {sections.map((section: any, index: number) => (
          <div className="public-legal-item" key={`${section.title || 'term'}-${index}`}>
            <b>{index + 1}. {section.title}</b>
            <p>{section.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const loaded = await loadInvoice(slug)

  if (!loaded || loaded.kind === 'UNAVAILABLE') {
    const unavailable = loaded?.kind === 'UNAVAILABLE'
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7fb', padding: 24, fontFamily: 'var(--crm-font-ui)' }}>
        <section style={{ width: '100%', maxWidth: 440, background: '#fff', border: '1px solid #e3edf6', borderRadius: 14, padding: 28, textAlign: 'center' }}>
          <img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" style={{ height: 42, objectFit: 'contain', marginBottom: 18 }} />
          <h1 style={{ margin: 0, color: '#142033', fontSize: 24 }}>{unavailable ? 'Invoice temporarily unavailable' : 'Invoice not found'}</h1>
          <p style={{ color: '#6b7fa3', fontSize: 14, lineHeight: 1.6 }}>{unavailable ? 'We could not load this invoice right now. Please try again shortly. If the problem continues, contact Hangers Clothes Spa.' : 'Please check the invoice link or contact Hangers Clothes Spa.'}</p>
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
          .summary-receivables { padding: 8px 26px 24px; }
          .summary-receivable-head, .summary-receivable { display: grid; grid-template-columns: minmax(180px, 1.4fr) minmax(95px, .7fr) minmax(110px, .8fr) minmax(110px, .8fr); gap: 12px; align-items: center; }
          .summary-receivable-head { padding: 12px 14px; color: #476581; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
          .summary-receivable { padding: 16px 14px; border-top: 1px solid #edf3f8; }
          .summary-receivable-main { min-width: 0; }
          .summary-receivable-title { color: #023c62; font-weight: 900; overflow-wrap: anywhere; }
          .summary-receivable-sub { color: #6b7fa3; font-size: 12px; margin-top: 3px; }
          .summary-receivable-amount { text-align: right; }
          .summary-receivable-balance { color: #b91c1c; font-weight: 900; text-align: right; }
          .summary-receivable-lines { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; padding-top: 10px; }
          .summary-receivable-line { min-width: 0; padding: 9px 10px; background: #f7fafc; border-radius: 8px; }
          .summary-detail-name { font-weight: 800; color: #24364b; overflow-wrap: anywhere; }
          .summary-detail-service { margin-top: 2px; color: #7b8ca8; font-size: 11px; font-weight: 600; }
          .public-legal-terms { margin: 0 26px 24px; border: 1px solid #dce8f0; border-radius: 14px; background: #fbfdff; padding: 18px; }
          .public-legal-terms h2 { margin: 0 0 12px; color: #023c62; font-size: 16px; font-weight: 900; }
          .public-legal-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
          .public-legal-item b { display: block; color: #24364b; font-size: 12px; margin-bottom: 3px; }
          .public-legal-item p { margin: 0; color: #52647e; font-size: 11.5px; line-height: 1.48; }
          @media (max-width: 640px) {
            main.public-invoice-page { padding: 12px 10px 28px !important; }
            .summary-shell { border-radius: 12px; }
            .summary-header { padding: 18px 16px; display: block; }
            .summary-card { text-align: left; margin-top: 16px; min-width: 0; }
            .summary-meta { padding: 16px; grid-template-columns: 1fr 1fr; gap: 10px; }
            .summary-receivables { padding: 4px 14px 18px; }
            .summary-receivable-head { display: none; }
            .summary-receivable { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; align-items: start; padding: 14px 4px; }
            .summary-receivable-main, .summary-receivable-pay, .summary-receivable-lines { grid-column: 1 / -1; }
            .summary-receivable-amount, .summary-receivable-balance { text-align: left; }
            .summary-receivable-amount::before, .summary-receivable-balance::before { content: attr(data-label); display: block; color: #7d91a7; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 3px; }
            .summary-receivable-lines { grid-template-columns: 1fr; }
            .public-legal-terms { margin: 0 14px 16px; padding: 14px; }
            .public-legal-grid { grid-template-columns: 1fr; gap: 10px; }
          }
          @media (max-width: 380px) {
            main.public-invoice-page { padding: 0 !important; }
            .summary-shell { border: 0; border-radius: 0; box-shadow: none; }
            .summary-meta { grid-template-columns: 1fr 1fr; }
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
              <div style={{ color: '#e8f5ff', fontWeight: 800 }}>{summary.invoiceCount ?? 'Unavailable'} open bills/orders</div>
              <div style={{ marginTop: 10, fontSize: 24, fontWeight: 900 }}>{money(summary?.totals?.balanceDue)}</div>
            </div>
          </header>

          <div className="summary-meta">
            <div className="summary-meta-card">
              <div className="summary-label">Customer</div>
              <div className="summary-value">{summary.customer?.name || 'Unavailable'}</div>
              <div style={{ color: '#6b7fa3', fontSize: 13, marginTop: 3 }}>{customerPhoneLabel(summary.customer?.phone)}</div>
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

          <div style={{ padding: '0 26px 18px' }}>
            <CallbackDiagnostic />
            {rows.length > 0 && <InvoicePaymentButton
              slug={slug}
              invoiceId={rows[0].invoiceId}
              balanceDue={Number(summary?.totals?.balanceDue)}
              customerName={summary.customer?.name}
              customerPhone={summary.customer?.phone}
              paymentScope="CUSTOMER_OUTSTANDING"
            />}
          </div>
          <section className="summary-receivables" aria-label="Unpaid invoices">
            <div className="summary-receivable-head" aria-hidden="true">
              <div>Bill / Order</div><div>Due</div><div style={{ textAlign: 'right' }}>Total / Paid</div><div style={{ textAlign: 'right' }}>Balance due</div>
            </div>
            {rows.map((item: any) => (
              <article className="summary-receivable" key={item.invoiceId}>
                <div className="summary-receivable-main">
                  <div className="summary-receivable-title">{item.sourceNumber || item.invoiceNumber}</div>
                  {item.invoiceNumber && <div className="summary-receivable-sub">Invoice {item.invoiceNumber}</div>}
                </div>
                <div className="summary-receivable-sub">{dateLabel(item.dueDate)}</div>
                <div className="summary-receivable-amount" data-label="Total / Paid">{money(item.totalAmount)} <span style={{ color: '#15803d' }}>· {money(item.paidAmount)} paid</span></div>
                <div className="summary-receivable-balance" data-label="Balance due">{money(item.balanceDue)}</div>
                {!!item.items?.length && <div className="summary-receivable-lines">
                  {item.items.map((line: any, index: number) => (
                    <div className="summary-receivable-line" key={`${item.invoiceId}-line-${index}`}>
                      <div className="summary-detail-name">{line.serviceName || line.garmentType || 'Description unavailable'}</div>
                      <div className="summary-detail-service">{line.quantity} × {money(line.unitPrice)} · {money(line.subtotal)}</div>
                    </div>
                  ))}
                </div>}
              </article>
            ))}
          </section>

          <p style={{ margin: 0, padding: '0 26px 24px', color: '#6b7fa3', fontSize: 12, lineHeight: 1.6 }}>This summary shows currently unpaid bills and orders in your Hangers Clothes Spa account.</p>
          <LegalTerms terms={summary.legalTerms} />
        </section>
      </main>
    )
  }

  const invoice = loaded.invoice

  const discountAmount = [invoice.discount, invoice.couponDiscount].reduce((sum: number, value: unknown) => {
    if (value == null || value === '') return sum
    const amount = Number(value)
    return Number.isFinite(amount) ? sum + amount : sum
  }, 0)
  const upchargeAmount = invoice.upcharge == null || invoice.upcharge === '' ? 0 : Number(invoice.upcharge)
  const paidAmount = invoice.paidAmount == null || invoice.paidAmount === '' ? null : Number(invoice.paidAmount)
  const totalPieces = Number(invoice.totalPieces ?? (invoice.items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0))
  const rows = [
    ['Subtotal', money(invoice.subtotal)],
    ...(discountAmount > 0 ? [['Discount', `-${money(discountAmount)}`]] : []),
    ...(Number.isFinite(upchargeAmount) && upchargeAmount > 0 ? [['Upcharge', money(upchargeAmount)]] : []),
    ...(Number(invoice.taxAmount) > 0 ? [['Tax', money(invoice.taxAmount)]] : []),
    ['Total', money(invoice.totalAmount)],
    ...(paidAmount !== null && Number.isFinite(paidAmount) && paidAmount > 0 ? [['Paid', money(paidAmount)]] : []),
    ...(Number(invoice.creditAmount) > 0 ? [['Credit applied', money(invoice.creditAmount)]] : []),
    ['Balance Due', money(invoice.balanceDue)],
  ]

  const itemTitle = (item: any) => item.serviceName || item.garmentType || 'Description unavailable'
  const itemDetail = (item: any) => {
    const variant = invoice.invoiceType === 'IRON_BILL' ? dateLabel(item.variant) : item.variant
    const title = itemTitle(item)
    return `${title}${variant && variant !== '—' ? ` · ${variant}` : ''}`
  }
  const fulfillment = invoice.deliveryDate
    ? { label: 'Delivery date', value: dateLabel(invoice.deliveryDate) }
    : invoice.serviceDate ? { label: 'Service appointment', value: dateLabel(invoice.serviceDate) } : null

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
        .public-invoice-highlights {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border-bottom: 1px solid #dce8f0;
          background: #f8fbfd;
        }
        .public-invoice-highlight { padding: 16px 20px; border-right: 1px solid #dce8f0; min-width: 0; }
        .public-invoice-highlight:last-child { border-right: 0; }
        .public-invoice-highlight-label { color: #6b7fa3; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .07em; }
        .public-invoice-highlight-value { margin-top: 5px; color: #023c62; font-size: 20px; font-weight: 900; overflow-wrap: anywhere; }
        .public-invoice-highlight-value.due { color: #9f2d16; }
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
          padding: 24px 26px 28px;
          display: flex;
          justify-content: flex-end;
          border-top: 1px solid #edf3f8;
          background: #fbfdff;
        }
        .public-invoice-total-card {
          width: 100%;
          max-width: 340px;
          border: 1px solid #dce8f0;
          border-radius: 12px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 10px 28px rgba(2,60,98,0.06);
        }
        .public-invoice-total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          padding: 10px 14px;
          border-bottom: 1px solid #edf3f8;
          font-size: 13px;
          font-weight: 800;
          color: #53657d;
        }
        .public-invoice-total-row:last-child {
          border-bottom: 0;
        }
        .public-invoice-total-row.strong {
          background: #f3f8fc;
          color: #023c62;
          font-weight: 900;
        }
        .public-invoice-total-row.balance {
          background: #023c62;
          color: #fff;
          padding: 13px 14px;
          font-size: 15px;
        }
        .public-legal-terms { margin: 0 26px 24px; border: 1px solid #dce8f0; border-radius: 14px; background: #fbfdff; padding: 18px; }
        .public-legal-terms h2 { margin: 0 0 12px; color: #023c62; font-size: 16px; font-weight: 900; }
        .public-legal-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; }
        .public-legal-item b { display: block; color: #24364b; font-size: 12px; margin-bottom: 3px; }
        .public-legal-item p { margin: 0; color: #52647e; font-size: 11.5px; line-height: 1.48; }
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
            gap: 10px;
          }
          .public-invoice-highlights { grid-template-columns: 1fr 1fr; }
          .public-invoice-highlight { padding: 13px 14px; border-bottom: 1px solid #dce8f0; }
          .public-invoice-highlight:nth-child(2) { border-right: 0; }
          .public-invoice-highlight:nth-last-child(-n + 2) { border-bottom: 0; }
          .public-invoice-highlight-value { font-size: 17px; }
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
          .public-invoice-total-card { max-width: none; box-shadow: none; }
          .public-legal-terms { margin: 0 16px 16px; padding: 14px; }
          .public-legal-grid { grid-template-columns: 1fr; gap: 10px; }
        }
        @media (max-width: 380px) {
          main.public-invoice-page { padding: 0 !important; }
          .public-invoice-shell { border: 0; border-radius: 0; box-shadow: none; }
          .public-invoice-meta { grid-template-columns: 1fr; }
          .public-invoice-item-grid { gap: 5px; }
          .public-invoice-item-metric { padding: 7px 6px; }
          .public-invoice-item-value { font-size: 11.5px; }
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
            <div style={{ color: '#dcecf9', fontSize: 13, marginTop: 4 }}>Invoice {invoice.invoiceNumber || 'Unavailable'}</div>
            <div className="public-invoice-status-pill">{invoice.paymentStatus}</div>
          </div>
        </header>

        <div className="public-invoice-highlights">
          <div className="public-invoice-highlight">
            <div className="public-invoice-highlight-label">Items / units</div>
            <div className="public-invoice-highlight-value">{totalPieces}</div>
          </div>
          <div className="public-invoice-highlight">
            <div className="public-invoice-highlight-label">Invoice Total</div>
            <div className="public-invoice-highlight-value">{money(invoice.totalAmount)}</div>
          </div>
          <div className="public-invoice-highlight">
            <div className="public-invoice-highlight-label">Paid</div>
            <div className="public-invoice-highlight-value">{money(invoice.paidAmount)}</div>
          </div>
          <div className="public-invoice-highlight">
            <div className="public-invoice-highlight-label">Balance Due</div>
            <div className="public-invoice-highlight-value due">{money(invoice.balanceDue)}</div>
          </div>
        </div>

        <div className="public-invoice-meta">
          <div className="public-invoice-meta-card">
            <div className="public-invoice-meta-label">Customer</div>
            <div className="public-invoice-meta-value">{invoice.customer?.name || 'Unavailable'}</div>
            <div style={{ color: '#6b7fa3', fontSize: 13, marginTop: 3 }}>{customerPhoneLabel(invoice.customer?.phone)}</div>
          </div>
          <div className="public-invoice-meta-card">
            <div className="public-invoice-meta-label">Invoice Date</div>
            <div className="public-invoice-meta-value">{dateLabel(invoice.createdAt)}</div>
          </div>
          {fulfillment && <div className="public-invoice-meta-card">
            <div className="public-invoice-meta-label">{fulfillment.label}</div>
            <div className="public-invoice-meta-value">{fulfillment.value}</div>
          </div>}
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
                  <td style={{ padding: '14px 18px', fontWeight: 700 }}>{itemTitle(item)}</td>
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
              <div className="public-invoice-item-title">{itemTitle(item)}</div>
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
              <div key={label} className={`public-invoice-total-row ${label === 'Total' ? 'strong' : ''} ${label === 'Balance Due' ? 'balance' : ''}`}>
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </footer>
        <CallbackDiagnostic />
        <InvoicePaymentButton
          key={slug}
          slug={slug}
          invoiceNumber={invoice.invoiceNumber}
          orderNumber={invoice.orderNumber}
          balanceDue={Number(invoice.balanceDue || 0)}
          customerName={invoice.customer?.name}
          customerPhone={invoice.customer?.phone}
          enabled={String(invoice.status || '').toUpperCase() !== 'CANCELLED'}
        />
        <LegalTerms terms={invoice.legalTerms} />
        <p style={{ margin: 0, padding: '0 26px 24px', color: '#6b7fa3', fontSize: 12, lineHeight: 1.6 }}>Thank you for choosing Hangers Clothes Spa.</p>
      </section>
    </main>
  )
}
