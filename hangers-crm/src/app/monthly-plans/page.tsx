import { Check } from 'lucide-react'
import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
export const metadata = buildPublicMetadata({ title: 'Monthly Ironing & Garment Care Plans | Hangers', description: 'Discuss recurring ironing and garment-care plans tailored to your household.', path: '/monthly-plans' })

const plans=[
  ['Individual','For one person with a regular ironing or garment-care routine.',['Requirement reviewed with the team','Frequency agreed before enrolment','Pricing shared before the first cycle']],
  ['Household','For families combining recurring ironing and garment care.',['Item mix tailored to the household','Collection schedule based on the service area','Usage and billing kept clear']],
  ['Custom','For higher volumes or a mixed recurring requirement.',['Scope built from actual needs','No fixed fictional package price','Changes agreed before they apply']],
]
export default async function MonthlyPlansPage(){const profile=await getPublicSiteProfile();if(!profile)return <PublicUnavailable/>;const phone=profile.phone.replace(/\D/g,'');return <PublicContentPage profile={profile} eyebrow="Monthly plans" title="Monthly care for wardrobes that need us weekly." intro="Recurring plans are arranged after we understand the household, item mix and collection frequency. There is no invented package price or automatic enrolment.">
  <section className="dp-section"><div className="dp-grid">{plans.map(([name,desc,items])=><article className="dp-card" key={name as string} style={{display:'flex',flexDirection:'column'}}><h2>{name as string}</h2><p style={{marginBottom:20}}>{desc as string}</p><div style={{display:'grid',gap:11,marginBottom:24}}>{(items as string[]).map(item=><div key={item} style={{display:'flex',gap:9,color:'#4b6479',fontSize:14,lineHeight:1.5}}><Check size={16} style={{flex:'0 0 auto',margin:2,color:'#0d6fa8'}}/>{item}</div>)}</div><a className="dp-btn" style={{marginTop:'auto'}} href={`https://wa.me/${phone}?text=${encodeURIComponent(`Hi Hangers, I would like to discuss the ${name} monthly plan.`)}`} target="_blank" rel="noreferrer">Contact us for pricing</a></article>)}</div></section>
  <section className="dp-section dp-split"><div><h2 className="dp-title">Which plan actually fits?</h2><p className="dp-copy">The useful plan is the one that matches how often clothes arrive and what services they need. The team reviews the expected volume before suggesting a recurring setup.</p></div><div className="dp-list"><div><Check size={18}/>Discuss the regular garment or ironing requirement.</div><div><Check size={18}/>Confirm pickup area and preferred frequency.</div><div><Check size={18}/>Approve the scope and pricing before enrolment.</div></div></section>
  <section className="dp-band"><h2 className="dp-title">Plan rules, in full</h2><p className="dp-copy">Availability, inclusions, billing dates, carry-forward rules and cancellation terms are documented for the selected plan before it starts. Contact Hangers for the current plan terms.</p></section>
  </PublicContentPage>}
