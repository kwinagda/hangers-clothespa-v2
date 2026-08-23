import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'

export const runtime = 'edge'
export const alt = 'Hangers Clothes Spa FAQ'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    buildOgCard({
      kicker: 'FAQ',
      title: 'Questions we get asked at the counter.',
      description: 'Turnaround, pickup, curtains, rates and garment tracking — everything to know before you hand over your items.',
      photo: '/brand/garment-care-hero.png',
    }),
    size,
  )
}
