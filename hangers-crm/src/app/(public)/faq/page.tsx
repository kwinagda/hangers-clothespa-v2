import { ContentTemplate } from '@/components/public/ContentTemplate'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
export const metadata = buildPublicMetadata({ title: 'Dry Cleaning & Pickup FAQ | Hangers Clothes Spa', description: 'Answers about Hangers pickup, turnaround, curtain care, rates and garment tracking.', path: '/faq' })

export default async function FAQPage(){const p=await getPublicSiteProfile();if(!p)return <PublicUnavailable/>;const phone=p.phone.replace(/\D/g,'');const faqs=[
  ['Is pickup and delivery free?',`Yes, for eligible orders above Rs. ${p.pickupMinimumOrder} within ${p.pickupZones.join(', ')}. The team confirms address coverage and timing before collection.`],
  ['How long does a standard order take?',`Typical dry-cleaning turnaround is ${p.turnaround.dryCleaning}. Curtains generally take ${p.turnaround.curtains}. Exact timing depends on the item and service.`],
  ['Do you remove and reinstall curtains?',`Yes. Curtain removal and reinstallation are included with curtain cleaning, subject to access and site conditions.`],
  ['What if a stain does not come out?','Stain removal is not guaranteed. Fabric, stain age and prior treatment affect the result. The team explains visible concerns and works on a best-effort basis.'],
  ['Are the rates on the rate chart current?','The public rate chart is loaded from the active Hangers pricing catalog. Final suitability and any approved adjustment depend on inspection of the actual item.'],
  ['How are garments tracked?','Regular orders use order records and barcode-based garment tracking. Customers can receive relevant WhatsApp status updates.'],
  ['Can I drop garments at the shop?','Yes. You can visit the Mulund West shop during the opening hours listed on the Contact page.'],
  ['Do you handle business requirements?','Yes. Hangers discusses recurring garment or linen requirements with offices, clinics, salons, restaurants and hospitality businesses before preparing a proposal.'],
  ['How do I pay?','Payment methods and the amount due are shown through the order and invoice flow. Contact the team if you need confirmation before collection or delivery.'],
];const faqSchema={'@context':'https://schema.org','@type':'FAQPage',mainEntity:faqs.map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}}))};return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(faqSchema).replace(/</g,'\\u003c')}} />
    <ContentTemplate profile={p} data={{
      crumbs: [['Home','/'],['FAQ']],
      title: 'Questions we get asked at the counter.',
      intro: 'Turnaround, pickup, curtains, rates, tracking and what to expect before handing over your items.',
      faq: faqs as [string, string][],
      note: { h: 'Still unsure about an item?', p: 'Send a photo of the fabric, care label or stain before you book.', cta: [`WhatsApp ${p.phone}`, `https://wa.me/${phone}`] },
    }} />
  </>}
