import fs from 'node:fs';
import path from 'node:path';

if (!process.env.PUBLIC_SITE_ORIGIN) {
  throw new Error('PUBLIC_SITE_ORIGIN is required, e.g. PUBLIC_SITE_ORIGIN=https://crm.hangers-cs.com node scripts/build-public-static.mjs');
}
const origin = process.env.PUBLIC_SITE_ORIGIN.replace(/\/$/, '');
const outDir = path.resolve(process.env.PUBLIC_STATIC_OUT_DIR || 'dist-public');

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
  ['/opengraph-image', 'opengraph-image', false],
  ['/rate-chart/opengraph-image', 'rate-chart/opengraph-image', false],
];

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
    const html = buffer.toString('utf8');
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

console.log(`Static public website written to ${outDir} (${staticAssetUrls.size} static assets fetched live from ${origin})`);
