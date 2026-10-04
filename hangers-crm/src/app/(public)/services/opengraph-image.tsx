import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'

export const runtime = 'edge'
export const alt = 'Hangers Clothes Spa Services'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    buildOgCard({
      kicker: 'Services',
      title: 'Every Hangers service, with its live item rates.',
      description: 'Garment care, ironing, curtains, household textiles and footwear — priced directly from our live catalog.',
      photo: '/brand/garment-care-hero.webp',
    }),
    size,
  )
}
