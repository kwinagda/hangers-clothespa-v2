import { ContentTemplate, type ContentData } from '@/components/public/ContentTemplate'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
import ref from '@/lib/referenceContent.json'

const title = 'Privacy Policy'
const description = 'How Hangers Clothes Spa handles information submitted for local garment-care services, pickup requests and payments.'
export const metadata = buildPublicMetadata({ title: `${title} | Hangers Clothes Spa`, description, path: '/privacy-policy' })

export default async function PrivacyPolicyPage() {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />
  return <ContentTemplate profile={profile} data={(ref as Record<string, unknown>)['privacy-policy'] as ContentData} />
}
