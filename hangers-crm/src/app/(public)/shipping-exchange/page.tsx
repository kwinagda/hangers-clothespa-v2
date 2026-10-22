import { PolicyPage, type PolicySection } from '@/components/public/PolicyPage'
import { buildPublicMetadata } from '@/lib/seo'

const title = 'Shipping and Exchange Policy'
const description = 'Shipping and product exchanges do not apply to Hangers Clothes Spa because it provides local garment-care services, not shipped merchandise.'
export const metadata = buildPublicMetadata({ title: `${title} | Hangers Clothes Spa`, description, path: '/shipping-exchange' })

const sections: PolicySection[] = [
  { title: 'Shipping: not applicable', paragraphs: ['Hangers Clothes Spa does not sell or dispatch retail products, and does not ship orders by courier or postal service. Customers pay for garment-care and related services. For that reason, product shipping charges, courier partners, parcel tracking and shipping delivery windows do not apply.'] },
  { title: 'How items move through our service', paragraphs: ['Where available and confirmed, Hangers arranges local pickup and return delivery of the customer’s own garments or household items in the service areas shown on the website. Customers may also visit the Mulund West shop during its listed hours. Pickup and return are service logistics, not shipment of a purchased product. A preferred pickup time is a request until the team confirms it.'] },
  { title: 'Product exchange: not applicable', paragraphs: ['There are no retail products to exchange, so product exchanges are not applicable. If an item-care result, missing item, damage concern or invoice needs attention, contact Hangers within 24 hours of handover where the concern relates to the returned service order. We will review the order and explain the available service or billing resolution. A re-clean or other adjustment is not automatic and depends on the facts and inspection.'] },
  { title: 'Cancel a pickup or raise a concern', paragraphs: ['For a pickup cancellation, service question or return-delivery coordination, contact us as soon as possible and provide your order number. For payment reversals, see the separate policy.'], link: { href: '/cancellation-refund', label: 'Read the Cancellation and Refund Policy' } },
]

export default function ShippingExchangePage() {
  return <PolicyPage title={title} intro="This page is intentionally marked not applicable for parcel shipping and product exchange: Hangers Clothes Spa provides local dry-cleaning and garment-care services, not shipped retail goods." sections={sections} />
}
