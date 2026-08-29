import { SITE_URL } from '@/lib/seo'

export function buildOgCard({ kicker, title, description, photo, dark = false }: { kicker: string; title: string; description: string; photo: string; dark?: boolean }) {
  const logoUrl = new URL(dark ? '/brand/hangers-logo-white.webp' : '/brand/hangers-logo-blue.webp', SITE_URL).toString()
  const photoUrl = new URL(photo, SITE_URL).toString()
  const bg = dark ? '#023c62' : '#f7f9fc'
  const titleColor = dark ? '#fff' : '#023c62'
  const bodyColor = dark ? '#c3d9e9' : '#4b6479'
  const kickerBg = dark ? 'rgba(255,255,255,0.12)' : '#e8f0f7'
  const kickerColor = dark ? '#fff' : '#023c62'
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', background: bg, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ position: 'relative', width: 700, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '64px 64px' }}>
        <img src={logoUrl} width="200" height="61" alt="" style={{ objectFit: 'contain', objectPosition: 'left center', marginBottom: 40 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: kickerBg, borderRadius: 999, padding: '8px 16px', alignSelf: 'flex-start', marginBottom: 28 }}>
          <div style={{ width: 8, height: 8, borderRadius: 999, background: dark ? '#4ade80' : '#166534', display: 'flex' }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: kickerColor }}>{kicker}</span>
        </div>
        <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.2, color: titleColor, marginBottom: 28, display: 'flex' }}>{title}</div>
        <div style={{ fontSize: 22, lineHeight: 1.5, color: bodyColor, display: 'flex' }}>{description}</div>
      </div>
      <div style={{ position: 'relative', width: 500, display: 'flex' }}>
        <img src={photoUrl} width="500" height="630" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    </div>
  )
}
