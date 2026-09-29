import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { getPublicServicePages } from '@/lib/publicContent'
import { buildPublicMetadata, SITE_URL } from '@/lib/seo'
import { organizationRef } from '@/lib/schema'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ service: string }> }): Promise<Metadata> {
  const { service } = await params
  const pages = await getPublicServicePages(service)
  if (!pages.length) return buildPublicMetadata({ title: 'Service not found | Hangers Clothes Spa', description: 'This service is no longer available.', path: `/services/${service}` })
  const serviceName = pages[0].serviceName
  return buildPublicMetadata({ title: `${serviceName} in Mulund & Nearby Areas | Hangers Clothes Spa`, description: `${serviceName} from Hangers Clothes Spa, available across Mulund, Bhandup, Thane, Nahur, Vikhroli, Kanjurmarg, Powai and Ghatkopar.`, path: `/services/${service}` })
}

export default async function ServiceHubPage({ params }: { params: Promise<{ service: string }> }) {
  const { service } = await params
  const [profile, pages] = await Promise.all([getPublicSiteProfile(), getPublicServicePages(service)])
  if (!profile) return <PublicUnavailable />
  if (!pages.length) return notFound()
  const serviceName = pages[0].serviceName
  const phone = profile.phone.replace(/\D/g, '')

  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: serviceName,
    name: `${serviceName} in Mulund and nearby areas`,
    areaServed: profile.pickupZones.map((zone) => ({ '@type': 'Place', name: zone })),
    provider: organizationRef(),
    url: `${SITE_URL}/services/${service}`,
  }

  return <PublicContentPage profile={profile} crumbs={[{ label: 'Home', href: '/' }, { label: 'Services', href: '/services' }, { label: serviceName }]} title={`${serviceName}, wherever Hangers picks up.`} intro={`${serviceName} is available in every area Hangers serves. Pick your neighbourhood below for local turnaround times and pickup details.`} heroActions={
    <>
      <a className="dp-btn" href="/book-pickup">Book a pickup</a>
      <a className="dp-btn secondary" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">Ask on WhatsApp</a>
    </>
  }>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema).replace(/</g, '\\u003c') }} />
    <section className="dp-section">
      <h2 className="dp-title">{serviceName} by area</h2>
      <div className="dp-grid two">
        {pages.map((sp) => (
          <Link className="dp-card" key={sp.suburbSlug} href={`/services/${sp.serviceSlug}/${sp.suburbSlug}`} style={{ color: 'inherit' }}>
            <h3>{sp.suburbName}</h3>
            <p>{sp.intro}</p>
          </Link>
        ))}
      </div>
    </section>
    <section className="dp-band" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
      <div>
        <h2 className="dp-title">Not sure {serviceName.toLowerCase()} is the right process?</h2>
        <p className="dp-copy">Send a photo of the item and its care label — we'll confirm the right process before booking.</p>
      </div>
      <a className="dp-btn secondary" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">Ask Hangers on WhatsApp</a>
    </section>
  </PublicContentPage>
}
