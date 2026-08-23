const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'

export type OgProfileFacts = {
  pickupZones: string[]
  pickupMinimumOrder: number
  turnaround: { dryCleaning: string; curtains: string }
  establishedYear: number
}

export const OG_PROFILE_FALLBACK: OgProfileFacts = {
  pickupZones: ['Mulund', 'Bhandup', 'Thane'],
  pickupMinimumOrder: 499,
  turnaround: { dryCleaning: '4-5 days', curtains: '5-7 days' },
  establishedYear: 2018,
}

export async function fetchOgProfileFacts(): Promise<OgProfileFacts> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/site-profile`, { cache: 'no-store' })
    if (!response.ok) return OG_PROFILE_FALLBACK
    const payload = await response.json()
    const p = payload?.data?.profile || payload?.profile
    if (!p) return OG_PROFILE_FALLBACK
    return {
      pickupZones: p.pickupZones || OG_PROFILE_FALLBACK.pickupZones,
      pickupMinimumOrder: p.pickupMinimumOrder ?? OG_PROFILE_FALLBACK.pickupMinimumOrder,
      turnaround: p.turnaround || OG_PROFILE_FALLBACK.turnaround,
      establishedYear: p.establishedYear ?? OG_PROFILE_FALLBACK.establishedYear,
    }
  } catch {
    return OG_PROFILE_FALLBACK
  }
}
