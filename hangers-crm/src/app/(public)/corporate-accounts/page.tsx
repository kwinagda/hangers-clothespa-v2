import { ContentTemplate, type ContentData } from '@/components/public/ContentTemplate'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
import ref from '@/lib/referenceContent.json'
export const metadata = buildPublicMetadata({ title: 'Corporate Laundry & Garment Care | Hangers Clothes Spa', description: 'Tailored garment and linen care for offices, clinics, salons, restaurants and hospitality businesses.', path: '/corporate-accounts' })

export default async function CorporateAccountsPage() {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />
  return <ContentTemplate profile={profile} data={(ref as Record<string, unknown>)['corporate-accounts'] as ContentData} />
}
