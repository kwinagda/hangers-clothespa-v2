'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import PublicSiteShell from './PublicSiteShell'
import { useHangersMotion } from './useHangersMotion'
import type { PublicSiteProfile } from '@/lib/publicSite'

type Rate = { name: string; price: number; category: string }

const SERVICE_TILES = [
  { n: '01', title: 'Dry Cleaning', body: 'Care for everyday garments and special pieces.', href: '/services/dry-cleaning' },
  { n: '02', title: 'Daily & Normal Ironing', body: 'Dependable finishing for everyday wear.', href: '/services/ironing' },
  { n: '03', title: 'Curtain Cleaning', body: 'Cleaning with free removal and reinstallation.', href: '/services/curtain-cleaning' },
  { n: '04', title: 'Sofa Cleaning', body: 'Scheduled care for home furnishings.', href: '/services/sofa-upholstery-cleaning' },
]

const STEPS = [
  ['Send the request', 'Add approximate items, preferred time and collection address.'],
  ['We confirm', 'The team checks area coverage and agrees the collection window.'],
  ['Items are received', 'The final order is created after intake and inspection.'],
  ['Follow progress', 'Regular order updates are shared through the configured WhatsApp flow.'],
]

const FEATURES = [
  ['Item-level pricing', 'Rates come from the live Hangers catalog.'],
  ['Barcode tracking', 'Regular order garments stay linked to their order.'],
  ['WhatsApp updates', 'Relevant status updates are sent as work progresses.'],
  ['Curtain care', 'Free removal and reinstallation are included.'],
]

const MOTION_CLIPS = [
  { title: 'Pickup to delivery journey', src: '/marketing-video/journey.mp4' },
  { title: 'Fabric and stain close-ups', src: '/marketing-video/fabric.mp4' },
  { title: 'Rider arriving at your door', src: '/marketing-video/rider.mp4' },
]

function LoopVideo({ src, srcMobile, label, className }: { src: string; srcMobile?: string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [chosen, setChosen] = useState(src)
  useEffect(() => {
    const query = window.matchMedia('(max-width:760px)')
    const pick = () => setChosen(query.matches && srcMobile ? srcMobile : src)
    pick()
    query.addEventListener('change', pick)
    return () => query.removeEventListener('change', pick)
  }, [src, srcMobile])
  useEffect(() => {
    const video = ref.current
    if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { video.muted = true; video.play().catch(() => {}) } else video.pause()
    }), { threshold: 0.15 })
    io.observe(video)
    return () => io.disconnect()
  }, [chosen])
  const base = chosen.replace(/\.mp4$/, '')
  return <video ref={ref} className={className} aria-label={label} muted loop playsInline preload="metadata">
    <source src={`${base}.webm`} type="video/webm" />
    <source src={`${base}.mp4`} type="video/mp4" />
  </video>
}

function HangerIcon() {
  return <svg viewBox="0 0 200 130" style={{ height: 'min(150px,15vh)', overflow: 'visible' }} aria-hidden="true">
    <g data-hanger fill="none" stroke="#023c62" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transformOrigin: '100px 24px' }}>
      <path d="M100 62 V48 C100 40 112 38 112 28 A12 12 0 1 0 88 28" />
      <path d="M100 62 L18 112 Q8 120 20 122 H180 Q192 120 182 112 Z" />
    </g>
  </svg>
}

