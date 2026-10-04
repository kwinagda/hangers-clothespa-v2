import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'
import { getPublicServicePages } from '@/lib/publicContent'

export const runtime = 'edge'
export const alt = 'Hangers Clothes Spa service'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params
  const pages = await getPublicServicePages(service)
  const serviceName = pages[0]?.serviceName || 'Services'
  return new ImageResponse(
    buildOgCard({
      kicker: 'Services',
      title: `${serviceName} across Mulund and nearby areas`,
      description: 'Pick your neighbourhood for local turnaround times and pickup details.',
      photo: pages[0]?.heroImage || '/brand/garment-care-hero.webp',
    }),
    size,
  )
}
