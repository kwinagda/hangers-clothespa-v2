import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Hangers Clothes Spa Rate Chart'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://13-207-73-79.sslip.io'

export default function Image() {
  const logoUrl = new URL('/brand/hangers-logo-blue.png', SITE_URL).toString()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f4f7fb',
          padding: 38,
          fontFamily: 'Inter, Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            border: '2px solid #dce8f0',
            borderRadius: 24,
            boxShadow: '0 18px 42px rgba(2,60,98,0.08)',
          }}
        >
          <img
            src={logoUrl}
            alt="Hangers Clothes Spa"
            width={230}
            height={74}
            style={{ objectFit: 'contain', marginBottom: 34 }}
          />
          <div
            style={{
              color: '#023c62',
              fontSize: 68,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: 0,
              marginBottom: 22,
            }}
          >
            Rate Chart
          </div>
          <div
            style={{
              color: '#5d728b',
              fontSize: 29,
              fontWeight: 400,
              lineHeight: 1.35,
            }}
          >
            Search by garment or browse by service category.
          </div>
        </div>
      </div>
    ),
    size,
  )
}
