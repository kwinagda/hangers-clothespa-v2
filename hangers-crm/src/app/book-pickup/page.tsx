import PickupRequestForm from './PickupRequestForm'
import MarketingPage from '@/components/public/MarketingPage'
import VideoSlot from '@/components/public/VideoSlot'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
export const metadata = buildPublicMetadata({ title: 'Book Dry Cleaning Pickup in Mulund | Hangers Clothes Spa', description: 'Request garment and home-care pickup across Mulund, Bhandup and Thane from Hangers Clothes Spa.', path: '/book-pickup' })

export default async function BookPickupPage() {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />
  return <MarketingPage profile={profile} crumbs={[{ label: 'Home', href: '/' }, { label: 'Book a pickup' }]} title="Book a pickup in about two minutes." intro={`Tell us what needs care, choose a preferred time and add the collection address. The Hangers team confirms availability across ${profile.pickupZones.join(', ')} for eligible orders above Rs. ${profile.pickupMinimumOrder}.`}>
    <section style={{ maxWidth: 1100, margin: '0 auto', padding: '24px clamp(16px,4vw,28px) 0' }}><div style={{ maxWidth: 360, margin: '0 auto' }}><VideoSlot clip="book" /></div></section>
    <section style={{ maxWidth: 1320, margin: '0 auto', padding: '32px clamp(16px,4vw,28px) 96px' }}>
      <PickupRequestForm services={profile.featuredServices} pickupTimeSlots={profile.pickupTimeSlots} />
    </section>
  </MarketingPage>
}
