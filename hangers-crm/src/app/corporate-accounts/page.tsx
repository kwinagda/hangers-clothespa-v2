import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
export const metadata = buildPublicMetadata({ title: 'Corporate Laundry & Garment Care | Hangers Clothes Spa', description: 'Tailored garment and linen care for offices, clinics, salons, restaurants and hospitality businesses.', path: '/corporate-accounts' })

const segments = [
  ['Hotels & serviced apartments','Room linen, staff uniforms and guest laundry can be organised by property, department and collection schedule.'],
  ['Restaurants & cafes','Aprons, table linen, napkins and chef wear with a recurring collection plan suited to your operating hours.'],
  ['Clinics & salons','Coats, towels, drapes and workwear handled under an agreed service scope and recurring schedule.'],
  ['Offices & co-working','Employee garment care or reception collection points with item-level order tracking and clear account records.'],
]
const terms = [
  ['Minimum volume','Confirmed after requirement review'],['Route frequency','Scheduled around actual volume'],['Invoicing','Itemised and account-specific'],['Payment','Agreed before service starts'],['Trial service','Available after site discussion'],['Pricing','Quoted for the approved scope'],
]
const onboarding = [
  ['01','Requirement call','Tell us the item mix, typical volume, location and collection frequency.'],
  ['02','Site review','We confirm handling needs, access, collection timing and account contacts.'],
  ['03','Written proposal','You receive a clear scope, schedule and pricing for approval.'],
  ['04','Service starts','Collections begin only after the commercial terms and operating flow are agreed.'],
]

export default async function CorporateAccountsPage(){
  const profile=await getPublicSiteProfile(); if(!profile)return <PublicUnavailable/>
  const phone=profile.phone.replace(/\D/g,'')
  return <PublicContentPage profile={profile} dark eyebrow="Corporate accounts" title="Garment and linen care for businesses across Mumbai." intro="For hotels, restaurants, clinics, salons and offices, Hangers builds a service plan around the real item mix, volume and schedule. Every proposal is discussed and approved before service begins." heroActions={<><a className="dp-btn secondary" href={`mailto:${profile.email}?subject=Corporate service enquiry`}>Request a contract quote</a><a className="dp-btn" style={{borderColor:'rgba(255,255,255,.45)',background:'transparent'}} href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">Speak with our team</a></>}>
    <section className="dp-section"><div className="dp-facts"><div className="dp-fact"><strong>Since {profile.establishedYear}</strong><span>Local garment-care experience</span></div><div className="dp-fact"><strong>{profile.pickupZones.length} areas</strong><span>{profile.pickupZones.join(', ')}</span></div><div className="dp-fact"><strong>Tracked</strong><span>Barcode-based garment handling</span></div><div className="dp-fact"><strong>Itemised</strong><span>Clear account records and billing</span></div></div></section>
    <section className="dp-section dp-split"><div><h2 className="dp-title">What a business plan can cover</h2><div style={{display:'grid',gap:20}}>{segments.map(([name,body])=><div key={name} style={{paddingLeft:18,borderLeft:'2px solid #dce8f0'}}><h3 style={{margin:'0 0 8px',color:'#023c62',fontSize:18}}>{name}</h3><p className="dp-copy" style={{fontSize:15}}>{body}</p></div>)}</div></div><div className="dp-band"><h2 style={{margin:'0 0 18px',color:'#023c62',fontSize:20}}>Commercial terms</h2>{terms.map(([key,value])=><div key={key} style={{display:'flex',justifyContent:'space-between',gap:20,padding:'13px 0',borderBottom:'1px solid #d7e5ee',fontSize:14.5}}><span style={{color:'#7d93a8'}}>{key}</span><span style={{color:'#10243a',fontWeight:600,textAlign:'right'}}>{value}</span></div>)}<p style={{margin:'20px 0 0',color:'#7d93a8',fontSize:13.5,lineHeight:1.6}}>Rates are never invented from a generic package. We quote after understanding your actual items, volume and operating needs.</p></div></section>
    <section className="dp-band"><div className="dp-split"><div><h2 className="dp-title">How onboarding runs</h2><p className="dp-copy">The process keeps responsibilities, pricing and collection timing clear before the first business order is accepted.</p></div><div style={{display:'grid',gap:15}}>{onboarding.map(([n,title,body])=><div key={n} style={{display:'grid',gridTemplateColumns:'32px 1fr',gap:14}}><span style={{color:'#023c62',fontSize:12,fontFamily:'var(--crm-font-mono)'}}>{n}</span><div><strong style={{display:'block',marginBottom:3,color:'#023c62',fontSize:15}}>{title}</strong><span style={{color:'#4b6479',fontSize:14,lineHeight:1.55}}>{body}</span></div></div>)}</div></div></section>
  </PublicContentPage>
}
