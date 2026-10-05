'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LOGO_BLUE_URL, LOGO_WHITE_URL } from '@/lib/branding'
import type { PublicSiteProfile } from '@/lib/publicSite'
import { MARKETING_TOKENS_CSS } from './marketingTokens'
import { reduceMotion } from './marketingMotion'

const NAV: [string, string][] = [
  ['/services', 'Services'], ['/rate-chart', 'Rate chart'], ['/monthly-plans', 'Plans'],
  ['/pickup-zones', 'Zones'], ['/corporate-accounts', 'Corporate'], ['/about', 'About'],
  ['/blog', 'Journal'], ['/faq', 'FAQ'], ['/contact', 'Contact'],
]

const SERVICE_LINKS: [string, string][] = [
  ['/services/dry-cleaning', 'Dry Cleaning'],
  ['/services/curtain-cleaning', 'Curtain Cleaning'],
  ['/services/ironing', 'Ironing'],
  ['/services/sofa-upholstery-cleaning', 'Sofa & Upholstery Cleaning'],
  ['/services/shoe-care', 'Shoe Care'],
  ['/services/household-textile-care', 'Household Textile Care'],
]

const LEGAL_LINKS: [string, string][] = [
  ['/terms-and-conditions', 'Terms and Conditions'],
  ['/privacy-policy', 'Privacy Policy'],
  ['/cancellation-refund', 'Cancellation and Refund'],
  ['/shipping-exchange', 'Shipping and Exchange'],
  ['/contact', 'Contact Us'],
]

const WHATSAPP = 'https://wa.me/917977417014'

