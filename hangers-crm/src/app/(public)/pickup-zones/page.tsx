import MarketingPage from '@/components/public/MarketingPage'
import VideoSlot from '@/components/public/VideoSlot'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
export const metadata = buildPublicMetadata({ title: 'Dry Cleaning Pickup in Mulund, Bhandup & Thane | Hangers', description: 'Pickup and delivery information for Hangers Clothes Spa customers across Mulund, Bhandup and Thane.', path: '/pickup-zones' })

const ZONES: [string, string][] = [
  ['Mulund', 'Every Hangers Clothes Spa order is processed at our own facility in Mulund West, on Jain Mandir Marg. If you live in Mulund, you are closest to the source — nothing is transported across the city before it reaches us.'],
  ['Bhandup', 'Bhandup is one stop south of Mulund on the Central Line, and one of the areas our Mulund West facility regularly collects from. Dry cleaning, curtains, sofas and shoes picked up here go straight back to the same facility that handles every Hangers order.'],
  ['Thane', 'Thane is a larger catchment north of Mulund, and one of the areas Hangers Clothes Spa serves. Whatever is collected from a Thane address — garments, curtains, footwear — travels to the Mulund West facility for the same process every other order goes through.'],
  ['Nahur', 'Nahur is the small station sitting directly between Mulund and Bhandup on the Central Line — close enough to our Mulund West facility that it falls naturally within regular pickup coverage.'],
  ['Vikhroli', 'Further down the Central Line, Vikhroli is served from the same Mulund West facility as every other Hangers order — the distance is longer than for the closer suburbs, but the process and turnaround stay identical.'],
  ['Kanjurmarg', 'Kanjurmarg sits on the Central Line between Bhandup and Vikhroli. It is one of the areas Hangers Clothes Spa collects garments, curtains and household textiles from for processing at the Mulund West facility.'],
  ['Powai', "Powai's mix of residential complexes and office campuses makes it one of the areas where Hangers sees demand from both households and workplaces. Whether it is a single household order or a recurring society arrangement, everything is processed at the Mulund West facility."],
  ['Ghatkopar', 'Ghatkopar is a major junction further down the Central Line, well connected by both rail and Metro. It is one of the areas Hangers Clothes Spa collects from, with every order brought back to the Mulund West facility for processing.'],
]

export default async function PickupZonesPage() {
  const profile = await getPublicSiteProfile()
  if (!profile) return <PublicUnavailable />
  const phone = profile.phone.replace(/\D/g, '')
  const map = `https://www.google.com/maps?q=${encodeURIComponent(profile.address)}&output=embed`
  const loop = [...ZONES, ...ZONES].map(([name]) => name)
  return <MarketingPage profile={profile} crumbs={[{ label: 'Home', href: '/' }, { label: 'Pickup zones' }]} title="Where we collect and deliver." intro={`Pickup and delivery are available across ${profile.pickupZones.join(', ')} for eligible orders above Rs. ${profile.pickupMinimumOrder}. The team confirms the collection window before a rider is assigned.`}>
    <div style={{ overflow: 'hidden', background: '#023c62', color: '#fff', padding: '12px 0', marginTop: 24 }} aria-hidden="true">
      <div data-marq style={{ display: 'flex', gap: 30, whiteSpace: 'nowrap', width: 'max-content', fontSize: 'clamp(15px,3.6vw,22px)', fontWeight: 600, letterSpacing: '-.02em', willChange: 'transform' }}>
        {loop.map((name, i) => <span key={`${name}-${i}`} style={{ display: 'flex', gap: 30, alignItems: 'center' }}>{name}<i style={{ width: 10, height: 10, borderRadius: '50%', background: '#9cc0dc', opacity: 0.7 }} /></span>)}
      </div>
    </div>
    <section className="hg-section" style={{ paddingTop: 24 }}><VideoSlot clip="zones" /></section>
    <section className="hg-body hg-section" style={{ paddingTop: 0 }}>
      <div className="hg-grid-auto">
        {ZONES.map(([name, body], i) => <a key={name} href={`/pickup-zones/${name.toLowerCase()}`} data-rv data-d={String((i % 4) * 90)} data-hover className="hg-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, color: '#023c62' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}><h3 style={{ margin: 0, fontSize: 24, letterSpacing: '-.03em' }}>{name}</h3><span aria-hidden="true" style={{ fontSize: 22 }}>→</span></div>
          <p style={{ fontSize: 15, lineHeight: 1.55 }}>{body}</p>
        </a>)}
      </div>
    </section>
    <section className="hg-body hg-section" style={{ paddingTop: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))', gap: 20, alignItems: 'stretch' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="hg-card" data-rv><h2 className="hg-h2-sm" style={{ fontSize: 26 }}>Outside the listed areas</h2><p style={{ marginTop: 10 }}>Send your location to the Hangers team. We will confirm whether a collection can be arranged; no unverified distance fee or availability is promised on the website.</p></div>
          <div className="hg-pill-note" data-rv data-d="120" style={{ flexDirection: 'column', alignItems: 'flex-start' }}><h2 className="hg-h2-sm" style={{ fontSize: 26 }}>Not sure if you are covered?</h2><p style={{ margin: 0, color: '#3d5668' }}>Send your address or society name and we will confirm the next available collection slot.</p><a className="hg-btn solid" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">Ask on WhatsApp</a></div>
        </div>
        <iframe src={map} title="Hangers Clothes Spa location" loading="lazy" referrerPolicy="no-referrer-when-downgrade" style={{ width: '100%', minHeight: 420, border: 0, borderRadius: 24, background: '#E8F0F7' }} />
      </div>
    </section>
  </MarketingPage>
}
