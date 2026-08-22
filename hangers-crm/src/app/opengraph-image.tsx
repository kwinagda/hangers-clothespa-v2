import { ImageResponse } from 'next/og'
import { SITE_URL } from '@/lib/seo'

export const runtime = 'edge'
export const alt = 'Hangers Clothes Spa - Dry Cleaning and Curtain Care in Mulund'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'

const FALLBACK = {
  tag: 'Dry cleaning, ironing and home care',
  title: 'Clear garment care with live pricing.',
  copy: 'Dry cleaning, ironing, sofa, shoe and household care across Mulund, Bhandup, Thane. Pickup is free on eligible orders above Rs. 499.',
  turnaround: '4-5 days',
  pickupMinimumOrder: 499,
  establishedYear: 2018,
}

export default async function Image() {
  let profile = FALLBACK
  try {
    const response = await fetch(`${API_BASE_URL}/public/site-profile`, { cache: 'no-store' })
    if (response.ok) {
      const payload = await response.json()
      const p = payload?.data?.profile || payload?.profile
      if (p) {
        profile = {
          tag: 'Dry cleaning, ironing and home care',
          title: 'Clear garment care with live pricing.',
          copy: `Dry cleaning, ironing, sofa, shoe and household care across ${(p.pickupZones || []).join(', ')}. Pickup is free on eligible orders above Rs. ${p.pickupMinimumOrder}.`,
          turnaround: p.turnaround?.dryCleaning || FALLBACK.turnaround,
          pickupMinimumOrder: p.pickupMinimumOrder ?? FALLBACK.pickupMinimumOrder,
          establishedYear: p.establishedYear ?? FALLBACK.establishedYear,
        }
      }
    }
  } catch {}

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#f7f9fc', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ position: 'relative', width: 660, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '58px 56px' }}>
          <img src={new URL('/brand/hangers-logo-blue.png', SITE_URL).toString()} width="190" height="58" alt="" style={{ objectFit: 'contain', objectPosition: 'left center', marginBottom: 36 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#e8f0f7', borderRadius: 999, padding: '8px 16px', alignSelf: 'flex-start', marginBottom: 26 }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: '#166534', display: 'flex' }} />
            <span style={{ fontSize: 18, fontWeight: 700, color: '#023c62' }}>{profile.tag}</span>
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.25, color: '#023c62', marginBottom: 40, display: 'flex' }}>{profile.title}</div>
          <div style={{ fontSize: 20, lineHeight: 1.5, color: '#4b6479', marginBottom: 34, display: 'flex' }}>{profile.copy}</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#023c62', color: '#fff', borderRadius: 10, padding: '14px 26px', fontSize: 19, fontWeight: 700 }}>Book a pickup</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', color: '#023c62', border: '1.5px solid #023c62', borderRadius: 10, padding: '14px 26px', fontSize: 19, fontWeight: 700 }}>See live rates</div>
          </div>
          <div style={{ display: 'flex', gap: 36 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#023c62' }}>{profile.turnaround}</span>
              <span style={{ fontSize: 15, color: '#7d93a8' }}>Dry-cleaning turnaround</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#023c62' }}>Free</span>
              <span style={{ fontSize: 15, color: '#7d93a8' }}>Pickup above Rs. {profile.pickupMinimumOrder}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#023c62' }}>Since {profile.establishedYear}</span>
              <span style={{ fontSize: 15, color: '#7d93a8' }}>Serving Mulund West</span>
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', width: 540, display: 'flex' }}>
          <img src={new URL('/brand/garment-care-hero.png', SITE_URL).toString()} width="540" height="630" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>
    ),
    size,
  )
}
