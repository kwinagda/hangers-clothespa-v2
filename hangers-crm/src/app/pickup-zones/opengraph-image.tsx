import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'
import { fetchOgProfileFacts } from '@/lib/ogProfile'

export const runtime = 'edge'
export const alt = 'Hangers Clothes Spa Pickup Zones'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const { pickupZones, pickupMinimumOrder } = await fetchOgProfileFacts()
  return new ImageResponse(
    buildOgCard({
      kicker: 'Pickup Zones',
      title: 'Where we collect and deliver.',
      description: `Free pickup and delivery across ${pickupZones.join(', ')} on eligible orders above Rs. ${pickupMinimumOrder}.`,
      photo: '/brand/curtain-care-hero.webp',
    }),
    size,
  )
}