export default function PublicWebsite({ profile, currentRates }: { profile: PublicSiteProfile; currentRates: Rate[] }) {
  const phone = profile.phone.replace(/\D/g, '')
  const motionRoot = useRef<HTMLDivElement>(null)
  useHangersMotion(motionRoot)
  const rating = Number(profile.googleRating) || 0
  return <PublicSiteShell profile={profile}>
    <div ref={motionRoot}>
    <style>{`
      .hg-home{width:calc(100% - 48px);margin:0 auto}
      .hg-section{padding:clamp(48px,7vw,96px) 0}
      .hg-kicker{margin:0 0 14px;color:#3f6a88;font-size:14px;font-weight:600}
      .hg-h2{margin:0;color:#023c62;font-size:clamp(34px,5.4vw,80px);line-height:1;letter-spacing:-.04em;font-weight:700;text-wrap:balance}
      .hg-lede{max-width:620px;margin:20px 0 0;color:var(--text);font-size:18px;line-height:1.5}
      .hg-story{position:relative;height:280vh}
      .hg-story-inner{position:sticky;top:68px;height:calc(100vh - 68px);overflow:hidden;display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:24px;align-items:center;margin:0 auto;padding:0 clamp(16px,4vw,28px)}
      .hg-eyebrow{display:inline-flex;align-items:center;gap:10px;margin:0 0 14px;color:#3f6a88;font-size:14px;font-weight:500}
      .hg-eyebrow:before{content:'';width:28px;height:2px;background:#023c62}
      .hg-story h1{margin:0;color:#023c62;font-size:clamp(32px,min(11vw,10.5vh),110px);line-height:.95;letter-spacing:-.045em;font-weight:700}
      .hg-story h1 span{display:block;will-change:transform,opacity}
      .hg-story .hg-lede{margin:20px 0 22px;max-width:520px}
      .hg-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
      .hg-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 26px;border:1.5px solid #023c62;border-radius:999px;color:#023c62;font-size:15px;font-weight:600;transition:background .3s,color .3s,border-color .3s}
      .hg-btn.solid{background:#023c62;color:#fff}
      .hg-btn:hover{background:#0a5a8f;border-color:#0a5a8f;color:#fff}
      .hg-media{position:relative;aspect-ratio:4/5;max-height:620px;width:100%;overflow:hidden;border-radius:24px;background:linear-gradient(160deg,#E8F0F7,#cfe0ee);box-shadow:0 20px 50px rgba(2,60,98,.12)}
      .hg-media video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .hg-chip{position:absolute;right:20px;top:20px;padding:14px 18px;border-radius:16px;background:#023c62;color:#fff}
      .hg-chip strong{display:block;font-size:26px;font-weight:700}
      .hg-chip span{font-size:12px;opacity:.85}
      .hg-marquee{overflow:hidden;background:#023c62;color:#fff;padding:14px 0}
      .hg-marquee-track{display:flex;gap:30px;width:max-content;white-space:nowrap;font-size:clamp(15px,3.6vw,22px);font-weight:600;letter-spacing:-.02em;will-change:transform}
      .hg-marquee-track span{display:flex;gap:30px;align-items:center}
      .hg-marquee-track i{width:10px;height:10px;border-radius:50%;background:#9cc0dc;opacity:.7}
      .hg-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:24px;padding:clamp(36px,7vw,96px) 0 24px}
      .hg-stat-v{color:#023c62;font-size:clamp(44px,5vw,72px);font-weight:700;letter-spacing:-.04em;line-height:1}
      .hg-stat-l{margin-top:6px;color:var(--text)}
      .hg-grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}
      .hg-card{background:#fff;border:1px solid #d6e2ec;border-radius:20px;padding:28px;min-height:190px;display:flex;flex-direction:column;justify-content:space-between;gap:24px;transition:transform .3s,box-shadow .3s}
      .hg-card:hover{transform:translateY(-3px);box-shadow:0 14px 32px rgba(2,60,98,.08)}
      .hg-card-n{color:#3f6a88;font-size:14px;font-weight:600}
      .hg-card h3{margin:0;color:#023c62;font-size:22px;font-weight:600;letter-spacing:-.02em}
      .hg-card p{margin:6px 0 0;color:var(--text);line-height:1.45}
      .hg-service{background:#E8F0F7;border-radius:24px;padding:32px;min-height:280px;display:flex;flex-direction:column;justify-content:space-between;color:#023c62;transition:background .3s,color .3s}
      .hg-service:hover{background:#023c62;color:#fff}
      .hg-service-n{font-size:64px;font-weight:300;letter-spacing:-.05em;opacity:.5}
      .hg-service h3{margin:0;font-size:28px;font-weight:600;letter-spacing:-.03em}
      .hg-service p{margin:8px 0 0;line-height:1.45;opacity:.85}
      .hg-curtain{background:#023c62;color:#fff;margin-top:110px}
      .hg-curtain-inner{width:calc(100% - 48px);margin:0 auto;padding:clamp(56px,9vw,110px) 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:56px;align-items:center}
      .hg-curtain h2{margin:0;font-size:clamp(34px,4.6vw,68px);line-height:1;letter-spacing:-.04em;font-weight:700}
      .hg-curtain p{margin:22px 0 28px;max-width:520px;color:#d3e4f1;font-size:18px;line-height:1.5}
      .hg-curtain .hg-btn{background:#fff;color:#023c62;border-color:#fff}
      .hg-curtain-media{position:relative;aspect-ratio:16/10;border-radius:24px;overflow:hidden;background:linear-gradient(150deg,#0a5a8f,#02304f)}
      .hg-curtain-media video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .hg-pin{position:relative;height:480vh}
      .hg-pin-inner{position:sticky;top:68px;height:calc(100vh - 68px);margin:0 auto;padding:0 clamp(16px,4vw,28px);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:center}
      .hg-pin-stage{position:relative;height:70%}
      .hg-pin-stage>h2{position:absolute;top:-30px;left:0;margin:0;font-size:18px;font-weight:600;color:#3f6a88}
      .hg-step-panel{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;opacity:0;transform:translateY(40px);transition:opacity .6s,transform .6s cubic-bezier(.2,.7,.2,1)}
      .hg-step-n{font-size:clamp(120px,22vw,340px);line-height:.8;font-weight:700;letter-spacing:-.06em;color:#E8F0F7;-webkit-text-stroke:2px #023c62}
      .hg-step-panel h3{font-size:clamp(34px,5vw,72px);letter-spacing:-.04em;line-height:1;margin:18px 0 0;color:#023c62;font-weight:700}
      .hg-step-panel p{font-size:20px;line-height:1.5;color:var(--text);max-width:520px;margin:14px 0 0}
      .hg-rail-wrap{display:flex;gap:16px;height:60%;align-items:stretch}
      .hg-rail{width:3px;background:#d6e2ec;border-radius:3px;position:relative}
      .hg-rail-fill{position:absolute;left:0;top:0;width:100%;height:0;background:#023c62;border-radius:3px}
      .hg-rail-list{display:flex;flex-direction:column;justify-content:space-between;font-size:15px;font-weight:600}
      .hg-rail-list div{color:#023c62;opacity:.35;transition:opacity .4s}
      .hg-motion{background:#023c62;color:#fff;border-radius:clamp(24px,5vw,40px);padding:clamp(22px,5vw,56px)}
      .hg-motion-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:clamp(12px,2vw,20px);margin-top:32px}
      .hg-motion-card{aspect-ratio:4/5;border-radius:20px;overflow:hidden;position:relative;background:linear-gradient(160deg,#0a5a8f,#02304f)}
      .hg-motion-card video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .hg-motion-card-title{margin-top:14px;font-size:16px;font-weight:600}
      .hg-rates{background:#fff;border:1px solid #d6e2ec;border-radius:24px;overflow:hidden}
      .hg-rate-row{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1.1fr) auto;column-gap:12px;align-items:center;padding:20px 28px;border-top:1px solid #d6e2ec}
      .hg-rate-row.head{border-top:0;background:#E8F0F7;color:#5b7486;font-size:13px;font-weight:600;padding:14px 28px}
      .hg-rate-row strong{color:#023c62;font-size:22px;font-weight:700;text-align:right;white-space:nowrap}
      .hg-rate-row span:first-child{color:#023c62;font-size:20px;font-weight:600;letter-spacing:-.02em}
      .hg-rate-row span:nth-child(2){color:var(--text)}
      .hg-local{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:56px}
      .hg-local p{color:var(--text);font-size:18px;line-height:1.55;margin:0 0 16px}
      .hg-facts{display:grid;gap:16px;align-content:start}
      .hg-fact-dark{background:#023c62;color:#fff;border-radius:24px;padding:32px;position:relative}
      .hg-fact-dark strong{display:block;font-size:clamp(56px,7vw,96px);font-weight:700;letter-spacing:-.05em;line-height:1}
      .hg-fact-dark span{display:block;margin-top:8px;color:#d3e4f1}
      .hg-fact-dark a{display:inline-block;margin-top:20px;padding:12px 22px;border-radius:999px;background:#fff;color:#023c62;font-size:14px;font-weight:600}
      .hg-fact-light{background:#E8F0F7;border-radius:24px;padding:28px}
      .hg-fact-light strong{display:block;color:#023c62;font-size:20px;line-height:1.35;font-weight:600}
      .hg-fact-light span{display:block;margin-top:6px;color:var(--text)}
      @keyframes hg-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
      @media(max-width:900px){.hg-story-inner{grid-template-columns:1fr;gap:36px;align-content:center}.hg-media{aspect-ratio:3/2;max-height:none}.hg-rate-row{grid-template-columns:1fr auto;padding:16px 18px}.hg-rate-row.head span:nth-child(2),.hg-rate-row span:nth-child(2){display:none}.hg-pin-inner{grid-template-columns:1fr}.hg-rail-wrap{display:none}}
      @media(max-width:560px){.hg-home{width:calc(100% - 36px)}.hg-section{padding:44px 0}.hg-curtain-inner{width:calc(100% - 36px)}.hg-service{min-height:220px}.hg-chip{right:12px;top:12px}.hg-pin-inner{padding:0 18px}}
      @media(prefers-reduced-motion:reduce){.hg-story,.hg-pin{height:auto}.hg-story-inner,.hg-pin-inner{position:relative;top:0;height:auto}.hg-step-panel{position:relative;opacity:1;transform:none;margin-bottom:24px}.hg-pin-stage{height:auto}}
    `}</style>
    <div className="hg-home">
      <section className="hg-story" data-hero aria-labelledby="hg-hero-title">
        <div className="hg-story-inner">
          <div>
            <p className="hg-eyebrow">Serving Mulund since {profile.establishedYear} · {profile.googleRating} ★ from {profile.googleReviewCount} reviews</p>
            <h1 id="hg-hero-title"><span data-line="0">Dry cleaning.</span><span data-line="1">Free pickup.</span><span data-line="2">Delivered back.</span></h1>
            <p className="hg-lede">Professional dry cleaning, curtain care, ironing and home furnishing care in Mulund West. Free pickup &amp; delivery above Rs. {profile.pickupMinimumOrder}.</p>
            <div className="hg-actions">
              <Link data-mag className="hg-btn solid" href="/book-pickup">Book a pickup</Link>
              <a data-mag className="hg-btn" href={`tel:${profile.phone}`}>Call</a>
              <a data-mag className="hg-btn" href={`https://wa.me/${phone}`}>WhatsApp</a>
            </div>
          </div>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, minWidth: 0 }}>
            <HangerIcon />
            <div className="hg-media" data-hide-m style={{ height: 'min(375px,34vh)', minWidth: 200, maxWidth: '80%', aspectRatio: '4/5' }}>
              <LoopVideo src="/marketing-video/welcome.mp4" label="Hangers avatar welcome" />
              <div className="hg-chip"><span>Pickup above</span><strong>Rs. {profile.pickupMinimumOrder}</strong><span>is free</span></div>
            </div>
          </div>
        </div>
      </section>

    </div>
      <div className="hg-marquee" aria-hidden="true">
        <div className="hg-marquee-track" data-marq>
          {[0, 1].map((copy) => <span key={copy}>{profile.pickupZones.map((zone) => <span key={`${copy}-${zone}`}>{zone}<i /></span>)}</span>)}
        </div>
      </div>

    <div className="hg-home">
      <section className="hg-stats" aria-label="Key facts">
        <div data-rv><div className="hg-stat-v">{profile.turnaround.dryCleaning}</div><div className="hg-stat-l">Typical dry-cleaning turnaround</div></div>
        <div data-rv data-d="120"><div className="hg-stat-v">Free</div><div className="hg-stat-l">Pickup above Rs. {profile.pickupMinimumOrder}</div></div>
        <div data-rv data-d="240"><div className="hg-stat-v">Since <span data-count data-from="2000" data-to={profile.establishedYear}>{profile.establishedYear}</span></div><div className="hg-stat-l">Serving Mulund West</div></div>
        <div data-rv data-d="360"><div className="hg-stat-v"><span data-count data-from="0" data-to={rating} data-dec="1">{rating.toFixed(1)}</span> ★</div><div className="hg-stat-l">Based on {profile.googleReviewCount} Google reviews</div></div>
      </section>

      <section className="hg-section" style={{ paddingTop: 40 }}>
        <div className="hg-grid4">
          {FEATURES.map(([title, body], i) => <div className="hg-card" data-rv data-d={String(i * 110)} data-hover key={title}><div className="hg-card-n">{String(i + 1).padStart(2, '0')}</div><div><h3>{title}</h3><p>{body}</p></div></div>)}
        </div>
      </section>

      <section className="hg-section" style={{ paddingTop: 110 }}>
        <p className="hg-kicker" data-rv>What we do</p>
        <h2 className="hg-h2" data-words>Garment, curtain and home care under one roof.</h2>
        <p className="hg-lede" data-rv data-d="160">Service information comes from the configured Hangers public profile. Item prices remain available in the live rate chart.</p>
        <div className="hg-grid4" style={{ marginTop: 48 }}>
          {SERVICE_TILES.map((tile, i) => <Link className="hg-service" data-rv data-d={String(i * 110)} data-hover key={tile.href} href={tile.href}><div className="hg-service-n">{tile.n}</div><div><h3>{tile.title}</h3><p>{tile.body}</p></div></Link>)}
        </div>
      </section>
    </div>

    <section className="hg-curtain" aria-labelledby="hg-curtain-title">
      <div className="hg-curtain-inner">
        <div>
          <p className="hg-kicker" data-rv style={{ color: '#9cc0dc' }}>Curtain Cleaning</p>
          <h2 id="hg-curtain-title" data-words>Curtain care from removal to reinstallation.</h2>
          <p data-rv data-d="160">Hangers removes, cleans, finishes and reinstalls curtains at no extra fitting charge. Typical turnaround is {profile.turnaround.curtains}.</p>
          <Link data-mag className="hg-btn" href="/services/curtain-cleaning">Curtain Cleaning</Link>
        </div>
        <div className="hg-curtain-media" data-rv="scale" data-d="120"><LoopVideo src="/marketing-video/curtain.mp4" srcMobile="/marketing-video/curtain-m.mp4" label="Curtain removal to reinstallation" /></div>
      </div>
    </section>

    <div className="hg-home">
      <section className="hg-pin" data-pin aria-labelledby="hg-steps-title">
        <div className="hg-pin-inner">
          <div className="hg-pin-stage">
            <h2 id="hg-steps-title">How a pickup works</h2>
            {STEPS.map(([title, body], i) => <div className="hg-step-panel" data-step={i} key={title}><div className="hg-step-n">{String(i + 1).padStart(2, '0')}</div><h3>{title}</h3><p>{body}</p></div>)}
          </div>
          <div className="hg-rail-wrap">
            <div className="hg-rail"><div className="hg-rail-fill" data-railfill /></div>
            <div className="hg-rail-list">{STEPS.map(([title], i) => <div data-rail={i} key={title}>{String(i + 1).padStart(2, '0')} · {title}</div>)}</div>
          </div>
        </div>
      </section>

      <section className="hg-section" style={{ paddingTop: 24 }} aria-labelledby="hg-motion-title">
        <div className="hg-motion">
          <p className="hg-kicker" data-rv style={{ color: '#9cc0dc' }}>In motion</p>
          <h2 id="hg-motion-title" className="hg-h2" data-words style={{ color: '#fff', fontSize: 'clamp(30px,5.4vw,64px)' }}>See Hangers at work.</h2>
          <div className="hg-motion-grid">
            {MOTION_CLIPS.map((clip, i) => <div data-rv data-d={String(i * 110)} key={clip.src}><div className="hg-motion-card"><LoopVideo src={clip.src} label={clip.title} /></div><div className="hg-motion-card-title">{clip.title}</div></div>)}
          </div>
        </div>
      </section>

      <section className="hg-section" style={{ paddingTop: 40 }} aria-labelledby="hg-rates-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 20, flexWrap: 'wrap', marginBottom: 32 }}>
          <div>
            <p className="hg-kicker" data-rv>Popular rates</p>
            <h2 id="hg-rates-title" className="hg-h2" data-rv data-d="80">Current catalog prices at a glance.</h2>
          </div>
          <Link data-mag href="/rate-chart" style={{ fontWeight: 600, borderBottom: '2px solid #023c62', paddingBottom: 2, color: '#023c62' }}>Full rate chart →</Link>
        </div>
        <div className="hg-rates">
          <div className="hg-rate-row head"><span>Item</span><span>Service</span><span style={{ textAlign: 'right' }}>Rate</span></div>
          {currentRates.map((rate, i) => <div className="hg-rate-row" data-rv data-d={String(i * 80)} key={`${rate.category}-${rate.name}`}><span>{rate.name}</span><span>{rate.category}</span><strong>Rs. {rate.price.toLocaleString('en-IN')}</strong></div>)}
        </div>
      </section>

      <section className="hg-section" style={{ paddingTop: 0 }} aria-labelledby="hg-local-title">
        <div className="hg-local">
          <div>
            <h2 id="hg-local-title" className="hg-h2" data-words style={{ fontSize: 'clamp(34px,4.6vw,64px)', marginBottom: 24 }}>Why local households keep Hangers saved.</h2>
            <p data-rv>The useful details are clear before the item leaves your hands: where pickup is available, the current catalog price, the expected turnaround, and how the order will be tracked.</p>
            <p data-rv data-d="120">For curtains, Hangers also manages removal and reinstallation. For unusual fabrics, stains or furnishings, the team confirms service suitability after inspection.</p>
          </div>
          <div className="hg-facts">
            <div className="hg-fact-dark" data-rv><strong><span data-count data-from="0" data-to={rating} data-dec="1">{rating.toFixed(1)}</span> / 5</strong><span>Google rating from {profile.googleReviewCount} reviews</span><a data-mag href={profile.mapUrl} target="_blank" rel="noreferrer">View Hangers on Google</a></div>
            <div className="hg-fact-light" data-rv data-d="120"><strong>{profile.pickupZones.join(' · ')}</strong><span>Primary pickup and delivery areas</span></div>
            <div className="hg-fact-light" data-rv data-d="240" style={{ background: '#fff', border: '1px solid #d6e2ec' }}><strong style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-.04em', color: '#023c62' }}>{profile.turnaround.curtains}</strong><span>Typical curtain-care turnaround</span></div>
          </div>
        </div>
      </section>
    </div>
    </div>
  </PublicSiteShell>
}
