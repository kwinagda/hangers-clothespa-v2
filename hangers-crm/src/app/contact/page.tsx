import MarketingPage from '@/components/public/MarketingPage'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { buildPublicMetadata } from '@/lib/seo'
export const metadata = buildPublicMetadata({ title: 'Contact Hangers Clothes Spa in Mulund West', description: 'Call, WhatsApp, email or visit Hangers Clothes Spa in Mulund West, Mumbai.', path: '/contact' })

const SCENES: [string, string[]][] = [
  ['Find the shop', ['Visit Hangers Clothes Spa', 'Roop Pooja Building, Jain Mandir Marg, Mulund West']],
  ['OPENING HOURS', ['Mon-Sat', '9:00 AM - 1:30 PM', '3:30 PM - 9:00 PM', 'Sunday closed']],
  ['Call or WhatsApp us', ['Call', 'WhatsApp', 'Instagram']],
  ['Photos of a fabric, label or stain are welcome', ['Send them on WhatsApp before pickup.']],
]

export default async function ContactPage() {
  const p = await getPublicSiteProfile()
  if (!p) return <PublicUnavailable />
  const phone = p.phone.replace(/\D/g, '')
  const map = `https://www.google.com/maps?q=${encodeURIComponent(p.address)}&output=embed`
  return <MarketingPage profile={p} crumbs={[{ label: 'Home', href: '/' }, { label: 'Contact' }]} title="Visit or speak with the Hangers team." intro="Call, WhatsApp, email or visit the Mulund West shop. Photos of a fabric, label or stain are welcome when you need guidance before booking.">
    <style>{`
      @keyframes hcScene{0%{opacity:0;transform:translateY(12px)}6%{opacity:1;transform:none}28%{opacity:1;transform:none}33%,100%{opacity:0;transform:translateY(-12px)}}
      @keyframes hcBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
      .hc-panel{position:relative;aspect-ratio:16/10;border-radius:28px;overflow:hidden;background:#023c62;color:#fff}
      .hc-scene{position:absolute;inset:0;display:grid;align-content:center;gap:14px;padding:clamp(24px,6vw,64px);opacity:0;animation:hcScene 12s linear infinite}
      .hc-scene:nth-child(2){animation-delay:3s}.hc-scene:nth-child(3){animation-delay:6s}.hc-scene:nth-child(4){animation-delay:9s}
      .hc-scene h3{margin:0;font-size:clamp(28px,5vw,60px);line-height:1;letter-spacing:-.04em;font-weight:700}
      .hc-scene p{margin:0;color:#d3e4f1;font-size:clamp(15px,2vw,19px);line-height:1.5;max-width:560px}
      .hc-bar{position:absolute;left:0;right:0;bottom:0;height:4px;background:#9cc0dc;transform-origin:0 50%;animation:hcBar 12s linear infinite}
      .hc-info{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px}
      .hc-info>div{border-radius:24px;padding:28px}
      .hc-info h3{margin:0 0 12px;font-size:20px;color:#023c62}
      .hc-info p,.hc-info a{font-size:16px;line-height:1.7;color:#3d5668}
      .hc-info a{display:block;color:#023c62;font-weight:600}
      @media(prefers-reduced-motion:reduce){.hc-scene{animation:none;opacity:1}.hc-scene:not(:first-child){display:none}.hc-bar{animation:none}}
    `}</style>
    <section className="hg-body" style={{ paddingTop: 24 }}>
      <div className="hc-panel" aria-label="Contact information slideshow">
        {SCENES.map(([title, lines]) => <div key={title} className="hc-scene"><h3>{title}</h3>{lines.map((line) => <p key={line}>{line}</p>)}</div>)}
        <div className="hc-bar" aria-hidden="true" />
      </div>
    </section>
    <section className="hg-body hg-section" style={{ paddingTop: 40 }}>
      <div className="hc-info">
        <div data-rv style={{ background: '#fff', border: '1px solid #d6e2ec' }}><h3>Shop counter</h3><p>Shop No. 8A, Roop Pooja Building, Jain Mandir Marg, opposite Shivas Salon, Gavani Pada, Sarvodaya Nagar, Mulund West, Mumbai 400080</p></div>
        <div data-rv data-d="120" style={{ background: '#E8F0F7' }}><h3>Hours</h3>{p.openingHours.map((x) => <p key={x.label}>{x.label}: {x.hours}</p>)}</div>
        <div data-rv data-d="240" style={{ background: '#023c62' }}><h3 style={{ color: '#fff' }}>Reach us</h3><a href={`tel:${p.phone}`} style={{ color: '#fff' }}>{p.phone} · Call</a><a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" style={{ color: '#fff' }}>WhatsApp Hangers</a><a href={p.instagramUrl} target="_blank" rel="noreferrer" style={{ color: '#fff' }}>Instagram @hangers.cs</a></div>
      </div>
    </section>
    <section className="hg-body hg-section" style={{ paddingTop: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))', gap: 20, alignItems: 'stretch' }}>
        <iframe src={map} title="Map to Hangers Clothes Spa" loading="lazy" referrerPolicy="no-referrer-when-downgrade" style={{ width: '100%', minHeight: 420, border: 0, borderRadius: 24, background: '#E8F0F7' }} />
        <div data-rv style={{ background: '#023c62', color: '#fff', borderRadius: 24, padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 20 }}>
          <div><div style={{ fontSize: 'clamp(56px,7vw,96px)', fontWeight: 700, letterSpacing: '-.05em', lineHeight: 1 }}><span data-count data-from="0" data-to={p.googleRating} data-dec="1">{Number(p.googleRating).toFixed(1)}</span> / 5</div><div style={{ marginTop: 8, color: '#d3e4f1' }}>4.7 stars from 21 Google reviews.</div></div>
          <a className="hg-btn" style={{ background: '#fff', color: '#023c62', borderColor: '#fff', alignSelf: 'flex-start' }} href={p.mapUrl} target="_blank" rel="noreferrer">Open in Google Maps</a>
        </div>
      </div>
    </section>
  </MarketingPage>
}
