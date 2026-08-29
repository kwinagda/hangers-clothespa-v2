import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'
import { fetchOgProfileFacts } from '@/lib/ogProfile'

export const runtime = 'edge'
export const alt = 'About Hangers Clothes Spa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const { establishedYear } = await fetchOgProfileFacts()
  return new ImageResponse(
    buildOgCard({
      kicker: 'About Hangers',
      title: 'A neighbourhood garment-care shop built around clear service.',
      description: `Serving Mulund West since ${establishedYear} with hands-on item inspection, barcode tracking and WhatsApp order updates.`,
      photo: '/brand/garment-care-hero.webp',
    }),
    size,
  )
}
