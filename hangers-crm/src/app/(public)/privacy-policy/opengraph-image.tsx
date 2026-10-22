import { buildOgCard } from '@/lib/ogCard'
import { ogImage } from '@/lib/ogImage'

export const alt = 'Privacy Policy | Hangers Clothes Spa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return ogImage(
    buildOgCard({
      kicker: 'Policies',
      title: 'Privacy Policy',
      description: 'How Hangers Clothes Spa handles information submitted for local garment-care services, pickup requests and payments.',
      photo: '/brand/garment-care-hero.png',
    }),
    size,
  )
}
