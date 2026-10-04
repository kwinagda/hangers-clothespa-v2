import { PolicyPage, type PolicySection } from '@/components/public/PolicyPage'
import { buildPublicMetadata } from '@/lib/seo'

const title = 'Cancellation and Refund Policy'
const description = 'How to cancel a Hangers pickup or garment-care service and how eligible payment refunds are reviewed and processed.'
export const metadata = buildPublicMetadata({ title: `${title} | Hangers Clothes Spa`, description, path: '/cancellation-refund' })

const sections: PolicySection[] = [
  { title: 'What can be cancelled', paragraphs: ['A website pickup request is free and is not a confirmed service order until our team contacts you and confirms availability. You can withdraw an unconfirmed request by calling or messaging us. If a pickup or service has already been confirmed, contact us as soon as possible using the details on our Contact Us page and include your order or invoice number.'] },
  { title: 'Cancellation after items are received', paragraphs: ['If Hangers has already collected or received your items, we will check the order stage and the work already completed. If care work has not started, we will cancel the unstarted service after confirming the request. If work has started or a service has been completed, any amount due will reflect the work already performed and any amount already paid; we will explain the calculation before closing the request.'] },
  { title: 'When a refund may be due', paragraphs: ['We review refunds for a duplicate or incorrect charge, a cancelled service that has not been performed, or another verified billing adjustment. A refund is not automatic merely because an item was submitted: the order stage, invoice, service performed and payment settlement must be checked first. For a service-quality concern, contact us within 24 hours of handover so we can review the item and order details.'] },
  { title: 'How to request a review', paragraphs: [], bullets: ['Include your name, order or invoice number, payment date and amount, and Razorpay payment reference if available.', 'We will review the order and payment records and contact you if information is needed.', 'If a refund is approved, it is submitted to the original payment method. After submission, the bank or payment provider controls when the credit appears; this commonly takes 5–7 business days, and timing can vary by issuer.'], link: { href: '/contact', label: 'Contact Hangers to request a cancellation or refund review' } },
  { title: 'Payment still processing', paragraphs: ['A payment that Razorpay or a bank still shows as processing, created or under review is not yet a confirmed successful payment or a confirmed refund. Do not pay a second time while the same attempt is unresolved. Contact Hangers with the invoice and Razorpay reference so we can check the same transaction. If Razorpay confirms that no payment was captured, no refund is due for that attempt.'] },
  { title: 'No automatic merchandise return', paragraphs: ['Hangers provides garment-care services, not shipped garments or retail products. This policy covers cancellation and adjustment of services and their invoices; it is not a merchandise return policy.'], link: { href: '/shipping-exchange', label: 'Read the Shipping and Exchange Policy' } },
]

export default function CancellationRefundPage() {
  return <PolicyPage title={title} intro="Hangers provides local garment-care services rather than shipped goods. This policy explains how to cancel a pickup or service, how billing concerns are reviewed, and when an approved payment refund is submitted." sections={sections} />
}
