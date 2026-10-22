import Link from 'next/link'
import { ContentTemplate } from '@/components/public/ContentTemplate'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
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

  const serviceLists = Array.from(byService.entries()).map(([serviceSlug, group]) => ({
    h: group.serviceName,
    items: group.pages.map((sp) => ({ t: sp.suburbName, s: '', href: `/services/${sp.serviceSlug}/${sp.suburbSlug}` })),
  }))
  return <ContentTemplate profile={profile} data={{
    crumbs: [['Home', '/'], ['Sitemap']],
    title: 'Every Hangers page, in one place.',
    intro: 'A complete, human-readable map of the site: services by area, every pickup zone and every article in the care journal. For crawlers, the machine-readable version is at /sitemap.xml.',
    lists: [
      ...serviceLists,
      { h: 'By area', items: suburbPages.map((sp) => ({ t: sp.suburbName, s: sp.intro, href: `/pickup-zones/${sp.slug}` })) },
      { h: 'Care journal', items: blogPosts.map((post) => ({ k: post.kicker, t: post.title, s: '', href: `/blog/${post.slug}` })) },
      { h: 'Other pages', items: [
        { t: 'Services', s: '', href: '/services' }, { t: 'Rate chart', s: '', href: '/rate-chart' }, { t: 'Book a pickup', s: '', href: '/book-pickup' },
        { t: 'Pickup zones', s: '', href: '/pickup-zones' }, { t: 'Monthly plans', s: '', href: '/monthly-plans' }, { t: 'Corporate accounts', s: '', href: '/corporate-accounts' },
        { t: 'About Hangers', s: '', href: '/about' },
      ] },
    ],
  }} />
}
