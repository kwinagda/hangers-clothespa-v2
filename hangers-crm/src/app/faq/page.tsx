import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
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
];return <PublicContentPage profile={p} eyebrow="FAQ" title="Questions we get asked at the counter." intro="Turnaround, pickup, curtains, rates, tracking and what to expect before handing over your items.">
  <section className="dp-faq">{faqs.map(([q,a],i)=><details key={q} open={i===0}><summary>{q}</summary><p>{a}</p></details>)}</section>
  <section className="dp-band" style={{marginTop:44,display:'flex',alignItems:'center',justifyContent:'space-between',gap:24,flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 6px',color:'#023c62',fontSize:20}}>Still unsure about an item?</h2><p className="dp-copy" style={{fontSize:15}}>Send a photo of the fabric, care label or stain before you book.</p></div><a className="dp-btn" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">WhatsApp {p.phone}</a></section>
  </PublicContentPage>}
