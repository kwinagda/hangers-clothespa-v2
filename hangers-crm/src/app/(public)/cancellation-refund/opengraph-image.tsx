import { buildOgCard } from '@/lib/ogCard'
import { ogImage } from '@/lib/ogImage'

export const alt = 'Cancellation and Refund | Hangers Clothes Spa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return ogImage(
    buildOgCard({
      kicker: 'Policies',
      title: 'Cancellation and Refund',
      description: 'How Hangers handles cancelled pickups, refunds and service changes for local garment-care orders.',
      photo: '/brand/garment-care-hero.png',
    }),
    size,
  )
}
