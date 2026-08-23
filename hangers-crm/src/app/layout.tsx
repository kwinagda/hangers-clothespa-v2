import type { Metadata, Viewport } from 'next'
import './globals.css'
import QueryProvider from '@/providers/QueryProvider'
import TextInputCapitalizer from '@/components/TextInputCapitalizer'
import PublicGoogleTagManager from '@/components/PublicGoogleTagManager'
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/seo'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Hangers Clothes Spa | Dry Cleaning & Curtain Care in Mulund',
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'Dry cleaning and laundry services',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png', sizes: '512x512' }],
    apple: [{ url: '/apple-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'Hangers Clothes Spa | Dry Cleaning & Curtain Care in Mulund',
    description: DEFAULT_DESCRIPTION,
    url: '/',
    siteName: SITE_NAME,
    locale: 'en_IN',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Hangers Clothes Spa - Care in Every Clean' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hangers Clothes Spa | Dry Cleaning & Curtain Care in Mulund',
    description: DEFAULT_DESCRIPTION,
    images: ['/opengraph-image'],
  },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#023c62', colorScheme: 'light' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PublicGoogleTagManager />
        <QueryProvider>
          <TextInputCapitalizer />
          {children}
        </QueryProvider>
      </body>
    </html>
  )
}