export default function PublicSiteShell({ profile, children }: { profile: PublicSiteProfile; children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [progress, setProgress] = useState(0)
  const [stripHeight, setStripHeight] = useState(38)
  const stripRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { setMenuOpen(false) }, [pathname])
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      setScrollY(y)
      setProgress(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [])
  useEffect(() => {
    if (stripRef.current) setStripHeight(stripRef.current.offsetHeight)
  }, [])
  useEffect(() => {
    if (!menuOpen) return
    document.body.style.overflow = 'hidden'
    const first = overlayRef.current?.querySelector('a')
    if (first instanceof HTMLElement) first.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); toggleRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey) }
  }, [menuOpen])
  const reduce = typeof window !== 'undefined' && reduceMotion()
  const headerTop = Math.max(0, stripHeight - scrollY)
  const showMobileBar = scrollY > 300
  const siteUrl = profile.seo?.siteUrl || 'https://hangers-cs.com'
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'DryCleaningOrLaundry',
    '@id': `${siteUrl}/#business`,
    name: profile.businessName,
    url: siteUrl,
    logo: `${siteUrl}${LOGO_BLUE_URL}`,
    image: [`${siteUrl}/brand/curtain-care-hero.webp`, `${siteUrl}/brand/garment-care-hero.webp`],
    telephone: profile.phone,
    email: profile.email,
    foundingDate: String(profile.establishedYear),
    address: { '@type': 'PostalAddress', ...profile.seo?.address },
    areaServed: profile.pickupZones.map((name) => ({ '@type': 'Place', name })),
    openingHoursSpecification: (profile.seo?.openingHoursSpecification || []).map((hours) => ({ '@type': 'OpeningHoursSpecification', ...hours })),
    sameAs: [profile.instagramUrl, profile.mapUrl],
    aggregateRating: profile.googleRating > 0 && profile.googleReviewCount > 0 ? {
      '@type': 'AggregateRating', ratingValue: profile.googleRating, reviewCount: profile.googleReviewCount,
    } : undefined,
  }
  return <div className="dw-root">
    <style>{MARKETING_TOKENS_CSS}</style>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
    <style>{`
      .dw-root{min-height:100vh;background:#F7F9FC;color:var(--hg-ink);-webkit-font-smoothing:antialiased;overflow-x:clip}
      .dw-root *{box-sizing:border-box}
      .dw-container{width:min(100% - 48px,var(--hg-container));margin-inline:auto}
      .dw-strip{background:var(--hg-navy);color:#fff;font-size:13px;position:relative;z-index:121}
      .dw-strip-row{min-height:38px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding-block:9px}
      .dw-strip a{color:#fff;font-weight:600;white-space:nowrap}
      .dw-strip .short{display:none}
      .dw-progress{position:fixed;top:0;left:0;right:0;height:3px;background:var(--hg-navy);transform-origin:0 50%;z-index:120}
      .dw-header{position:fixed;left:0;right:0;z-index:110;background:rgba(247,249,252,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transition:box-shadow .3s,top .1s}
      .dw-nav{min-height:68px;display:flex;align-items:center;gap:16px}
      .dw-logo{display:block;height:36px;width:auto}
      .dw-links{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-left:auto;font-size:13px;font-weight:500}
      .dw-links a{padding:6px 2px;border-bottom:2px solid transparent;color:var(--hg-navy);transition:border-color .3s}
      .dw-links a:hover,.dw-links a[aria-current=page]{border-color:var(--hg-navy)}
      .dw-staff{color:var(--hg-navy);font-size:13px;font-weight:500;white-space:nowrap}
      .dw-book{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:11px 22px;border-radius:999px;background:var(--hg-navy);color:#fff !important;font-size:14px;font-weight:600;white-space:nowrap;transition:background .3s}
      .dw-book:hover{background:var(--hg-navy-hover)}
      .dw-toggle{display:none;width:48px;height:48px;margin-left:auto;border:0;border-radius:50%;background:var(--hg-pale);cursor:pointer;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:0}
      .dw-toggle span{width:20px;height:2px;background:var(--hg-navy);border-radius:2px;transition:transform .35s cubic-bezier(.2,.7,.2,1),opacity .2s}
      .dw-overlay{position:fixed;inset:0;z-index:200;background:var(--hg-navy);color:#fff;display:flex;flex-direction:column;overflow:hidden;clip-path:circle(0% at calc(100% - 40px) 40px);transition:clip-path .6s cubic-bezier(.7,0,.2,1);visibility:hidden}
      .dw-overlay.open{clip-path:circle(150% at calc(100% - 40px) 40px);visibility:visible}
      .dw-overlay-logo{position:absolute;right:20px;bottom:220px;width:200px;opacity:.07;pointer-events:none}
      .dw-overlay-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:12px 20px;height:68px;box-sizing:border-box}
      .dw-overlay-head img{height:34px;filter:brightness(0) invert(1)}
      .dw-close{width:48px;height:48px;border-radius:50%;border:0;background:rgba(255,255,255,.14);color:#fff;font-size:26px;line-height:1;cursor:pointer}
      .dw-overlay-nav{flex:1;min-height:0;overflow:auto;padding:4px 24px 12px;display:flex;flex-direction:column;justify-content:center}
      .dw-overlay-nav a{color:#fff;font-size:clamp(24px,7vw,30px);font-weight:600;letter-spacing:-.03em;padding:clamp(8px,1.8vh,14px) 0;border-bottom:1px solid rgba(255,255,255,.14);display:flex;justify-content:space-between;align-items:baseline;opacity:0;transform:translateY(30px);transition:opacity .5s,transform .6s cubic-bezier(.2,.7,.2,1)}
      .dw-overlay.open .dw-overlay-nav a{opacity:1;transform:none}
      .dw-overlay-nav .n{font-size:13px;font-weight:500;opacity:.5;min-width:22px}
      .dw-overlay-nav .arrow{font-size:22px;opacity:.6}
      .dw-overlay-cta{flex:0 0 auto;padding:12px 20px calc(20px + env(safe-area-inset-bottom));display:grid;gap:10px;opacity:0;transition:opacity .5s .5s}
      .dw-overlay.open .dw-overlay-cta{opacity:1}
      .dw-overlay-cta a{text-align:center;padding:17px;border-radius:999px;font-weight:700;font-size:17px;color:var(--hg-navy);background:#fff}
      .dw-overlay-cta .pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .dw-overlay-cta .pair a{background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.7);padding:14px;font-size:16px;font-weight:600}
      .dw-main{min-height:50vh}
      .dw-cta{padding:clamp(40px,8vw,100px) clamp(12px,4vw,28px)}
      .dw-cta-card{max-width:var(--hg-container);margin:0 auto;padding:clamp(40px,8vw,120px) clamp(22px,6vw,96px);border-radius:clamp(24px,5vw,40px);background:var(--hg-navy);color:#fff;position:relative;overflow:hidden}
      .dw-cta-card img{position:absolute;right:clamp(16px,4vw,48px);bottom:clamp(16px,4vw,48px);width:min(280px,50%);opacity:.12;pointer-events:none}
      .dw-cta h2{position:relative;max-width:900px;margin:0;font-size:clamp(38px,9.4vw,108px);line-height:.96;letter-spacing:-.045em;font-weight:700}
      .dw-cta p{position:relative;margin:22px 0 28px;color:var(--hg-on-navy);font-size:clamp(17px,2.4vw,20px)}
      .dw-cta-actions{position:relative;display:flex;flex-wrap:wrap;gap:12px}
      .dw-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:16px 30px;border-radius:999px;font-weight:600;font-size:16px}
      .dw-btn.primary{background:#fff;color:var(--hg-navy) !important}
      .dw-btn.outline{border:1.5px solid #fff;color:#fff !important;padding:15px 28px}
      .dw-footer{padding:0 clamp(16px,4vw,28px) 48px;color:var(--hg-text)}
      .dw-footer-grid{max-width:var(--hg-container);margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:32px;font-size:14px;line-height:1.8}
      .dw-footer-logo{height:36px;width:auto;max-width:100%;align-self:flex-start;margin-bottom:12px}
      .dw-footer-col{display:flex;flex-direction:column}
      .dw-footer-col b{color:var(--hg-navy)}
      .dw-footer-col a,.dw-footer-col span{color:var(--hg-text);font-size:14px}
      .dw-footer-bottom{grid-column:1/-1;display:flex;justify-content:space-between;gap:12px 16px;flex-wrap:wrap;padding-top:20px;border-top:1px solid var(--hg-divider);font-size:13px}
      .dw-footer-legal{display:flex;gap:6px 16px;flex-wrap:wrap}
      .dw-sticky{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:100;display:none;gap:8px;padding:8px;border-radius:999px;background:var(--hg-navy);box-shadow:var(--hg-shadow-bar);transform:translateY(${showMobileBar ? '0' : '140px'});transition:transform .5s cubic-bezier(.2,.7,.2,1)}
      .dw-sticky a{display:flex;align-items:center;justify-content:center;height:52px;border-radius:999px;color:#fff;font-size:14px;font-weight:600}
      .dw-sticky .round{flex:0 0 52px;background:rgba(255,255,255,.14)}
      .dw-sticky .book{flex:1;background:#fff;color:var(--hg-navy) !important;font-size:16px;font-weight:700}
      .dw-sticky .wa{flex:0 0 auto;padding:0 16px;background:rgba(255,255,255,.14)}
      @media(max-width:1000px){.dw-links,.dw-staff,.dw-book{display:none}.dw-toggle{display:flex}}
      @media(max-width:760px){.dw-sticky{display:flex}.dw-footer{padding-bottom:110px}.dw-cta-card img{display:none}.dw-strip .long{display:none}.dw-strip .short{display:inline}}
      @media(min-width:761px){.dw-strip .long{display:inline}}
      @media(max-width:560px){.dw-container{width:min(100% - 36px,var(--hg-container))}.dw-strip-row{flex-direction:column;align-items:flex-start;gap:2px;padding-block:7px}.dw-nav{min-height:64px}.dw-btn{width:100%}}
      @media(prefers-reduced-motion:reduce){.dw-overlay,.dw-overlay-nav a,.dw-sticky,.dw-header{transition:none !important}}
    `}</style>
    <div className="dw-strip" ref={stripRef}>
      <div className="dw-container dw-strip-row">
        <span className="long">Free pickup &amp; delivery above Rs. {profile.pickupMinimumOrder} across {profile.pickupZones.join(', ')}</span>
        <span className="short">Free pickup &amp; delivery above Rs. {profile.pickupMinimumOrder}</span>
        <a href={`tel:${profile.phone}`}>Call {profile.phone}</a>
      </div>
    </div>
    <div className="dw-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
    <header className="dw-header" style={{ top: headerTop, boxShadow: scrollY > 20 ? 'var(--hg-shadow-header)' : 'none' }}>
      <nav className="dw-container dw-nav" aria-label="Primary">
        <Link href="/" aria-label={profile.businessName}><img className="dw-logo" src={LOGO_BLUE_URL} alt={profile.businessName} /></Link>
        <div className="dw-links">{NAV.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}</div>
        <a className="dw-staff" href="/login">Staff Login</a>
        <Link className="dw-book" href="/book-pickup">Book a pickup</Link>
        <button ref={toggleRef} className="dw-toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="dw-overlay" onClick={() => setMenuOpen((v) => !v)}>
          <span style={{ transform: menuOpen ? 'translateY(8px) rotate(45deg)' : 'none' }} />
          <span style={{ opacity: menuOpen ? 0 : 1 }} />
          <span style={{ transform: menuOpen ? 'translateY(-8px) rotate(-45deg)' : 'none' }} />
        </button>
      </nav>
    </header>
    <div id="dw-overlay" ref={overlayRef} className={`dw-overlay${menuOpen ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Site menu" aria-hidden={!menuOpen}>
      <img className="dw-overlay-logo" src={LOGO_WHITE_URL} alt="" />
      <div className="dw-overlay-head">
        <img src={LOGO_WHITE_URL} alt={profile.businessName} />
        <button className="dw-close" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>×</button>
      </div>
      <nav className="dw-overlay-nav" aria-label="Mobile">
        {NAV.map(([href, label], i) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} style={{ transitionDelay: menuOpen && !reduce ? `${0.15 + i * 0.05}s` : '0s' }}><span style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}><span className="n">{String(i + 1).padStart(2, '0')}</span>{label}</span><span className="arrow">→</span></Link>)}
      </nav>
      <div className="dw-overlay-cta">
        <Link href="/book-pickup" onClick={() => setMenuOpen(false)}>Book a pickup</Link>
        <div className="pair"><a href={`tel:${profile.phone}`}>Call</a><a href={WHATSAPP}>WhatsApp</a></div>
      </div>
    </div>
    <main className="dw-main">{children}</main>
    {pathname !== '/book-pickup' && <section className="dw-cta">
      <div className="dw-cta-card">
        <img src={LOGO_WHITE_URL} alt="" />
        <h2>Hand us the pile. We will handle the care.</h2>
        <p>Free pickup and delivery above Rs. {profile.pickupMinimumOrder}. No account needed.</p>
        <div className="dw-cta-actions">
          <Link className="dw-btn primary" href="/book-pickup">Book a pickup <ArrowRight size={16} /></Link>
          <Link className="dw-btn outline" href="/rate-chart">See the rate chart</Link>
        </div>
      </div>
    </section>}
    <footer className="dw-footer">
      <div className="dw-footer-grid">
        <div className="dw-footer-col">
          <img className="dw-footer-logo" src={LOGO_BLUE_URL} alt={profile.businessName} />
          <div>Professional garment, curtain and home-furnishing care in Mulund West since {profile.establishedYear}.</div>
          <div style={{ marginTop: 10 }}>{profile.openingHours.map((x) => <div key={x.label}>{x.label}: {x.hours}</div>)}</div>
        </div>
        <nav className="dw-footer-col" aria-label="Site pages"><b>Pages</b><Link href="/">Home</Link><Link href="/services">Services</Link><Link href="/rate-chart">Rate chart</Link><Link href="/book-pickup">Book a pickup</Link><Link href="/monthly-plans">Monthly plans</Link></nav>
        <nav className="dw-footer-col" aria-label="More pages"><b>More</b><Link href="/pickup-zones">Pickup zones</Link><Link href="/corporate-accounts">Corporate accounts</Link><Link href="/about">About Hangers</Link><Link href="/blog">Care journal</Link><Link href="/faq">FAQ</Link></nav>
        <nav className="dw-footer-col" aria-label="Explore by service"><b>Explore by service</b>{SERVICE_LINKS.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
        <div className="dw-footer-col"><b>Contact</b><span>{profile.address}</span><a href={`tel:${profile.phone}`}>{profile.phone}</a><a href={`mailto:${profile.email}`}>{profile.email}</a><a href={profile.instagramUrl} target="_blank" rel="noreferrer">Instagram @hangers.cs</a></div>
        <div className="dw-footer-bottom">
          <span>© {new Date().getFullYear()} Hangers Clothes Spa. Rates are subject to item and fabric inspection.</span>
          <nav className="dw-footer-legal" aria-label="Legal">{LEGAL_LINKS.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
        </div>
      </div>
    </footer>
    <div className="dw-sticky" role="navigation" aria-label="Quick actions">
      <a className="round" href={`tel:${profile.phone}`} aria-label="Call">Call</a>
      <Link className="book" href="/book-pickup">Book a pickup</Link>
      <a className="wa" href={WHATSAPP} aria-label="WhatsApp">WhatsApp</a>
    </div>
  </div>
}
