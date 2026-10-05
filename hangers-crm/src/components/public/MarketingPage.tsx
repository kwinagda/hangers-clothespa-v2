import PublicSiteShell from './PublicSiteShell'
import MotionRoot from './MotionRoot'
import { MARKETING_PAGE_CSS } from './marketingStyles'
import type { PublicSiteProfile } from '@/lib/publicSite'
import { buildBreadcrumbJsonLd, type Crumb } from '@/lib/schema'

export default function MarketingPage({ profile, crumbs, title, intro, children }: { profile: PublicSiteProfile; crumbs: Crumb[]; title: string; intro?: string; children: React.ReactNode }) {
  return <PublicSiteShell profile={profile}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbJsonLd(crumbs)).replace(/</g, '\\u003c') }} />
    <style>{MARKETING_PAGE_CSS}</style>
    <MotionRoot>
      <div className="hg-pagetop">
        <nav className="hg-crumb" data-rv aria-label="Breadcrumb">{crumbs.map((c, i) => <span key={c.label}>{i > 0 && ' / '}{c.href ? <a href={c.href}>{c.label}</a> : c.label}</span>)}</nav>
        <h1 className="hg-h1" data-words>{title}</h1>
        {intro && <p className="hg-lede" data-rv data-d="250">{intro}</p>}
      </div>
      {children}
    </MotionRoot>
  </PublicSiteShell>
}
