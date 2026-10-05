import { ogImage } from '@/lib/ogImage'
import { buildOgCard } from '@/lib/ogCard'

export const alt = 'Monthly Plans at Hangers Clothes Spa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return ogImage(
    buildOgCard({
      kicker: 'Monthly Plans',
      title: 'Monthly care for wardrobes that need us weekly.',
      description: 'Individual, household and custom recurring plans — built around your actual routine, never an invented package price.',
      photo: '/brand/landing-garment-care.png',
    }),
    size,
  )
}
