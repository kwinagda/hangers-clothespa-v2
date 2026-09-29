import Link from 'next/link'
import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { getPublicBlogPosts, getPublicSuburbPages, getPublicServicePages } from '@/lib/publicContent'
import { buildPublicMetadata } from '@/lib/seo'

export const metadata = buildPublicMetadata({ title: 'Sitemap | Hangers Clothes Spa', description: 'Every Hangers Clothes Spa page, grouped by service and by area.', path: '/sitemap' })

export default async function SitemapPage() {
  const [profile, blogPosts, suburbPages, servicePages] = await Promise.all([
    getPublicSiteProfile(),
    getPublicBlogPosts(),
    getPublicSuburbPages(),
    getPublicServicePages(),
  ])
  if (!profile) return <PublicUnavailable />

  const byService = new Map<string, { serviceName: string; pages: typeof servicePages }>()
  for (const page of servicePages) {
    const bucket = byService.get(page.serviceSlug)
    if (bucket) bucket.pages.push(page)
    else byService.set(page.serviceSlug, { serviceName: page.serviceName, pages: [page] })
  }

  return <PublicContentPage profile={profile} crumbs={[{ label: 'Home', href: '/' }, { label: 'Sitemap' }]} title="Every Hangers page, in one place." intro="A complete, human-readable map of the site: services by area, every pickup zone and every article in the care journal. For crawlers, the machine-readable version is at /sitemap.xml.">
    <section className="dp-section">
      <h2 className="dp-title">By service</h2>
      <div className="dp-grid two">
        {Array.from(byService.entries()).map(([serviceSlug, group]) => (
          <div className="dp-card" key={serviceSlug}>
            <h3><Link href={`/services/${serviceSlug}`}>{group.serviceName}</Link></h3>
            <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {group.pages.map((sp) => (
                <li key={sp.suburbSlug}><Link href={`/services/${sp.serviceSlug}/${sp.suburbSlug}`}>{sp.suburbName}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
    <section className="dp-section">
      <h2 className="dp-title">By area</h2>
      <div className="dp-grid">
        {suburbPages.map((sp) => (
          <Link className="dp-card" key={sp.slug} href={`/pickup-zones/${sp.slug}`} style={{ color: 'inherit' }}>
            <h3>{sp.suburbName}</h3>
            <p>{sp.intro}</p>
          </Link>
        ))}
      </div>
    </section>
    <section className="dp-section">
      <h2 className="dp-title">Care journal</h2>
      <div className="dp-grid">
        {blogPosts.map((post) => (
          <Link className="dp-card" key={post.slug} href={`/blog/${post.slug}`} style={{ color: 'inherit' }}>
            <div className="dp-kicker" style={{ margin: 0 }}>{post.kicker}</div>
            <h3>{post.title}</h3>
          </Link>
        ))}
      </div>
    </section>
    <section className="dp-section">
      <h2 className="dp-title">Other pages</h2>
      <div className="dp-grid two">
        <div className="dp-card"><Link href="/services">Services</Link></div>
        <div className="dp-card"><Link href="/rate-chart">Rate chart</Link></div>
        <div className="dp-card"><Link href="/book-pickup">Book a pickup</Link></div>
        <div className="dp-card"><Link href="/pickup-zones">Pickup zones</Link></div>
        <div className="dp-card"><Link href="/monthly-plans">Monthly plans</Link></div>
        <div className="dp-card"><Link href="/corporate-accounts">Corporate accounts</Link></div>
        <div className="dp-card"><Link href="/about">About Hangers</Link></div>
        <div className="dp-card"><Link href="/faq">FAQ</Link></div>
        <div className="dp-card"><Link href="/contact">Contact</Link></div>
      </div>
    </section>
  </PublicContentPage>
}
