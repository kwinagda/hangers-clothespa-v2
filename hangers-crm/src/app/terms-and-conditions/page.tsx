import { PolicyPage, type PolicySection } from '@/components/public/PolicyPage'
import { buildPublicMetadata } from '@/lib/seo'

const title = 'Terms and Conditions'
const description = 'Terms for Hangers Clothes Spa dry-cleaning, ironing, curtain and home-care services in Mulund, Mumbai.'
export const metadata = buildPublicMetadata({ title: `${title} | Hangers Clothes Spa`, description, path: '/terms-and-conditions' })

const sections: PolicySection[] = [
  { title: 'Who these terms cover', paragraphs: ['These terms apply when you browse the Hangers Clothes Spa website, request a pickup, hand items to our team, or pay an invoice for our garment-care and related services. Hangers Clothes Spa is a local garment-care business serving Mulund West and nearby pickup areas. Our operating address and current contact details are on the Contact Us page.'], link: { href: '/contact', label: 'View business address and contact details' } },
  { title: 'A pickup request is not yet a confirmed order', paragraphs: ['A website pickup form records your request and preferred time. Our team checks the address, service availability and schedule, then contacts you to confirm. The final service order and item list are established when the items are received and inspected. Please do not treat an unconfirmed request as a booked collection.'] },
  { title: 'Inspection, services and pricing', paragraphs: ['Hangers provides dry cleaning, laundry and ironing, curtain care, shoe care, sofa and upholstery care, and household textile care where available. The rate chart is a guide to the configured catalog. The condition, fabric, care label, construction, size and treatment required can affect whether an item is suitable and its final charge. We will discuss material changes to the requested service or price with you before proceeding. Typical turnaround times are estimates, not guaranteed completion appointments.'] },
  { title: 'Care outcomes and customer checks', paragraphs: ['Cleaning results depend on fabric, dyes, construction, prior treatment and the age or type of a stain. Stain removal cannot be guaranteed. Please empty pockets and tell us about delicate trims, existing damage, special care instructions or items of unusual value when handing items over. Check items at collection or delivery and tell us about a service concern within 24 hours so we can review the order while its details are available.'] },
  { title: 'Collection, delivery and payment', paragraphs: ['Pickup and delivery are local service arrangements in the areas shown on our website and are subject to confirmation. They are not parcel shipping. Payment is due as stated on your invoice or as otherwise agreed with Hangers. Online payments are processed by Razorpay; a payment is considered received only when the payment provider confirms success and Hangers records it against the correct invoice. Keep your invoice or payment reference if you contact us about a transaction.'] },
  { title: 'Cancellations, refunds and service concerns', paragraphs: ['Cancellation requests, billing adjustments and payment reversals are handled under the separate policy for these service orders.'], link: { href: '/cancellation-refund', label: 'Read the Cancellation and Refund Policy' } },
  { title: 'Website use and changes', paragraphs: ['Please provide accurate contact and pickup information and use the website only for lawful purposes. We may update service availability, prices, these terms or website content when our operations change. The version published here applies from its stated update date. Nothing in these terms removes a right that cannot legally be excluded.'] },
]

export default function TermsPage() {
  return <PolicyPage title={title} intro="How Hangers accepts, inspects, prices and cares for garments and household items, and what to expect when you request a local pickup or pay an invoice." sections={sections} />
}
