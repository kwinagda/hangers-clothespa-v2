import fs from 'node:fs';
import path from 'node:path';

if (!process.env.PUBLIC_SITE_ORIGIN) {
  throw new Error('PUBLIC_SITE_ORIGIN is required, e.g. PUBLIC_SITE_ORIGIN=https://crm.hangers-cs.com node scripts/build-public-static.mjs');
}
const origin = process.env.PUBLIC_SITE_ORIGIN.replace(/\/$/, '');
const outDir = path.resolve(process.env.PUBLIC_STATIC_OUT_DIR || 'dist-public');

// The marketing site is published as static HTML to S3. Keep analytics here so
// it is present in the initial document on marketing pages only, never in CRM.
const marketingAnalyticsHead = `
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-D23MCHNN38"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-D23MCHNN38');</script>`;

const htmlRoutes = [
  '/',
  '/services',
  '/rate-chart',
  '/book-pickup',
  '/about',
  '/contact',
  '/corporate-accounts',
  '/monthly-plans',
  '/pickup-zones',
  '/blog',
  '/faq',
];

const fileRoutes = [
  ['/robots.txt', 'robots.txt', true],
  ['/sitemap.xml', 'sitemap.xml', true],
  ['/manifest.webmanifest', 'manifest.webmanifest', true],
  ['/llms.txt', 'llms.txt', false],
  // Every public page may have its own opengraph-image.tsx (Next.js file-based OG
  // image convention: <route>/opengraph-image). Derived from htmlRoutes below rather
  // than listed by hand so a new page's preview image is never silently missed.
  ...htmlRoutes.map((route) => {
    const ogRoute = route === '/' ? '/opengraph-image' : `${route}/opengraph-image`;
    return [ogRoute, ogRoute.slice(1), false];
  }),
];

// CRM-origin pages (dashboard/*, login, change-password, invoice/*, quotation/*,
// daily-iron/* - see CacheBehaviors in infra/public-site/template.yaml) are never
// read from S3 for their HTML. But _next/static/* defaults to the S3 origin for
// every route, so those pages' own JS/CSS bundles still need to exist in S3 too, or
// their hydration breaks with "Application error" the moment EC2 rebuilds.
//
// Discovering those bundles by scraping each CRM page's HTML was tried and proved
// incomplete: it only finds chunks referenced in a page's initial script tags, never
// ones loaded on demand (next/dynamic, lazy modals, etc.), so pages kept breaking
// piecemeal as new untracked chunks slipped through. The reliable fix is authoritative,
// not discovered: after every `npm run build` on EC2, sync the ENTIRE .next/static
// directory straight to S3 from EC2 itself, which is complete by construction:
//
//   aws s3 sync /opt/hangers/hangers-crm/.next/static \
//     s3://hangers-cs-website-977714654070-ap-south-1-v2/_next/static --delete
//
// (EC2's instance role has a scoped HangersCRMWebsiteStaticSync policy for exactly
// this prefix.) This script only needs to cover the public marketing pages' own HTML
// + file routes below - it no longer scans CRM pages for asset references.
const staticAssetUrls = new Set();
const ASSET_ATTR_RE = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;

const writeRoute = async (route, filePath, required = true) => {
  const response = await fetch(`${origin}${route}`);
  if (!response.ok) {
    if (required) throw new Error(`${route} returned ${response.status}`);
    console.warn(`Skipping optional ${route}: ${response.status}`);
    return;
  }
  const target = path.join(outDir, filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
  if (filePath.endsWith('.html')) {
    const html = buffer.toString('utf8').replace('<head>', `<head>${marketingAnalyticsHead}`);
    fs.writeFileSync(target, html);
    for (const match of html.matchAll(ASSET_ATTR_RE)) staticAssetUrls.add(match[1]);
  }
};

// _next/static assets are fetched live from `origin` below (never copied from a local
// .next/static build) so this script produces a byte-identical snapshot of whatever the
// origin is currently serving, regardless of what's been built on the machine running this
// script. Mixing a local build's static/ with a remote origin's HTML silently mismatches
// chunk hashes and breaks hydration on every route.
const writeAsset = async (assetPath) => {
  const response = await fetch(`${origin}${assetPath}`);
  if (!response.ok) throw new Error(`${assetPath} returned ${response.status}`);
  const target = path.join(outDir, assetPath.replace(/^\//, ''));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(target, buffer);
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

if (fs.existsSync('public')) fs.cpSync('public', outDir, { recursive: true });

for (const route of htmlRoutes) {
  const filePath = route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;
  await writeRoute(route, filePath);
}

for (const [route, filePath, required] of fileRoutes) {
  await writeRoute(route, filePath, required);
}

for (const assetPath of staticAssetUrls) {
  await writeAsset(assetPath);
}

console.log(`Static public website written to ${outDir} (${staticAssetUrls.size} static assets fetched live from ${origin}, covering ${htmlRoutes.length} public pages).`);
console.log('Reminder: also run the EC2-side .next/static -> S3 sync (see comment above) so CRM-origin pages stay in sync.');
