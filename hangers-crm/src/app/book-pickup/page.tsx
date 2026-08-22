import PickupRequestForm from './PickupRequestForm'
import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
export const metadata = buildPublicMetadata({ title: 'Book Dry Cleaning Pickup in Mulund | Hangers Clothes Spa', description: 'Request garment and home-care pickup across Mulund, Bhandup and Thane from Hangers Clothes Spa.', path: '/book-pickup' })

export default async function BookPickupPage() {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />
  return <PublicContentPage profile={profile} eyebrow="Book a pickup" title="Book a pickup in about two minutes." intro={`Tell us what needs care, choose a preferred time and add the collection address. The Hangers team confirms availability across ${profile.pickupZones.join(', ')} for eligible orders above Rs. ${profile.pickupMinimumOrder}.`}>
    <PickupRequestForm services={profile.featuredServices} pickupTimeSlots={profile.pickupTimeSlots} />
  </PublicContentPage>
}
