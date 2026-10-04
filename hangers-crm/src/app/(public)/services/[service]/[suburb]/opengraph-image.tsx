import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'
import { getPublicServicePage } from '@/lib/publicContent'

export const runtime = 'edge'
export const alt = 'Hangers Clothes Spa service'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ service: string; suburb: string }> }) {
  const { service, suburb } = await params
  const page = await getPublicServicePage(service, suburb)
  return new ImageResponse(
    buildOgCard({
      kicker: page?.serviceName || 'Services',
      title: page?.title || 'Hangers Clothes Spa',
      description: page?.intro || 'Dry cleaning, curtain and laundry services across Mulund and nearby areas.',
      photo: page?.heroImage || '/brand/garment-care-hero.webp',
    }),
    size,
  )
}
