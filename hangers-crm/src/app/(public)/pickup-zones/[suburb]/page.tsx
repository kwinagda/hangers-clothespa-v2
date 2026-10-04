import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { getPublicSuburbPage, getPublicServicePages } from '@/lib/publicContent'
import { buildPublicMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ suburb: string }> }): Promise<Metadata> {
  const { suburb } = await params
  const page = await getPublicSuburbPage(suburb)
  if (!page) return buildPublicMetadata({ title: 'Pickup area not found | Hangers Clothes Spa', description: 'This pickup area page is no longer available.', path: `/pickup-zones/${suburb}` })
  return buildPublicMetadata({ title: `${page.title} | Hangers Clothes Spa`, description: page.metaDescription, path: `/pickup-zones/${suburb}` })
}

export default async function SuburbPage({ params }: { params: Promise<{ suburb: string }> }) {
  const { suburb } = await params
  const [profile, page, servicePages] = await Promise.all([getPublicSiteProfile(), getPublicSuburbPage(suburb), getPublicServicePages()])
  if (!profile) return <PublicUnavailable />
  if (!page) return notFound()
  const servicesHere = servicePages.filter((sp) => sp.suburbSlug === suburb)

  const phone = profile.phone.replace(/\D/g, '')
  const map = `https://www.google.com/maps?q=${encodeURIComponent(profile.address)}&output=embed`
  const faqSchema = page.faqs?.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  } : null

  return <PublicContentPage profile={profile} crumbs={[{label:'Home',href:'/'},{label:'Pickup zones',href:'/pickup-zones'},{label:page.suburbName}]} title={page.title} intro={page.intro}>
    {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} />}
    <section className="dp-split">
      <div>
        <div className="dp-facts">
          <div className="dp-fact"><strong>{profile.turnaround.dryCleaning}</strong><span>Dry cleaning turnaround</span></div>
          <div className="dp-fact"><strong>{profile.turnaround.curtains}</strong><span>Curtain care turnaround</span></div>
          <div className="dp-fact"><strong>Rs. {profile.pickupMinimumOrder}</strong><span>Pickup minimum order</span></div>
          <div className="dp-fact"><strong>Free</strong><span>Curtain removal &amp; reinstallation</span></div>
        </div>
        {page.pickupNotes && <p className="dp-copy" style={{ marginTop: 24 }}>{page.pickupNotes}</p>}
        {page.landmarks?.length ? (
          <div style={{ marginTop: 34 }}>
            <h2 className="dp-title">Serving {page.suburbName} near</h2>
            <div className="dp-list">
              {page.landmarks.map((landmark) => <div key={landmark}>{landmark}</div>)}
            </div>
          </div>
        ) : null}
      </div>
      <div>
        <iframe className="dp-map" src={map} title="Hangers Clothes Spa location" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <div className="dp-band" style={{ marginTop: 20 }}>
          <h2 style={{ margin: '0 0 8px', color: '#023c62', fontSize: 18 }}>Book a pickup in {page.suburbName}</h2>
          <p className="dp-copy" style={{ fontSize: 14.5, marginBottom: 16 }}>Confirm your address and the next available collection window.</p>
          <a className="dp-btn secondary" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">Ask on WhatsApp</a>
        </div>
      </div>
    </section>
    {servicesHere.length ? (
      <section className="dp-section">
        <h2 className="dp-title">Services in {page.suburbName}</h2>
        <div className="dp-grid two">
          {servicesHere.map((sp) => (
            <Link className="dp-card" key={sp.serviceSlug} href={`/services/${sp.serviceSlug}/${sp.suburbSlug}`} style={{ color: 'inherit' }}>
              <h3>{sp.title}</h3>
              <p>{sp.intro}</p>
            </Link>
          ))}
        </div>
      </section>
    ) : null}
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
  </PublicContentPage>
}
