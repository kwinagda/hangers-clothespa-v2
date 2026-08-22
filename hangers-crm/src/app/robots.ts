import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

const privatePaths = ['/api', '/dashboard', '/login', '/change-password', '/invoice', '/quotation', '/daily-iron']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: privatePaths },
      { userAgent: 'OAI-SearchBot', allow: '/', disallow: privatePaths },
      { userAgent: 'ChatGPT-User', allow: '/', disallow: privatePaths },
      { userAgent: 'GPTBot', disallow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
