import type { Metadata } from 'next'

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://hangers-cs.com').replace(/\/$/, '')
export const SITE_NAME = 'Hangers Clothes Spa'
export const DEFAULT_DESCRIPTION = 'Professional dry cleaning, curtain care, ironing, sofa cleaning and home-furnishing care in Mulund West, Mumbai.'

export function buildPublicMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const canonicalPath = path.startsWith('/') ? path : `/${path}`
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName: SITE_NAME,
      locale: 'en_IN',
      type: 'website',
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: `${SITE_NAME} - Care in Every Clean` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/opengraph-image'],
    },
  }
}
