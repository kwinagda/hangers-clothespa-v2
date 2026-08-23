import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'

export const runtime = 'edge'
export const alt = 'Contact Hangers Clothes Spa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    buildOgCard({
      kicker: 'Contact',
      title: 'Visit or speak with the Hangers team.',
      description: 'Call, WhatsApp, email or visit our Mulund West shop counter — photos of a fabric or stain are welcome before you book.',
      photo: '/brand/landing-garment-care.jpg',
    }),
    size,
  )
}
