import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { getPublicServicePage, getPublicServicePages } from '@/lib/publicContent'
import { buildPublicMetadata, SITE_URL } from '@/lib/seo'
import { organizationRef } from '@/lib/schema'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ service: string; suburb: string }> }): Promise<Metadata> {
  const { service, suburb } = await params
  const page = await getPublicServicePage(service, suburb)
  if (!page) return buildPublicMetadata({ title: 'Service not found | Hangers Clothes Spa', description: 'This service page is no longer available.', path: `/services/${service}/${suburb}` })
  return buildPublicMetadata({ title: `${page.title} | Hangers Clothes Spa`, description: page.metaDescription, path: `/services/${service}/${suburb}` })
}

export default async function ServiceSuburbPage({ params }: { params: Promise<{ service: string; suburb: string }> }) {
  const { service, suburb } = await params
  const [profile, page, allServicePages] = await Promise.all([getPublicSiteProfile(), getPublicServicePage(service, suburb), getPublicServicePages()])
  if (!profile) return <PublicUnavailable />
  if (!page) return notFound()
  const otherAreasForService = allServicePages.filter((sp) => sp.serviceSlug === page.serviceSlug && sp.suburbSlug !== page.suburbSlug)
  const otherServicesHere = allServicePages.filter((sp) => sp.suburbSlug === page.suburbSlug && sp.serviceSlug !== page.serviceSlug)

  const phone = profile.phone.replace(/\D/g, '')
  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: page.serviceName,
    name: page.title,
    description: page.metaDescription,
    areaServed: { '@type': 'Place', name: page.suburbName },
    provider: organizationRef(),
    url: `${SITE_URL}/services/${page.serviceSlug}/${page.suburbSlug}`,
  }
  const faqSchema = page.faqs?.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  } : null

  return <PublicContentPage profile={profile} crumbs={[{label:'Home',href:'/'},{label:'Services',href:'/services'},{label:page.serviceName,href:`/services/${page.serviceSlug}`},{label:page.suburbName}]} title={page.title} intro={page.intro} heroActions={
    <>
      <a className="dp-btn" href="/book-pickup">Book a pickup</a>
      <a className="dp-btn secondary" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">Ask on WhatsApp</a>
    </>
  }>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema).replace(/</g, '\\u003c') }} />
    {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} />}
    <section className="dp-section">
      <img className="dp-media" src={page.heroImage} alt={page.heroImageAlt} width={1280} height={853} loading="lazy" />
    </section>
    {page.sections.map((section) => (
      <section className="dp-section" key={section.heading}>
        <h2 className="dp-title">{section.heading}</h2>
        <p className="dp-copy">{section.body}</p>
      </section>
    ))}
    {page.faqs?.length ? (
      <section className="dp-section">
        <h2 className="dp-title">Frequently asked</h2>
        <div className="dp-faq">
          {page.faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
    ) : null}
    {otherServicesHere.length ? (
      <section className="dp-section">
        <h2 className="dp-title">Other services in {page.suburbName}</h2>
        <div className="dp-grid two">
          {otherServicesHere.map((sp) => (
            <Link className="dp-card" key={sp.serviceSlug} href={`/services/${sp.serviceSlug}/${sp.suburbSlug}`} style={{ color: 'inherit' }}>
              <h3>{sp.title}</h3>
              <p>{sp.intro}</p>
            </Link>
          ))}
        </div>
      </section>
    ) : null}
    {otherAreasForService.length ? (
      <section className="dp-section">
        <h2 className="dp-title">{page.serviceName} in other areas</h2>
        <div className="dp-grid two">
          {otherAreasForService.map((sp) => (
            <Link className="dp-card" key={sp.suburbSlug} href={`/services/${sp.serviceSlug}/${sp.suburbSlug}`} style={{ color: 'inherit' }}>
              <h3>{sp.suburbName}</h3>
              <p>{sp.intro}</p>
            </Link>
          ))}
        </div>
      </section>
    ) : null}
    <section className="dp-band" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
      <div>
        <h2 className="dp-title">More about pickup in {page.suburbName}</h2>
        <p className="dp-copy">Coverage, turnaround and every other service available in this area.</p>
      </div>
      <Link className="dp-btn secondary" href={`/pickup-zones/${page.suburbSlug}`}>View {page.suburbName} pickup zone →</Link>
    </section>
  </PublicContentPage>
}
