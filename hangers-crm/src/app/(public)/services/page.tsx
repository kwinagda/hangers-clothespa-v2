import Link from 'next/link'
import MarketingPage from '@/components/public/MarketingPage'
import VideoSlot from '@/components/public/VideoSlot'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'

export const metadata = buildPublicMetadata({ title: 'Dry Cleaning, Curtain & Laundry Services in Mulund | Hangers', description: 'Explore dry cleaning, ironing, curtain, sofa, shoe and household care services from Hangers Clothes Spa.', path: '/services' })

const SERVICES: [string, string, string][] = [
  ['Dry Cleaning', 'Care for everyday garments and special pieces.', 'dry-cleaning'],
  ['Daily & Normal Ironing', 'Dependable finishing for everyday wear.', 'ironing'],
  ['Curtain Cleaning', 'Cleaning with free removal and reinstallation.', 'curtain-cleaning'],
  ['Sofa Cleaning', 'Scheduled care for home furnishings.', 'sofa-upholstery-cleaning'],
]

const EXPLORE: [string, string][] = [
  ['Dry Cleaning', 'dry-cleaning'], ['Curtain Cleaning', 'curtain-cleaning'], ['Ironing', 'ironing'],
  ['Sofa & Upholstery Cleaning', 'sofa-upholstery-cleaning'], ['Shoe Care', 'shoe-care'], ['Household Textile Care', 'household-textile-care'],
]

export default async function ServicesPage() {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />
  return <MarketingPage profile={profile} crumbs={[{ label: 'Home', href: '/' }, { label: 'Services' }]} title="Garment, curtain and home care under one roof." intro="Service information comes from the configured Hangers public profile. Item prices remain available in the live rate chart.">
    <section style={{ maxWidth: 1320, margin: '0 auto', padding: '24px clamp(16px,4vw,28px)' }}><VideoSlot clip="services" /></section>
    <section style={{ maxWidth: 1320, margin: '0 auto', padding: '24px clamp(16px,4vw,28px)', display: 'grid', gap: 14 }}>
      {SERVICES.map(([title, body, slug], i) => {
        const dark = i % 2 === 1
        return <Link key={slug} href={`/services/${slug}`} data-rv={i % 2 ? 'right' : 'left'} data-ripple data-hover style={{ background: dark ? '#023c62' : '#E8F0F7', color: dark ? '#fff' : '#023c62', borderRadius: 28, padding: 'clamp(24px,5vw,44px)', display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 'clamp(14px,3vw,36px)', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: 'clamp(44px,10vw,110px)', fontWeight: 300, letterSpacing: '-.06em', opacity: 0.45, lineHeight: 1 }}>{String(i + 1).padStart(2, '0')}</div>
          <div><div style={{ fontSize: 'clamp(24px,5vw,52px)', fontWeight: 700, letterSpacing: '-.04em', lineHeight: 1.02 }}>{title}</div><div style={{ marginTop: 8, lineHeight: 1.45, opacity: 0.85, fontSize: 'clamp(15px,2vw,19px)' }}>{body}</div></div>
          <div style={{ fontSize: 'clamp(28px,5vw,48px)' }}>→</div>
        </Link>
      })}
    </section>
    <section style={{ maxWidth: 1320, margin: '0 auto', padding: 'clamp(40px,8vw,100px) clamp(16px,4vw,28px) 24px' }}>
      <h2 className="hg-h2" data-words style={{ fontSize: 'clamp(30px,5.6vw,64px)', margin: '0 0 24px' }}>Explore by service</h2>
      <div style={{ borderTop: '1px solid #c9d9e6' }}>
        {EXPLORE.map(([label, slug], i) => <Link key={slug} href={`/services/${slug}`} data-rv data-d={String(i * 60)} data-ripple style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 4px', borderBottom: '1px solid #c9d9e6', fontSize: 'clamp(20px,3.6vw,34px)', fontWeight: 600, letterSpacing: '-.03em', color: '#023c62' }}><span>{label}</span><span>→</span></Link>)}
      </div>
    </section>
  </MarketingPage>
}
