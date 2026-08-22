import Link from 'next/link'
import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicRateChart, getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
export const metadata = buildPublicMetadata({ title: 'Dry Cleaning, Curtain & Laundry Services in Mulund | Hangers', description: 'Explore dry cleaning, ironing, curtain, sofa, shoe and household care services from Hangers Clothes Spa.', path: '/services' })

export default async function ServicesPage(){
  const [profile,chart]=await Promise.all([getPublicSiteProfile(),getPublicRateChart()]); if(!profile)return <PublicUnavailable/>
  const categories=(chart?.categories||[]).filter(c=>c.items.length)
  return <PublicContentPage profile={profile} eyebrow="Services" title="Every Hangers service, with its live item rates." intro="Explore garment care, ironing, curtains, household textiles, footwear and field services. Service names and prices below come directly from the active Hangers pricing catalog.">
    <section className="dp-section" style={{display:'grid',gap:20}}>{categories.map((category,index)=><article className="dp-card" key={category.id} style={{display:'grid',gridTemplateColumns:'minmax(180px,.7fr) minmax(280px,1.3fr)',gap:28,alignItems:'start'}}><div><span style={{display:'block',marginBottom:12,color:'#7d93a8',fontFamily:'var(--crm-font-mono)',fontSize:12}}>{String(index+1).padStart(2,'0')}</span><h2 style={{fontSize:22}}>{category.label}</h2><p>{profile.featuredServices.find(s=>category.key.includes(s.key)||s.key.includes(category.key))?.description||`Current ${category.label.toLowerCase()} services available from the Hangers catalog.`}</p></div><div style={{padding:20,borderRadius:12,background:'#f7f9fc'}}><div className="dp-kicker">Current catalog examples</div>{category.items.slice(0,5).map(item=><div key={item.id} style={{display:'flex',justifyContent:'space-between',gap:18,padding:'10px 0',borderBottom:'1px solid #e3edf3',fontSize:14}}><span>{item.name}</span><strong style={{color:'#023c62'}}>Rs. {item.price.toLocaleString('en-IN')}</strong></div>)}<Link href="/rate-chart" style={{display:'inline-block',marginTop:15,fontSize:13.5,fontWeight:700}}>See every {category.label.toLowerCase()} rate →</Link></div></article>)}</section>
    <section className="dp-band"><h2 className="dp-title">Inspection comes before processing</h2><p className="dp-copy">Final service suitability depends on the fabric, construction, care label and condition of the item. We confirm concerns before work begins rather than promising a process that may not be appropriate.</p></section>
    <style>{`@media(max-width:680px){.dp-card{grid-template-columns:1fr!important}}`}</style>
  </PublicContentPage>
}
