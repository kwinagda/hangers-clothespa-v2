export type PublicSiteProfile = {
  businessName: string
  phone: string
  email: string
  address: string
  mapUrl: string
  instagramUrl: string
  googleRating: number
  googleReviewCount: number
  establishedYear: number
  openingHours: { label: string; hours: string }[]
  pickupZones: string[]
  pickupMinimumOrder: number
  pickupTimeSlots: { value: string; label: string }[]
  featuredServices: { key: string; name: string; description: string }[]
  turnaround: { dryCleaning: string; curtains: string }
  seo: {
    siteUrl: string
    address: { streetAddress: string; addressLocality: string; addressRegion: string; postalCode: string; addressCountry: string }
    openingHoursSpecification: { dayOfWeek: string[]; opens: string; closes: string }[]
  }
}

export type PublicRateItem = {
  id: string
  name: string
  price: number
}

export type PublicRateCategory = {
  id: string
  key: string
  label: string
  color?: string
  lightColor?: string
  items: PublicRateItem[]
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'

export async function getPublicSiteProfile(): Promise<PublicSiteProfile | null> {
  const response = await fetch(`${API_BASE_URL}/public/site-profile`, { cache: 'no-store' })
  if (!response.ok) return null
  const payload = await response.json()
  return payload?.data?.profile || payload?.profile || null
}

export async function getPublicRateChart(): Promise<{ categories: PublicRateCategory[] } | null> {
  const response = await fetch(`${API_BASE_URL}/public/rate-chart`, { cache: 'no-store' })
  if (!response.ok) return null
  const payload = await response.json()
  return payload?.data?.rateChart || payload?.rateChart || null
}
