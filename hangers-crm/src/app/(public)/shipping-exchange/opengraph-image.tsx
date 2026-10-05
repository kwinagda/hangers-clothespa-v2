import { buildOgCard } from '@/lib/ogCard'
import { ogImage } from '@/lib/ogImage'

export const alt = 'Shipping and Exchange | Hangers Clothes Spa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return ogImage(
    buildOgCard({
      kicker: 'Policies',
      title: 'Shipping and Exchange',
      description: 'Hangers Clothes Spa provides local dry-cleaning and garment-care services, not shipped retail goods.',
      photo: '/brand/garment-care-hero.png',
    }),
    size,
  )
}
