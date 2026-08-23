import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'
import { fetchOgProfileFacts } from '@/lib/ogProfile'

export const runtime = 'edge'
export const alt = 'Book a Pickup with Hangers Clothes Spa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const { pickupZones, pickupMinimumOrder } = await fetchOgProfileFacts()
  return new ImageResponse(
    buildOgCard({
      kicker: 'Book a Pickup',
      title: 'Book a pickup in about two minutes.',
      description: `Free collection across ${pickupZones.join(', ')} for eligible orders above Rs. ${pickupMinimumOrder}.`,
      photo: '/brand/garment-care-hero.png',
    }),
    size,
  )
}
