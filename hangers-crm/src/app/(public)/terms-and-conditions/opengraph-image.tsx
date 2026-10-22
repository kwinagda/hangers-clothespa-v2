import { buildOgCard } from '@/lib/ogCard'
import { ogImage } from '@/lib/ogImage'

export const alt = 'Terms and Conditions | Hangers Clothes Spa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return ogImage(
    buildOgCard({
      kicker: 'Policies',
      title: 'Terms and Conditions',
      description: 'How Hangers accepts, inspects, prices and cares for garments and household items, and what to expect when you request a local pickup or pay an invoice.',
      photo: '/brand/garment-care-hero.png',
    }),
    size,
  )
}
