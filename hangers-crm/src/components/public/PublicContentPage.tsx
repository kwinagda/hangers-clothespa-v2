'use client'

import MarketingPage from './MarketingPage'
import VideoSlot from './VideoSlot'
import type { MarketingClipId } from '@/lib/marketingClips'
import type { PublicSiteProfile } from '@/lib/publicSite'
import type { Crumb } from '@/lib/schema'

const CONTENT_CSS = `
.dp-body{max-width:1320px;margin:0 auto;padding:clamp(40px,7vw,80px) clamp(16px,4vw,28px) clamp(64px,9vw,110px);color:#0b2536}
.dp-section{padding:0 0 clamp(40px,6vw,64px)}
.dp-section:last-child{padding-bottom:0}
.dp-kicker{margin:0 0 12px;color:#3f6a88;font-size:14px;font-weight:600}
.dp-title{margin:0 0 14px;color:#023c62;font-size:clamp(26px,3.6vw,44px);line-height:1.05;letter-spacing:-.035em;font-weight:700}
.dp-copy{margin:0;color:#3d5668;font-size:17px;line-height:1.6}
.dp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.dp-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.dp-card{padding:clamp(20px,3vw,28px);border:1px solid #d6e2ec;border-radius:24px;background:#fff;color:inherit}
.dp-card h2,.dp-card h3{margin:0 0 8px;color:#023c62;font-size:21px;letter-spacing:-.02em}
.dp-card p{margin:0;color:#3d5668;font-size:16px;line-height:1.55}
.dp-card:hover{border-color:#9abbd0}
.dp-band{padding:clamp(24px,4vw,40px);border-radius:28px;background:#E8F0F7}
.dp-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:48px;align-items:start}
.dp-list{border-top:1px solid #d6e2ec}
.dp-list>div{display:flex;gap:12px;padding:16px 0;border-bottom:1px solid #d6e2ec;color:#3d5668;font-size:16px;line-height:1.55}
.dp-facts{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.dp-fact{padding:22px;border:1px solid #d6e2ec;border-radius:24px;background:#fff}
.dp-fact strong{display:block;margin-bottom:6px;color:#023c62;font-size:28px;letter-spacing:-.03em}
.dp-fact span{color:#5b7486;font-size:14px;line-height:1.5}
.dp-media{display:block;width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:24px}
.dp-btn{display:inline-flex;min-height:52px;align-items:center;justify-content:center;gap:8px;padding:0 26px;border:1.5px solid #023c62;border-radius:999px;color:#fff !important;background:#023c62;font-size:16px;font-weight:600}
.dp-btn:hover{background:#0a5a8f;border-color:#0a5a8f}
.dp-btn.secondary{color:#023c62 !important;background:#fff}
.dp-faq{border-top:1px solid #d6e2ec}
.dp-faq details{border-bottom:1px solid #d6e2ec}
.dp-faq summary{display:flex;justify-content:space-between;gap:20px;padding:22px 4px;color:#023c62;font-size:19px;font-weight:600;cursor:pointer;list-style:none}
.dp-faq summary::-webkit-details-marker{display:none}
.dp-faq summary:after{content:'+';color:#5b7486;font-size:24px;line-height:1}
.dp-faq details[open] summary:after{content:'−'}
.dp-faq p{max-width:72ch;margin:-4px 0 0;padding:0 4px 24px;color:#3d5668;font-size:17px;line-height:1.6}
.dp-map{width:100%;min-height:420px;border:0;border-radius:24px;background:#E8F0F7}
.dp-body a:focus-visible,.dp-body button:focus-visible,.dp-body summary:focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 5px #023c62;border-radius:4px}
@media(max-width:900px){.dp-grid,.dp-grid.two,.dp-split{grid-template-columns:1fr}.dp-facts{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.dp-facts{grid-template-columns:1fr}.dp-map{min-height:320px}}
`

export function PublicContentPage({ profile, crumbs, title, intro, heroActions, clip, children }: { profile: PublicSiteProfile; crumbs: Crumb[]; title: string; intro: string; dark?: boolean; heroActions?: React.ReactNode; clip?: MarketingClipId; children: React.ReactNode }) {
  return <MarketingPage profile={profile} crumbs={crumbs} title={title} intro={intro}>
    <style>{CONTENT_CSS}</style>
    <div className="dp-body">
      {heroActions && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>{heroActions}</div>}
      {clip && <section style={{ paddingBottom: 24 }}><VideoSlot clip={clip} /></section>}
      {children}
    </div>
  </MarketingPage>
}

export function PublicUnavailable() {
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#023c62' }}>Website details are being configured.</main>
}
