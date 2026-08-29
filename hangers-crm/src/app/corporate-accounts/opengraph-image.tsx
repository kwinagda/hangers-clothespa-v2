import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'

export const runtime = 'edge'
export const alt = 'Corporate Accounts at Hangers Clothes Spa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    buildOgCard({
      kicker: 'Corporate Accounts',
      title: 'Garment and linen care for businesses across Mumbai.',
      description: 'Tailored plans for hotels, restaurants, clinics, salons and offices — quoted after a real requirement review, never a generic package.',
      photo: '/brand/curtain-care-hero.webp',
      dark: true,
    }),
    size,
  )
}
