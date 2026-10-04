import MarketingPage from '@/components/public/MarketingPage'
import VideoSlot from '@/components/public/VideoSlot'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
export const metadata = buildPublicMetadata({ title: 'Monthly Ironing & Garment Care Plans | Hangers', description: 'Discuss recurring ironing and garment-care plans tailored to your household.', path: '/monthly-plans' })

const PLANS: [string, string, string[]][] = [
  ['Individual', 'For one person with a regular ironing or garment-care routine.', ['Requirement reviewed with the team', 'Frequency agreed before enrolment', 'Pricing shared before the first cycle']],
  ['Household', 'For families combining recurring ironing and garment care.', ['Item mix tailored to the household', 'Collection schedule based on the service area', 'Usage and billing kept clear']],
  ['Custom', 'For higher volumes or a mixed recurring requirement.', ['Scope built from actual needs', 'No fixed fictional package price', 'Changes agreed before they apply']],
]

export default async function MonthlyPlansPage() {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />
  return <MarketingPage profile={profile} crumbs={[{ label: 'Home', href: '/' }, { label: 'Monthly plans' }]} title="Monthly care for wardrobes that need us weekly." intro="Recurring plans are arranged after we understand the household, item mix and collection frequency. There is no invented package price or automatic enrolment.">
    <section className="hg-section" style={{ paddingTop: 24 }}>
      <div className="hg-plan-track" style={{ maxWidth: 1320, margin: '0 auto', padding: '0 clamp(16px,4vw,28px)', display: 'grid', gap: 16 }}>
        {PLANS.map(([name, desc, items], i) => {
          const dark = i === 1
          return <article key={name} data-rv data-d={String(i * 120)} style={{ background: dark ? '#023c62' : '#fff', color: dark ? '#fff' : '#023c62', border: dark ? 0 : '1px solid #d6e2ec', borderRadius: 24, padding: 'clamp(24px,4vw,36px)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', scrollSnapAlign: 'start' }}>
            <img src="/brand/hangers-logo-blue.webp" alt="" aria-hidden="true" style={{ position: 'absolute', top: 24, right: 24, height: 28, opacity: 0.12, filter: dark ? 'brightness(0) invert(1)' : 'none' }} />
            <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.7 }}>{String(i + 1).padStart(2, '0')}</div>
            <h2 style={{ margin: '10px 0 0', fontSize: 40, letterSpacing: '-.04em', fontWeight: 700, color: dark ? '#fff' : '#023c62' }}>{name}</h2>
            <p style={{ margin: '12px 0 20px', fontSize: 17, lineHeight: 1.55, opacity: dark ? 0.9 : 1, color: dark ? '#fff' : '#3d5668' }}>{desc}</p>
            <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'grid', gap: 10 }}>
              {items.map((item) => <li key={item} style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.5 }}><span aria-hidden="true" style={{ color: dark ? '#fff' : '#023c62', fontWeight: 700 }}>✓</span>{item}</li>)}
            </ul>
            <a className="hg-btn" style={{ marginTop: 'auto', background: dark ? '#fff' : 'transparent', color: dark ? '#023c62' : '#023c62', borderColor: dark ? '#fff' : '#023c62' }} href={`https://wa.me/917977417014?text=${encodeURIComponent(`Hi Hangers, I would like to discuss the ${name} monthly plan.`)}`} target="_blank" rel="noreferrer">Contact us for pricing</a>
          </article>
        })}
      </div>
    </section>
    <section className="hg-section" style={{ paddingTop: 24 }}><VideoSlot clip="plans" /></section>
    <section className="hg-body hg-section" style={{ paddingTop: 0 }}>
      <h2 className="hg-h2-sm" data-rv style={{ marginBottom: 16 }}>Which plan actually fits?</h2>
      <p data-scrub style={{ fontSize: 'clamp(18px,2.6vw,26px)', lineHeight: 1.5, color: '#023c62', margin: 0, maxWidth: 860 }}>The useful plan is the one that matches how often clothes arrive and what services they need. The team reviews the expected volume before suggesting a recurring setup.</p>
    </section>
    <section className="hg-body" style={{ paddingBottom: 'clamp(48px,9vw,110px)' }}>
      <div className="hg-pill-note" data-rv style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <h2 className="hg-h2-sm">Plan rules, in full</h2>
        <p style={{ margin: 0, color: '#3d5668', fontSize: 17, lineHeight: 1.6 }}>Availability, inclusions, billing dates, carry-forward rules and cancellation terms are documented for the selected plan before it starts. Contact Hangers for the current plan terms.</p>
      </div>
    </section>
  </MarketingPage>
}
