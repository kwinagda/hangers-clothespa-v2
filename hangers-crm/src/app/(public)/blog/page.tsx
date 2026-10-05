import { ContentTemplate, type ContentData } from '@/components/public/ContentTemplate'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
import ref from '@/lib/referenceContent.json'
export const metadata = buildPublicMetadata({ title: 'Garment Care Journal | Hangers Clothes Spa', description: 'Practical guidance for garment, curtain, stain, storage and footwear care from Hangers Clothes Spa.', path: '/blog' })

export default async function JournalPage() {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />
  return <ContentTemplate profile={profile} data={(ref as Record<string, unknown>)['blog'] as ContentData} />
}
