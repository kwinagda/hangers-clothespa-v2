import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ContentTemplate } from '@/components/public/ContentTemplate'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
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

  const lists = servicesHere.length ? [{ h: `Services in ${page.suburbName}`, items: servicesHere.map((sp) => ({ t: sp.title, s: sp.intro, href: `/services/${sp.serviceSlug}/${sp.suburbSlug}` })) }] : []
  const minimum = `Rs. ${profile.pickupMinimumOrder}`
  return <>
    {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} />}
    <ContentTemplate profile={profile} data={{
      crumbs: [['Home', '/'], ['Pickup zones', '/pickup-zones'], [page.suburbName]],
      title: page.title,
      intro: page.intro,
      clip: 'zones',
      stats: [[profile.turnaround.dryCleaning, 'Dry cleaning turnaround'], [profile.turnaround.curtains, 'Curtain care turnaround'], [minimum, 'Pickup minimum order'], ['Free', 'Curtain removal & reinstallation']],
      body: page.pickupNotes || undefined,
      blocks: page.landmarks?.length ? [{ h: `Serving ${page.suburbName} near`, cards: page.landmarks.map((l: string) => ({ t: l, s: '' })) }] : undefined,
      lists,
      faq: page.faqs?.map((faq) => [faq.question, faq.answer] as [string, string]),
      note: { h: `Book a pickup in ${page.suburbName}`, p: 'Confirm your address and the next available collection window.', cta: ['Ask on WhatsApp', `https://wa.me/${phone}`] },
      map,
    }} />
  </>
}
