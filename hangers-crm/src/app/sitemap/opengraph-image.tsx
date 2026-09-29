import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'

export const runtime = 'edge'
export const alt = 'Hangers Clothes Spa Sitemap'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    buildOgCard({
      kicker: 'Sitemap',
      title: 'Every Hangers page, in one place.',
      description: 'Services by area, every pickup zone and every care journal article.',
      photo: '/brand/garment-care-hero.webp',
    }),
    size,
  )
}
