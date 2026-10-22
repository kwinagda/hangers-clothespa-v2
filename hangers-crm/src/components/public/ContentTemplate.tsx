import Link from 'next/link'
import MarketingPage from './MarketingPage'
import VideoSlot from './VideoSlot'
import type { MarketingClipId } from '@/lib/marketingClips'
import type { PublicSiteProfile } from '@/lib/publicSite'
import type { Crumb } from '@/lib/schema'

export type ContentCard = { n?: string; t: string; s: string }
export type ContentItem = { k?: string; t: string; s: string; href: string }
export type ContentList = { h: string; items: ContentItem[] }
export type ContentBlock = { h: string; p?: string; cards: ContentCard[] }
export type ContentData = {
  crumbs: [string, string?][]
  title: string
  intro: string
  ctas?: [string, string, number][]
  stats?: [string, string][]
  image?: { src: string; alt: string }
  body?: string
  sections?: [string, string][]
  clip?: string
  blocks?: ContentBlock[]
  lists?: ContentList[]
  faq?: [string, string][]
  note?: { h: string; p: string; cta: [string, string] }
  map?: string
}

export function ContentTemplate({ profile, data }: { profile: PublicSiteProfile; data: ContentData }) {
  const crumbs: Crumb[] = data.crumbs.map(([label, href]) => ({ label, href }))
  return <MarketingPage profile={profile} crumbs={crumbs} title={data.title} intro={data.intro}>
    <div className="hg-body" style={{ paddingTop: 0 }}>
      {data.ctas && <div className="hg-actions" style={{ marginTop: 0, marginBottom: 40 }}>
        {data.ctas.map(([label, href, primary]) => <a key={label} className={`hg-btn${primary ? ' solid' : ''}`} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{label}</a>)}
      </div>}
      {data.stats && <div className="hg-grid-auto" style={{ marginBottom: 48 }}>
        {data.stats.map(([v, l]) => <div key={v} className="hg-stat" data-rv><strong>{v}</strong><span>{l}</span></div>)}
      </div>}
      {data.image && <img src={data.image.src} alt={data.image.alt} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 28, display: 'block', marginBottom: 48 }} />}
      {data.body && <p data-scrub style={{ fontSize: 'clamp(18px,2.6vw,26px)', lineHeight: 1.5, color: '#023c62', margin: '0 0 48px', maxWidth: 860 }}>{data.body}</p>}
      {data.sections && <div style={{ display: 'grid', gap: 12, marginBottom: 48 }}>
        {data.sections.map(([h, p], i) => <div key={h} className="hg-card" data-rv data-d={String((i % 6) * 70)} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 'clamp(12px,3vw,28px)' }}>
          <div style={{ fontSize: 'clamp(34px,6vw,56px)', fontWeight: 300, letterSpacing: '-.05em', color: '#023c62', opacity: 0.35, lineHeight: 1 }}>{String(i + 1).padStart(2, '0')}</div>
          <div><h2 className="hg-h2-sm" style={{ marginBottom: 8, fontSize: 'clamp(20px,3.2vw,30px)' }}>{h}</h2><p style={{ margin: 0, lineHeight: 1.6, color: '#3d5668', fontSize: 17 }}>{p}</p></div>
        </div>)}
      </div>}
      {data.map && <div style={{ marginBottom: 48 }}><iframe src={data.map} title="Hangers Clothes Spa location" loading="lazy" referrerPolicy="no-referrer-when-downgrade" style={{ width: '100%', minHeight: 420, border: 0, borderRadius: 24, background: '#E8F0F7' }} /></div>}
      {data.clip && <div style={{ marginBottom: 48 }}><VideoSlot clip={data.clip as MarketingClipId} /></div>}
      {data.blocks && data.blocks.map((b) => <section key={b.h} style={{ marginBottom: 56 }}>
        <h2 className="hg-h2-sm" data-words style={{ marginBottom: 10 }}>{b.h}</h2>
        {b.p && <p data-rv style={{ margin: '0 0 18px', color: '#3d5668', lineHeight: 1.55, fontSize: 17, maxWidth: 680 }}>{b.p}</p>}
        <div className="hg-grid-auto">
          {b.cards.map((c, i) => <div key={c.t} className="hg-card" data-rv data-d={String((i % 4) * 90)} style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 150, background: c.n ? '#E8F0F7' : '#fff' }}>
            {c.n && <div style={{ fontSize: 34, fontWeight: 300, letterSpacing: '-.05em', opacity: 0.45, lineHeight: 1 }}>{c.n}</div>}
            <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.1, color: '#023c62' }}>{c.t}</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: '#3d5668' }}>{c.s}</div>
          </div>)}
        </div>
      </section>)}
      {data.lists && data.lists.map((L) => <section key={L.h} style={{ marginBottom: 56 }}>
        <h2 className="hg-h2-sm" data-words style={{ marginBottom: 18 }}>{L.h}</h2>
        <div className="hg-grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))' }}>
          {L.items.map((it, i) => <Link key={it.href + it.t} href={it.href} className="hg-card" data-rv data-d={String((i % 3) * 80)} data-hover style={{ display: 'flex', flexDirection: 'column', gap: 10, color: '#023c62' }}>
            {it.k && <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', opacity: 0.65 }}>{it.k}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}><div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.15 }}>{it.t}</div><div style={{ fontSize: 22 }}>→</div></div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: '#3d5668' }}>{it.s}</div>
          </Link>)}
        </div>
      </section>)}
      {data.faq && <section style={{ marginBottom: 56 }}>
        <h2 className="hg-h2-sm" data-words style={{ marginBottom: 18 }}>Frequently asked</h2>
        <div className="hg-faq">
          {data.faq.map(([q, a]) => <details key={q} data-rv><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>}
      {data.note && <div className="hg-pill-note" data-rv style={{ marginBottom: 'clamp(48px,9vw,110px)' }}>
        <div style={{ maxWidth: 560 }}><h2 className="hg-h2-sm" style={{ marginBottom: 8 }}>{data.note.h}</h2><p style={{ margin: 0, lineHeight: 1.55, color: '#3d5668', fontSize: 17 }}>{data.note.p}</p></div>
        <a className="hg-btn solid" href={data.note.cta[1]} target={data.note.cta[1].startsWith('http') ? '_blank' : undefined} rel="noreferrer">{data.note.cta[0]}</a>
      </div>}
    </div>
  </MarketingPage>
}
