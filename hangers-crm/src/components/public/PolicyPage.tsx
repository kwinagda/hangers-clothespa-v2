import { ContentTemplate } from './ContentTemplate'
import { PublicUnavailable } from './PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'

export type PolicySection = {
  title: string
  paragraphs: string[]
  bullets?: string[]
  link?: { href: string; label: string }
}

export async function PolicyPage({ title, intro, sections, lastUpdated = '29 September 2026' }: {
  title: string
  intro: string
  sections: PolicySection[]
  lastUpdated?: string
}) {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />

  return <ContentTemplate profile={profile} data={{
    crumbs: [['Home', '/'], [title]],
    title,
    intro,
    body: `Last updated: ${lastUpdated}`,
    sections: sections.map((section) => [section.title, [...section.paragraphs, ...(section.bullets ?? [])].join(' ')] as [string, string]),
    lists: sections.some((section) => section.link) ? [{
      h: 'Related information',
      items: sections.filter((section) => section.link).map((section) => ({
        t: section.link!.label,
        s: section.title,
        href: section.link!.href,
      })),
    }] : undefined,
    note: {
      h: 'Questions about this policy?',
      p: `Contact Hangers Clothes Spa at ${profile.email} or ${profile.phone}.`,
      cta: ['Contact Us', '/contact'],
    },
  }} />
}
