import type { Metadata } from 'next'

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://hangers-cs.com').replace(/\/$/, '')
export const SITE_NAME = 'Hangers Clothes Spa'
export const DEFAULT_DESCRIPTION = 'Professional dry cleaning, curtain care, ironing, sofa cleaning and home-furnishing care in Mulund West, Mumbai.'

export function buildPublicMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const canonicalPath = path.startsWith('/') ? path : `/${path}`
  // Each public page owns its own <route>/opengraph-image.tsx (Next.js file-based OG
  // image convention). Compute its URL from the page's own path rather than hardcoding
  // the root image here, or every page silently shares one preview image regardless
  // of whether it has its own opengraph-image.tsx sitting right next to it.
  const ogImagePath = canonicalPath === '/' ? '/opengraph-image' : `${canonicalPath}/opengraph-image`
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
      images: [{ url: ogImagePath, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImagePath],
    },
  }
}
