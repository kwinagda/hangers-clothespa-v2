import Link from 'next/link'
import { PublicContentPage, PublicUnavailable } from './PublicContentPage'
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

  return <PublicContentPage
    profile={profile}
    crumbs={[{ label: 'Home', href: '/' }, { label: title }]}
    title={title}
    intro={intro}
  >
    <article className="dp-policy" aria-label={title}>
      <p className="dp-copy" style={{ marginBottom: 30 }}><strong>Last updated: 29 September 2026</strong></p>
      {sections.map((section) => <section className="dp-section" key={section.title}>
        <h2 className="dp-title">{section.title}</h2>
        {section.paragraphs.map((paragraph, index) => <p className="dp-copy" key={index} style={{ marginBottom: 14 }}>{paragraph}</p>)}
        {section.link && <p className="dp-copy"><Link href={section.link.href}>{section.link.label}</Link></p>}
        {section.bullets && <ul style={{ margin: '8px 0 0', paddingLeft: 22, color: '#4b6479', fontSize: 15.5, lineHeight: 1.8 }}>
          {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
        </ul>}
      </section>)}
      <section className="dp-band">
        <h2 className="dp-title">Questions about this policy?</h2>
        <p className="dp-copy">Contact Hangers Clothes Spa at <a href={`mailto:${profile.email}`}>{profile.email}</a> or <a href={`tel:${profile.phone}`}>{profile.phone}</a>. You can also visit the <Link href="/contact">Contact Us page</Link>.</p>
      </section>
    </article>
  </PublicContentPage>
}
