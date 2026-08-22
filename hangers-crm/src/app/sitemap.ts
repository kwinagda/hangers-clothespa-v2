import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

const pages: Array<{ path: string; changeFrequency: 'weekly' | 'monthly'; priority: number }> = [
  { path: '', changeFrequency: 'weekly', priority: 1 },
  { path: '/services', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/rate-chart', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/book-pickup', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/pickup-zones', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/monthly-plans', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/corporate-accounts', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/blog', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.7 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-08-22T00:00:00+05:30')
  return pages.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    ...(page.path === '' ? { images: [`${SITE_URL}/brand/curtain-care-hero.png`, `${SITE_URL}/brand/garment-care-hero.png`] } : {}),
  }))
}
