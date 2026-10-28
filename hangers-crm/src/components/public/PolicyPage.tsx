import { ContentTemplate } from './ContentTemplate'
import { PublicUnavailable } from './PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'

export type PolicySection = {
  title: string
  paragraphs: string[]
  bullets?: string[]
  link?: { href: string; label: string }
}

export async function PolicyPage({ title, intro, sections }: {
  title: string
  intro: string
  sections: PolicySection[]
}) {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />

  return <ContentTemplate profile={profile} data={{
    crumbs: [['Home', '/'], [title]],
    title,
    intro,
    body: 'Last updated: 29 September 2026',
    sections: sections.map((section) => [section.title, [...section.paragraphs, ...(section.bullets ?? [])].join(' ')] as [string, string]),
  }} />
}
