import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LOGO_BLUE_URL } from '@/lib/branding'
import InvoicePaymentButton from '../InvoicePaymentButton'
import CustomCheckoutFlow from './CustomCheckoutFlow'
import styles from './page.module.css'
import { checkoutAvailability } from './availability'

export const dynamic = 'force-dynamic'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'
const SERVER_API_BASE_URL = process.env.CRM_SERVER_API_URL || API_BASE_URL
const money = (value: unknown) => {
  const amount = Number(value)
  return value == null || !Number.isFinite(amount) ? 'Unavailable' : new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Math.round(amount * 100) / 100)
}

async function loadInvoice(slug: string) {
  try {
    const response = await fetch(`${SERVER_API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}`, {
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    })
    if (response.status === 404) return null
    if (!response.ok) return { kind: 'unavailable' as const }
    const payload = await response.json()
    if (payload?.data?.paymentSummary) return { kind: 'summary' as const, data: payload.data.paymentSummary }
    const invoice = payload?.data?.invoice || payload?.invoice
    return invoice ? { kind: 'invoice' as const, data: invoice } : { kind: 'unavailable' as const }
  } catch {
    return { kind: 'unavailable' as const }
  }
}

export default async function PublicInvoiceCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ scope?: string; invoiceId?: string }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const retryParams = new URLSearchParams()
  if (query.scope) retryParams.set('scope', query.scope)
  if (query.invoiceId) retryParams.set('invoiceId', query.invoiceId)
  const retryHref = `/invoice/${encodeURIComponent(slug)}/checkout${retryParams.size ? `?${retryParams}` : ''}`
  const result = await loadInvoice(slug)
  if (!result) notFound()
  if (result.kind === 'unavailable') return (
    <main className={styles.page}>
      <header className={styles.topbar}><img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" /></header>
      <div className={styles.layout}>
        <section className={styles.main} role="status">
          <div className={styles.heading}>
            <h1>Payment details temporarily unavailable</h1>
            <p>We could not load this invoice. No new payment has been started. Please retry before paying.</p>
          </div>
          <Link className={styles.back} href={retryHref}>Retry loading checkout</Link>
          <br />
          <Link className={styles.back} href={`/invoice/${encodeURIComponent(slug)}`}>Back to invoice details</Link>
        </section>
      </div>
    </main>
  )

  const outstanding = result.kind === 'summary'
  const invoice = result.kind === 'invoice' ? result.data : null
  const summary = result.kind === 'summary' ? result.data : null
  const items = summary?.receivables || []
  const balance = outstanding ? summary?.totals?.balanceDue : invoice?.balanceDue
  const amount = Number(balance)
  const availability = balance == null ? 'UNAVAILABLE' : checkoutAvailability(balance, invoice?.status, outstanding)
  const payable = availability === 'PAYABLE'
  let confirmed = availability === 'PAID'
  const invoiceId = outstanding
    ? items[0]?.invoiceId || query.invoiceId
    : invoice?.id
  if (availability === 'NO_BALANCE' && invoiceId) {
    try {
      const statusQuery = new URLSearchParams({ invoiceId, checkoutIntegration: 'CUSTOM' })
      const response = await fetch(`${SERVER_API_BASE_URL}/public/invoices/${encodeURIComponent(slug)}/payment/status?${statusQuery}`, {
        cache: 'no-store', signal: AbortSignal.timeout(15000),
      })
      if (response.ok) {
        const payload = await response.json()
        confirmed = payload?.data?.status === 'CAPTURED'
      }
    } catch {
      // A zero balance alone does not establish a captured checkout payment.
    }
  }
  const noPaymentRequired = confirmed || availability === 'NO_BALANCE'
  const invoiceNumber = outstanding ? undefined : invoice?.invoiceNumber
  const orderNumber = outstanding ? undefined : invoice?.orderNumber
  const customerName = summary?.customer?.name || invoice?.customer?.name
  const customerPhone = summary?.customer?.phone || invoice?.customer?.phone
  const title = outstanding ? 'Pay open invoices' : `Invoice ${invoiceNumber || ''}`
  const backHref = `/invoice/${encodeURIComponent(slug)}`
  let supportPhone: string | undefined
  try {
    const response = await fetch(`${SERVER_API_BASE_URL}/public/site-profile`, {
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    })
    if (response.ok) {
      const payload = await response.json()
      const phone = payload?.data?.profile?.phone || payload?.profile?.phone
      if (typeof phone === 'string' && /^\+?[\d\s()-]+$/.test(phone) && phone.replace(/\D/g, '').length >= 7) supportPhone = phone
    }
  } catch {
    // Missing business contact must not produce a fabricated help destination.
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href={backHref} aria-label="Back to invoice"><img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" /></Link>
        <span>Invoice payment</span>
      </header>
      <div className={styles.layout}>
        <section className={styles.main}>
          <nav className={styles.steps} aria-label="Checkout progress">
            <Link className={styles.complete} href={backHref}>1 <b>Invoice</b></Link><i aria-hidden="true" />
            <span className={confirmed ? styles.complete : styles.active} aria-current={!confirmed ? 'step' : undefined}>2 <b>Payment</b></span><i aria-hidden="true" />
            <span className={confirmed ? styles.active : undefined} aria-current={confirmed ? 'step' : undefined}>3 <b>Confirmation</b></span>
          </nav>
          <div className={styles.heading}>
            <h1>{confirmed ? outstanding ? 'Payment received' : 'Invoice paid' : availability === 'NO_BALANCE' ? 'No balance due' : payable ? 'Complete your payment' : 'Online payment unavailable'}</h1>
            <p>{noPaymentRequired ? 'No further payment is required for this balance. View the invoice details below.' : payable ? 'Choose a payment method for your Hangers service invoices. Payment is processed by Razorpay.' : availability === 'CANCELLED' ? 'This invoice is cancelled and cannot accept payment.' : availability === 'BELOW_MINIMUM' ? 'This balance is below the online payment minimum. Refer to your invoice for settlement details.' : 'We could not establish a valid payable balance. Please check the invoice before paying.'}</p>
          </div>
          {(payable || (noPaymentRequired && invoiceId)) && process.env.NEXT_PUBLIC_RAZORPAY_CUSTOM_CHECKOUT === 'true' ? <CustomCheckoutFlow
            slug={slug} invoiceId={invoiceId} invoiceNumber={invoiceNumber} orderNumber={orderNumber}
            amountPaise={Math.round(amount * 100)} customerName={customerName} customerPhone={customerPhone} outstanding={outstanding}
            paymentAllowed={payable}
          /> : payable && <InvoicePaymentButton
            key={`${slug}-${outstanding ? 'outstanding' : 'invoice'}`}
            slug={slug}
            invoiceId={invoiceId}
            invoiceNumber={invoiceNumber}
            orderNumber={orderNumber}
            balanceDue={amount}
            customerName={customerName}
            customerPhone={customerPhone}
            enabled
            {...(outstanding ? { paymentScope: 'CUSTOMER_OUTSTANDING' as const } : {})}
            checkoutPage
          />}
          <Link className={styles.back} href={backHref}>{noPaymentRequired ? 'View invoice details' : 'Back to invoice details'}</Link>
          {supportPhone && <p><a className={styles.back} href={`tel:${supportPhone.replace(/[^+\d]/g, '')}`}>Contact Hangers: {supportPhone}</a></p>}
        </section>
        <aside className={styles.summary} aria-label="Payment summary">
          <h2>Payment summary</h2>
          <p className={styles.customer}>{customerName || 'Customer'}</p>
          {outstanding ? <>
            <p className={styles.reference}>{items.length} {items.length === 1 ? 'invoice' : 'invoices'} in this balance</p>
            <details className={styles.split}>
            <summary>View invoice split</summary>
            <ul className={styles.items}>
              {items.map((item: any) => <li key={item.invoiceId}><span>{item.invoiceNumber && <>Invoice {item.invoiceNumber}<br /></>}{item.sourceNumber && <>Order {item.sourceNumber}</>}{!item.invoiceNumber && !item.sourceNumber && 'Invoice reference unavailable'}</span><b>{money(item.balanceDue)}</b></li>)}
            </ul>
            </details>
          </> : <>
            {orderNumber && <p className={styles.reference}>Order {orderNumber}</p>}
            {invoiceNumber && <p className={styles.reference}>Invoice {invoiceNumber}</p>}
            <p className={styles.reference}>Hangers service invoice</p>
          </>}
          <div className={styles.total}><span>Total due</span><strong>{availability === 'UNAVAILABLE' ? 'Unavailable' : money(amount)}</strong></div>
          <p className={styles.secure}>Payment processed by Razorpay</p>
        </aside>
      </div>
      <footer className={styles.footer}>{title} · Hangers Clothes Spa</footer>
    </main>
  )
}
