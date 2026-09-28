export type PublicBlogPostSummary = {
  slug: string
  kicker: string
  title: string
  excerpt: string
  heroImage: string
  heroImageAlt: string
  publishedAt: string | null
}

export type PublicFaqEntry = { question: string; answer: string }

export type PublicBlogPost = PublicBlogPostSummary & {
  metaDescription: string
  sections: { heading: string; body: string }[]
  faqs?: PublicFaqEntry[] | null
}

export type PublicSuburbPageSummary = {
  slug: string
  suburbName: string
  title: string
  intro: string
  heroImage: string
  heroImageAlt: string
}

export type PublicSuburbPage = PublicSuburbPageSummary & {
  metaDescription: string
  landmarks?: string[] | null
  pickupNotes?: string | null
  faqs?: PublicFaqEntry[] | null
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'

export async function getPublicBlogPosts(): Promise<PublicBlogPostSummary[]> {
  const response = await fetch(`${API_BASE_URL}/public/blog-posts`, { cache: 'no-store' })
  if (!response.ok) return []
  const payload = await response.json()
  const items = payload?.data?.items || payload?.items
  return Array.isArray(items) ? items : []
}

export async function getPublicBlogPost(slug: string): Promise<PublicBlogPost | null> {
  const response = await fetch(`${API_BASE_URL}/public/blog-posts/${encodeURIComponent(slug)}`, { cache: 'no-store' })
  if (!response.ok) return null
  const payload = await response.json()
  return payload?.data?.post || payload?.post || null
}

export async function getPublicSuburbPages(): Promise<PublicSuburbPageSummary[]> {
  const response = await fetch(`${API_BASE_URL}/public/pickup-zones`, { cache: 'no-store' })
  if (!response.ok) return []
  const payload = await response.json()
  const items = payload?.data?.items || payload?.items
  return Array.isArray(items) ? items : []
}

export async function getPublicSuburbPage(slug: string): Promise<PublicSuburbPage | null> {
  const response = await fetch(`${API_BASE_URL}/public/pickup-zones/${encodeURIComponent(slug)}`, { cache: 'no-store' })
  if (!response.ok) return null
  const payload = await response.json()
  return payload?.data?.page || payload?.page || null
}
