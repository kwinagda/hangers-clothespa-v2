import { ImageResponse } from 'next/og'
import { SITE_URL } from '@/lib/seo'

export const runtime = 'edge'
export const alt = 'Hangers Clothes Spa - Dry Cleaning and Curtain Care in Mulund'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#023c62', fontFamily: 'Arial, sans-serif' }}>
      <img src={new URL('/brand/curtain-care-hero.png', SITE_URL).toString()} width="1200" height="630" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'linear-gradient(90deg, rgba(2,60,98,.96) 0%, rgba(2,60,98,.84) 48%, rgba(2,60,98,.2) 100%)' }} />
      <div style={{ position: 'relative', width: 720, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '64px 72px', color: '#fff' }}>
        <img src={new URL('/brand/hangers-logo-white.png', SITE_URL).toString()} width="250" height="76" alt="Hangers Clothes Spa" style={{ objectFit: 'contain', objectPosition: 'left center', marginBottom: 44 }} />
        <div style={{ fontSize: 59, fontWeight: 700, lineHeight: 1.08, marginBottom: 22 }}>Dry cleaning and curtain care in Mulund.</div>
        <div style={{ fontSize: 27, lineHeight: 1.35, color: '#d7e8f4' }}>Free curtain removal and reinstallation. Pickup available across Mulund, Bhandup and Thane.</div>
      </div>
    </div>,
    size,
  )
}
