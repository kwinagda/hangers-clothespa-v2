import { SITE_URL } from '@/lib/seo'

export const BUSINESS_ID = `${SITE_URL}/#business`

export function organizationRef() {
  return { '@id': BUSINESS_ID }
}

export type Crumb = { label: string; href?: string }

export function buildBreadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      ...(crumb.href ? { item: `${SITE_URL}${crumb.href}` } : {}),
    })),
  }
}
