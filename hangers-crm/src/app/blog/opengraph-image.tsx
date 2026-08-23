import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'

export const runtime = 'edge'
export const alt = 'Hangers Garment Care Journal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    buildOgCard({
      kicker: 'Care Journal',
      title: 'Garment Care Journal',
      description: 'Practical guidance on stains, storage, curtains and footwear — the small decisions that can prevent permanent damage.',
      photo: '/brand/curtain-care-hero.png',
    }),
    size,
  )
}
