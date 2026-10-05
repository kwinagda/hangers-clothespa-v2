import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ContentTemplate } from '@/components/public/ContentTemplate'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
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

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema).replace(/</g, '\\u003c') }} />
    <ContentTemplate profile={profile} data={{
      crumbs: [['Home', '/'], ['Services', '/services'], [serviceName]],
      title: `${serviceName}, wherever Hangers picks up.`,
      intro: `${serviceName} is available in every area Hangers serves. Pick your neighbourhood below for local turnaround times and pickup details.`,
      ctas: [['Book a pickup', '/book-pickup', 1], ['Ask on WhatsApp', `https://wa.me/${phone}`, 0]],
      lists: [{ h: `${serviceName} by area`, items: pages.map((sp) => ({ t: sp.suburbName, s: sp.intro, href: `/services/${sp.serviceSlug}/${sp.suburbSlug}` })) }],
      note: { h: `Not sure ${serviceName.toLowerCase()} is the right process?`, p: "Send a photo of the item and its care label — we'll confirm the right process before booking.", cta: ['Ask Hangers on WhatsApp', `https://wa.me/${phone}`] },
    }} />
  </>
}
