import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ContentTemplate } from '@/components/public/ContentTemplate'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
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

  const lists = [
    otherServicesHere.length ? { h: `Other services in ${page.suburbName}`, items: otherServicesHere.map((sp) => ({ t: sp.title, s: sp.intro, href: `/services/${sp.serviceSlug}/${sp.suburbSlug}` })) } : null,
    otherAreasForService.length ? { h: `${page.serviceName} in other areas`, items: otherAreasForService.map((sp) => ({ t: sp.suburbName, s: sp.intro, href: `/services/${sp.serviceSlug}/${sp.suburbSlug}` })) } : null,
  ].filter(Boolean) as { h: string; items: { t: string; s: string; href: string }[] }[]
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema).replace(/</g, '\\u003c') }} />
    {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} />}
    <ContentTemplate profile={profile} data={{
      crumbs: [['Home', '/'], ['Services', '/services'], [page.serviceName, `/services/${page.serviceSlug}`], [page.suburbName]],
      title: page.title,
      intro: page.intro,
      ctas: [['Book a pickup', '/book-pickup', 1], ['Ask on WhatsApp', `https://wa.me/${phone}`, 0]],
      image: { src: page.heroImage, alt: page.heroImageAlt },
      sections: page.sections.map((section) => [section.heading, section.body] as [string, string]),
      faq: page.faqs?.map((faq) => [faq.question, faq.answer] as [string, string]),
      lists,
    }} />
  </>
}
