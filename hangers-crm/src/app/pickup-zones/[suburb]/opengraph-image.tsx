import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'
import { getPublicSuburbPage } from '@/lib/publicContent'

export const runtime = 'edge'
export const alt = 'Hangers Clothes Spa pickup area'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ suburb: string }> }) {
  const { suburb } = await params
  const page = await getPublicSuburbPage(suburb)
  return new ImageResponse(
    buildOgCard({
      kicker: 'Pickup zones',
      title: page?.title || 'Hangers Clothes Spa',
      description: page?.intro || 'Dry cleaning, curtain and laundry pickup across Mulund and nearby areas.',
      photo: page?.heroImage || '/brand/garment-care-hero.webp',
    }),
    size,
  )
}
