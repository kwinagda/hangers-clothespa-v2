import { LOGO_BLUE_URL } from '@/lib/branding'
import type { Metadata } from 'next'
import RateChartClient from './RateChartClient'
import { PublicContentPage } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { SITE_URL } from '@/lib/seo'

export const dynamic = 'force-dynamic'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1'
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: 'Rate Chart | Hangers Clothes Spa' },
  description: 'Search garment care prices by service category at Hangers Clothes Spa.',
  alternates: { canonical: '/rate-chart' },
  openGraph: {
    title: 'Hangers Clothes Spa Rate Chart',
    description: 'Search garment care prices by garment or service category.',
    url: '/rate-chart',
    siteName: 'Hangers Clothes Spa',
    type: 'website',
    images: [
      {
        url: '/rate-chart/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Hangers Clothes Spa Rate Chart',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hangers Clothes Spa Rate Chart',
    description: 'Search garment care prices by garment or service category.',
    images: ['/rate-chart/opengraph-image'],
  },
}

async function loadRateChart() {
  const res = await fetch(`${API_BASE_URL}/public/rate-chart`, { cache: 'no-store' })
  if (!res.ok) return null
  const payload = await res.json()
  return payload?.data?.rateChart || payload?.rateChart || null
}

export default async function PublicRateChartPage() {
  const [rateChart, profile] = await Promise.all([loadRateChart(), getPublicSiteProfile()])
  const categories = Array.isArray(rateChart?.categories) ? rateChart.categories : []

  if (!rateChart) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7fb', padding: 18, fontFamily: 'var(--crm-font-ui)' }}>
        <section style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid #e3edf6', borderRadius: 14, padding: 24, textAlign: 'center' }}>
          <img src={LOGO_BLUE_URL} alt="Hangers Clothes Spa" style={{ height: 42, objectFit: 'contain', marginBottom: 16 }} />
          <h1 style={{ margin: 0, color: '#142033', fontSize: 22 }}>Rate chart unavailable</h1>
          <p style={{ color: '#6b7fa3', fontSize: 14, lineHeight: 1.6 }}>Please try again later or contact Hangers Clothes Spa.</p>
        </section>
      </main>
    )
  }

  const content = (
    <div className="rate-page">
      <style>{`
        .rate-page {
          min-height: 100vh;
          background: #f4f7fb;
          color: #182538;
          font-family: var(--crm-font-ui);
          padding: 16px 12px 34px;
        }
        .rate-shell {
          width: 100%;
          max-width: 760px;
          margin: 0 auto;
        }
        .rate-hero {
          background: #fff;
          border: 1px solid #dce8f0;
          border-radius: 16px;
          padding: 18px 16px;
          box-shadow: 0 14px 34px rgba(2,60,98,0.08);
          animation: rate-fade-up 420ms ease both;
        }
        .rate-logo-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
        }
        .rate-logo {
          height: 44px;
          width: auto;
          object-fit: contain;
        }
        .rate-title {
          margin: 18px 0 6px;
          color: #023c62;
          font-size: 26px;
          line-height: 1.05;
          font-weight: 800;
          letter-spacing: 0;
          text-align: center;
        }
        .rate-subtitle {
          margin: 0;
          color: #5d728b;
          font-size: 13px;
          line-height: 1.55;
          text-align: center;
        }
        .rate-toolbar {
          position: sticky;
          top: 0;
          z-index: 8;
          background: rgba(244,247,251,0.96);
          backdrop-filter: blur(10px);
          padding: 10px 0 8px;
          margin-top: 6px;
        }
        .rate-search {
          width: 100%;
          border: 1px solid #d8e6f0;
          border-radius: 12px;
          background: #fff;
          color: #182538;
          font-size: 15px;
          font-weight: 500;
          padding: 12px 13px;
          outline: none;
          transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
        }
        .rate-search:focus {
          border-color: #7aa8c8;
          box-shadow: 0 0 0 4px rgba(2,60,98,0.08);
        }
        .rate-controls {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 8px;
        }
        .rate-select {
          min-width: 0;
          border: 1px solid #d8e6f0;
          border-radius: 11px;
          background: #fff;
          color: #023c62;
          font-size: 12.5px;
          font-weight: 650;
          padding: 10px 9px;
          outline: none;
          transition: border-color 180ms ease, box-shadow 180ms ease;
        }
        .rate-select:focus {
          border-color: #7aa8c8;
          box-shadow: 0 0 0 4px rgba(2,60,98,0.08);
        }
        .rate-result-line {
          margin: 10px 2px 0;
          color: #6b7fa3;
          font-size: 11.5px;
          font-weight: 500;
        }
        .rate-section {
          scroll-margin-top: 64px;
          background: #fff;
          border: 1px solid #dce8f0;
          border-radius: 15px;
          overflow: hidden;
          margin-top: 12px;
          transform-origin: top center;
        }
        .rate-section-head {
          padding: 13px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid #edf3f8;
        }
        .rate-section-title {
          margin: 0;
          font-size: 15px;
          font-weight: 750;
          color: #023c62;
          letter-spacing: 0;
        }
        .rate-section-count {
          color: #7b8ca8;
          font-size: 11px;
          font-weight: 650;
          white-space: nowrap;
        }
        .rate-list {
          display: block;
        }
        .rate-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          padding: 13px 14px;
          border-bottom: 1px solid #edf3f8;
          transition: background-color 180ms ease, transform 180ms ease;
        }
        .rate-row:hover {
          background: #fbfdff;
        }
        .rate-row:last-child {
          border-bottom: 0;
        }
        .rate-name {
          min-width: 0;
          color: #24364b;
          font-size: 13.5px;
          line-height: 1.35;
          font-weight: 550;
          overflow-wrap: anywhere;
        }
        .rate-price {
          color: #023c62;
          font-size: 13.5px;
          font-weight: 650;
          white-space: nowrap;
          font-family: var(--crm-font-mono);
        }
        .rate-animate {
          animation: rate-fade-up 280ms ease both;
        }
        .rate-row-animate {
          animation: rate-row-in 240ms ease both;
        }
        .rate-empty {
          background: #fff;
          border: 1px solid #dce8f0;
          border-radius: 15px;
          padding: 28px 18px;
          text-align: center;
          color: #6b7fa3;
          font-size: 14px;
          line-height: 1.6;
        }
        .rate-pager {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 8px;
          align-items: center;
          margin-top: 12px;
        }
        .rate-page-btn {
          border: 1px solid #d8e6f0;
          background: #fff;
          color: #023c62;
          border-radius: 11px;
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background-color 180ms ease, color 180ms ease, opacity 180ms ease, transform 180ms ease;
        }
        .rate-page-btn:not(:disabled):hover {
          background: #f3f8fc;
          transform: translateY(-1px);
        }
        .rate-page-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .rate-page-count {
          color: #5d728b;
          font-size: 12px;
          font-weight: 650;
          white-space: nowrap;
        }
        .rate-note {
          margin: 14px 0 0;
          color: #6b7fa3;
          font-size: 11.5px;
          line-height: 1.55;
          text-align: center;
        }
        .rate-desktop-catalog {
          display: none;
        }
        @keyframes rate-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rate-row-in {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rate-hero,
          .rate-animate,
          .rate-row-animate {
            animation: none !important;
          }
          .rate-search,
          .rate-select,
          .rate-row,
          .rate-page-btn {
            transition: none !important;
          }
        }
        @media (min-width: 560px) {
          .rate-page { padding: 24px 18px 46px; }
          .rate-hero { padding: 22px; }
          .rate-title { font-size: 32px; }
          .rate-controls { grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); }
        }
        @media (min-width: 960px) {
          .rate-page { padding: 34px 34px 58px; }
          .rate-shell { max-width: 1180px; }
          .rate-hero {
            min-height: 178px;
            display: grid;
            grid-template-columns: 190px minmax(0, 1fr);
            align-items: center;
            gap: 34px;
            padding: 30px 36px;
            text-align: left;
          }
          .rate-logo-row { justify-content: flex-start; padding-right: 32px; border-right: 1px solid #e1ebf2; }
          .rate-logo { height: 52px; }
          .rate-title { margin: 0 0 7px; text-align: left; font-size: 40px; font-weight: 700; }
          .rate-subtitle { max-width: 540px; text-align: left; font-size: 15px; }
          .rate-toolbar {
            display: grid;
            grid-template-columns: minmax(280px, 1fr) auto;
            column-gap: 12px;
            row-gap: 0;
            align-items: center;
            margin-top: 15px;
            padding: 12px 0;
          }
          .rate-search { height: 46px; padding: 0 15px; }
          .rate-controls { display: flex; align-items: center; gap: 9px; margin: 0; }
          .rate-mobile-category-select { display: none; }
          .rate-select { height: 46px; min-width: 168px; padding: 0 12px; }
          .rate-result-line { grid-column: 1 / -1; margin: 9px 2px 0; }
          .rate-mobile-results { display: none; }
          .rate-desktop-catalog {
            display: grid;
            grid-template-columns: 245px minmax(0, 1fr);
            align-items: stretch;
            overflow: hidden;
            margin-top: 9px;
            background: #fff;
            border: 1px solid #dce8f0;
            border-radius: 12px;
            box-shadow: 0 12px 32px rgba(2,60,98,.055);
          }
          .rate-category-rail { padding: 18px 12px 16px; background: #f7fafc; border-right: 1px solid #e2ecf3; }
          .rate-rail-label { margin: 0 9px 10px; color: #7290a5; font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
          .rate-category-button {
            width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
            padding: 10px 9px; border: 0; border-radius: 6px; background: transparent; color: #486279;
            font-family: var(--crm-font-ui); font-size: 12.5px; font-weight: 600; line-height: 1.3; text-align: left; cursor: pointer;
          }
          .rate-category-button:hover { background: #edf5fa; color: #023c62; transform: none; }
          .rate-category-button.is-active { background: #dceef8; color: #023c62; font-weight: 750; }
          .rate-category-button span { flex: 0 0 auto; color: #7890a3; font-size: 10.5px; font-weight: 700; }
          .rate-category-button.is-active span { color: #166a94; }
          .rate-catalog-table-wrap { min-width: 0; }
          .rate-catalog-heading, .rate-catalog-row {
            display: grid; grid-template-columns: minmax(160px, .72fr) minmax(240px, 1.28fr) 120px; gap: 20px; align-items: center;
          }
          .rate-catalog-heading { padding: 14px 22px; background: #f7fafc; border-bottom: 1px solid #e2ecf3; color: #7890a3; font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
          .rate-catalog-heading span:last-child { text-align: right; }
          .rate-catalog-row { min-height: 55px; padding: 10px 22px; border-bottom: 1px solid #edf3f8; transition: background-color 160ms ease; }
          .rate-catalog-row:last-child { border-bottom: 0; }
          .rate-catalog-row:hover { background: #f8fcff; transform: none; }
          .rate-catalog-category { display: flex; align-items: center; gap: 8px; min-width: 0; overflow-wrap: anywhere; color: #58718a; font-size: 12px; font-weight: 600; }
          .rate-catalog-category span { display: block; flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; }
          .rate-catalog-item { min-width: 0; overflow-wrap: anywhere; color: #20384d; font-size: 14px; font-weight: 600; }
          .rate-catalog-price { color: #023c62; font-family: var(--crm-font-mono); font-size: 14px; font-weight: 650; text-align: right; white-space: nowrap; }
          .rate-pager { max-width: 480px; margin: 16px auto 0; }
          .rate-note { margin-top: 18px; }
        }
        @media (max-width: 340px) {
          .rate-page { padding-left: 8px; padding-right: 8px; }
          .rate-hero { padding: 15px 12px; border-radius: 13px; }
          .rate-logo { height: 36px; }
          .rate-title { font-size: 24px; }
          .rate-controls { grid-template-columns: 1fr; }
          .rate-row { padding: 12px; gap: 8px; }
          .rate-name { font-size: 13px; }
          .rate-price { font-size: 13px; }
        }
      `}</style>

      <div className="rate-shell">
        <RateChartClient categories={categories} />

        <p className="rate-note">Final billing may vary for custom work, special handling, stain treatment, garment condition, or size.</p>
      </div>
    </div>
  )

  return profile ? <PublicContentPage profile={profile} eyebrow="Rate chart" title="Current rates for every active service." intro="Search by garment or browse by service category. Prices below come directly from the active Hangers pricing catalog.">{content}</PublicContentPage> : content
}
