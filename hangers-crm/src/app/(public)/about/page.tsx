import { ContentTemplate, type ContentData } from '@/components/public/ContentTemplate'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
import ref from '@/lib/referenceContent.json'
export const metadata = buildPublicMetadata({ title: 'About Hangers Clothes Spa | Serving Mulund Since 2018', description: 'Learn about Hangers Clothes Spa, serving Mulund West with tracked garment and curtain care since 2018.', path: '/about' })

export default async function AboutPage() {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />
  return <ContentTemplate profile={profile} data={(ref as Record<string, unknown>)['about'] as ContentData} />
}
