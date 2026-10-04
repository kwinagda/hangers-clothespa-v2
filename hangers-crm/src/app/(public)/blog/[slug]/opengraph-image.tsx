import { ImageResponse } from 'next/og'
import { buildOgCard } from '@/lib/ogCard'
import { getPublicBlogPost } from '@/lib/publicContent'

export const runtime = 'edge'
export const alt = 'Hangers Garment Care Journal article'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPublicBlogPost(slug)
  return new ImageResponse(
    buildOgCard({
      kicker: post?.kicker || 'Care Journal',
      title: post?.title || 'Garment Care Journal',
      description: post?.excerpt || 'Practical guidance from Hangers Clothes Spa.',
      photo: post?.heroImage || '/brand/curtain-care-hero.webp',
    }),
    size,
  )
}
