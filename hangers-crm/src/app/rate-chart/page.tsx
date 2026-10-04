import type { Metadata } from 'next'
import RateChartClient from './RateChartClient'
import MarketingPage from '@/components/public/MarketingPage'
import VideoSlot from '@/components/public/VideoSlot'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { SITE_URL } from '@/lib/seo'

export const dynamic = 'force-dynamic'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: 'Rate Chart | Hangers Clothes Spa' },
  description: 'Search garment care prices by service category at Hangers Clothes Spa.',
  alternates: { canonical: '/rate-chart' },
  openGraph: {
    title: 'Hangers Clothes Spa Rate Chart',
    description: 'Search garment care prices by garment or service category.',
    url: '/rate-chart',
    siteName: 'Hangers Clothes Spa',
    type: 'website',
    images: [
      {
        url: '/rate-chart/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Hangers Clothes Spa Rate Chart',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hangers Clothes Spa Rate Chart',
    description: 'Search garment care prices by garment or service category.',
    images: ['/rate-chart/opengraph-image'],
  },
}

async function loadRateChart() {
  const res = await fetch(`${API_BASE_URL}/public/rate-chart`, { cache: 'no-store' })
  if (!res.ok) return null
  const payload = await res.json()
  return payload?.data?.rateChart || payload?.rateChart || null
}

export default async function PublicRateChartPage() {
  const [rateChart, profile] = await Promise.all([loadRateChart(), getPublicSiteProfile()])
  const categories = Array.isArray(rateChart?.categories) ? rateChart.categories : []
  if (!profile) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#023c62' }}>Website details are being configured.</main>
  if (!rateChart) return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#023c62', padding: 24 }}><div><h1 style={{ margin: 0, fontSize: 28 }}>Rate chart unavailable</h1><p>Please try again later or contact Hangers Clothes Spa.</p></div></main>
  return <MarketingPage profile={profile} crumbs={[{ label: 'Home', href: '/' }, { label: 'Rate chart' }]} title="Current catalog prices." intro="Search garment care prices by service category. Rates are subject to item and fabric inspection.">
    <section style={{ maxWidth: 1320, margin: '0 auto', padding: '24px clamp(16px,4vw,28px) 0' }}><VideoSlot clip="rates" /></section>
    <section style={{ maxWidth: 1320, margin: '0 auto', padding: '8px clamp(16px,4vw,28px) 48px' }}><RateChartClient categories={categories} /></section>
  </MarketingPage>
}
