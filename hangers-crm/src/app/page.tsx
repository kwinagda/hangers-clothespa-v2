import PublicWebsite from '@/components/public/PublicWebsite'
import { buildPublicMetadata } from '@/lib/seo'

export const metadata = buildPublicMetadata({
  title: 'Hangers Clothes Spa | Dry Cleaning & Curtain Care in Mulund',
  description: 'Professional dry cleaning, curtain care, ironing and home furnishing care in Mulund West.',
  path: '/',
})

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'

export default async function Home() {
  const [response, ratesResponse] = await Promise.all([
    fetch(`${API_BASE_URL}/public/site-profile`, { cache: 'no-store' }),
    fetch(`${API_BASE_URL}/public/rate-chart`, { cache: 'no-store' }),
  ])

  if (!response.ok) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#023c62' }}>Website details are being configured.</main>
  }

  const payload = await response.json()
  const ratesPayload = ratesResponse.ok ? await ratesResponse.json() : null
  const categories = ratesPayload?.data?.rateChart?.categories || ratesPayload?.rateChart?.categories || []
  const currentRates = categories.flatMap((category: any) => (category.items || []).map((item: any) => ({
    name: item.name,
    price: Number(item.price || 0),
    category: category.label,
  }))).slice(0, 6)
  return <PublicWebsite profile={payload?.data?.profile || payload?.profile} currentRates={currentRates} />
}
