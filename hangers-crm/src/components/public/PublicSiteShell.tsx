'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { LOGO_BLUE_URL } from '@/lib/branding'
import type { PublicSiteProfile } from '@/lib/publicSite'

const links = [
  ['/services', 'Services'], ['/rate-chart', 'Rate chart'], ['/monthly-plans', 'Plans'],
  ['/pickup-zones', 'Zones'], ['/corporate-accounts', 'Corporate'], ['/about', 'About'],
  ['/blog', 'Journal'], ['/faq', 'FAQ'], ['/contact', 'Contact'],
]

export default function PublicSiteShell({ profile, children }: { profile: PublicSiteProfile; children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const siteUrl = profile.seo?.siteUrl || 'https://hangers-cs.com'
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'DryCleaningOrLaundry',
    '@id': `${siteUrl}/#business`,
    name: profile.businessName,
    url: siteUrl,
    logo: `${siteUrl}${LOGO_BLUE_URL}`,
    image: [`${siteUrl}/brand/curtain-care-hero.png`, `${siteUrl}/brand/garment-care-hero.png`],
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
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
    <style>{`
      .dw-root{--navy:#023c62;--blue:#0d6fa8;--ink:#10243a;--text:#4b6479;--muted:#7d93a8;--line:#dce8f0;--pale:#e8f0f7;min-height:100vh;background:#f7f9fc;color:var(--ink);font-family:var(--crm-font-ui,Inter,system-ui,sans-serif);-webkit-font-smoothing:antialiased}.dw-root *{box-sizing:border-box}.dw-root a{color:var(--navy);text-decoration:none}.dw-container{width:min(100% - 48px,1240px);margin-inline:auto}.dw-top{color:#dbe9f4;background:var(--navy)}.dw-top-row{min-height:36px;display:flex;align-items:center;justify-content:space-between;gap:20px;font-size:12.5px}.dw-top a{color:#fff;font-weight:600}.dw-header{position:sticky;top:0;z-index:60;border-bottom:1px solid var(--line);background:rgba(247,249,252,.94);backdrop-filter:blur(10px)}.dw-nav{min-height:74px;display:flex;align-items:center;gap:30px}.dw-logo{display:block;width:150px;height:auto}.dw-links{display:flex;align-items:center;gap:19px;margin-left:auto}.dw-links a{padding:26px 0 23px;border-bottom:2px solid transparent;color:var(--text);font-size:13px}.dw-links a:hover,.dw-links a.active{border-color:var(--navy);color:var(--navy);font-weight:650}.dw-book,.dw-button{display:inline-flex;min-height:42px;align-items:center;justify-content:center;gap:8px;padding:0 17px;border:1px solid var(--navy);border-radius:8px;font-size:13.5px;font-weight:700}.dw-staff-login{display:inline-flex;align-items:center;min-height:42px;padding:0 14px;border:1px solid var(--line);border-radius:8px;color:var(--text);font-size:13px;font-weight:650;white-space:nowrap}.dw-staff-login:hover{border-color:var(--navy);color:var(--navy)}.dw-root .dw-book,.dw-root .dw-button.primary{color:#fff;background:var(--navy)}.dw-root .dw-button.secondary{color:var(--navy);background:#fff}.dw-mobile-toggle{display:none;margin-left:auto;width:42px;height:42px;place-items:center;border:1px solid #bdd3e1;border-radius:8px;color:var(--navy);background:#fff}.dw-mobile-nav{display:none}.dw-main{min-height:50vh}.dw-cta{background:var(--pale)}.dw-cta-row{min-height:154px;display:flex;align-items:center;justify-content:space-between;gap:32px;padding-block:34px}.dw-cta h2{margin:0 0 8px;color:var(--navy);font-size:clamp(24px,2.6vw,30px);line-height:1.15}.dw-cta p{margin:0;color:var(--text);font-size:15px}.dw-actions{display:flex;flex-wrap:wrap;gap:10px}.dw-footer{color:#fff;background:var(--navy)}.dw-footer-grid{display:grid;grid-template-columns:1.35fr .75fr .8fr 1.05fr;gap:40px;padding-block:52px 30px}.dw-footer-logo{width:145px;filter:brightness(0) invert(1);margin-bottom:15px}.dw-footer-copy{max-width:38ch;margin:0 0 14px;color:#a8c6dc;font-size:13.5px;line-height:1.65}.dw-hours{color:#a8c6dc;font-size:13px;line-height:1.7}.dw-footer-title{margin-bottom:14px;color:#7fb3d5;font-size:11.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.dw-footer-links,.dw-contact{display:grid;gap:9px}.dw-footer-links a,.dw-contact a,.dw-contact span{color:#dbe9f4;font-size:13.5px;line-height:1.5}.dw-footer-bottom{display:flex;justify-content:space-between;gap:20px;padding-block:20px 36px;border-top:1px solid rgba(255,255,255,.14);color:#7fb3d5;font-size:12px}
      @media(max-width:1080px){.dw-links{gap:14px}.dw-links a:nth-child(n+6){display:none}.dw-footer-grid{grid-template-columns:1fr 1fr}}
      @media(max-width:800px){.dw-links,.dw-book,.dw-staff-login{display:none}.dw-mobile-toggle{display:grid}.dw-mobile-nav{position:fixed;inset:110px 16px auto;z-index:59;display:grid;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff;box-shadow:0 20px 44px rgba(2,60,98,.2)}.dw-mobile-nav a{padding:12px 11px;border-bottom:1px solid #edf3f7;color:var(--text);font-size:14px;font-weight:650}.dw-mobile-nav a:last-child{border:0}.dw-cta-row{align-items:flex-start;flex-direction:column}.dw-footer-bottom{flex-direction:column}}
      @media(max-width:560px){.dw-container{width:min(100% - 36px,1240px)}.dw-top-row{align-items:flex-start;flex-direction:column;gap:3px;padding-block:7px}.dw-nav{min-height:66px}.dw-logo{width:128px}.dw-mobile-nav{inset-block-start:112px}.dw-actions{width:100%}.dw-button{flex:1}.dw-footer-grid{grid-template-columns:1fr;gap:28px;padding-top:40px}}
    `}</style>
    <div className="dw-top"><div className="dw-container dw-top-row"><span>Free pickup &amp; delivery above Rs. {profile.pickupMinimumOrder} across {profile.pickupZones.join(', ')}</span><a href={`tel:${profile.phone}`}>Call {profile.phone}</a></div></div>
    <header className="dw-header"><nav className="dw-container dw-nav" aria-label="Primary"><Link href="/" onClick={() => setMenuOpen(false)}><img className="dw-logo" src={LOGO_BLUE_URL} alt={profile.businessName} /></Link><div className="dw-links">{links.map(([href,label])=><Link key={href} className={pathname===href?'active':''} href={href}>{label}</Link>)}</div><a className="dw-staff-login" href="/login">Staff Login</a><Link className="dw-book" href="/book-pickup">Book a pickup</Link><button className="dw-mobile-toggle" type="button" aria-label={menuOpen?'Close menu':'Open menu'} aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X size={20}/>:<Menu size={20}/>}</button>{menuOpen&&<div className="dw-mobile-nav">{links.map(([href,label])=><Link key={href} href={href} onClick={()=>setMenuOpen(false)}>{label}</Link>)}<Link href="/book-pickup" onClick={()=>setMenuOpen(false)}>Book a pickup</Link><a href="/login">Staff Login</a></div>}</nav></header>
    <main className="dw-main">{children}</main>
    <section className="dw-cta"><div className="dw-container dw-cta-row"><div><h2>Hand us the pile. We will handle the care.</h2><p>Free pickup and delivery above Rs. {profile.pickupMinimumOrder}. No account needed.</p></div><div className="dw-actions"><Link className="dw-button primary" href="/book-pickup">Book a pickup <ArrowRight size={16}/></Link><Link className="dw-button secondary" href="/rate-chart">See the rate chart</Link></div></div></section>
    <footer className="dw-footer"><div className="dw-container dw-footer-grid"><div><img className="dw-footer-logo" src={LOGO_BLUE_URL} alt={profile.businessName}/><p className="dw-footer-copy">Professional garment, curtain and home-furnishing care in Mulund West since {profile.establishedYear}.</p><div className="dw-hours">{profile.openingHours.map(x=><div key={x.label}>{x.label}: {x.hours}</div>)}</div></div><div><div className="dw-footer-title">Pages</div><nav className="dw-footer-links"><Link href="/">Home</Link><Link href="/services">Services</Link><Link href="/rate-chart">Rate chart</Link><Link href="/book-pickup">Book a pickup</Link><Link href="/monthly-plans">Monthly plans</Link></nav></div><div><div className="dw-footer-title">More</div><nav className="dw-footer-links"><Link href="/pickup-zones">Pickup zones</Link><Link href="/corporate-accounts">Corporate accounts</Link><Link href="/about">About Hangers</Link><Link href="/blog">Care journal</Link><Link href="/faq">FAQ</Link></nav></div><div><div className="dw-footer-title">Contact</div><div className="dw-contact"><span>{profile.address}</span><a href={`tel:${profile.phone}`}>{profile.phone}</a><a href={`mailto:${profile.email}`}>{profile.email}</a><a href={profile.instagramUrl} target="_blank" rel="noreferrer">Instagram @hangers.cs</a></div></div></div><div className="dw-container dw-footer-bottom"><span>© {new Date().getFullYear()} Hangers Clothes Spa.</span><span>Rates are subject to item and fabric inspection.</span></div></footer>
  </div>
}
