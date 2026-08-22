import fs from 'node:fs';
import path from 'node:path';

const origin = (process.env.PUBLIC_SITE_ORIGIN || 'http://localhost:5002').replace(/\/$/, '');
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
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

if (fs.existsSync('public')) fs.cpSync('public', outDir, { recursive: true });
if (fs.existsSync('.next/static')) {
  fs.mkdirSync(path.join(outDir, '_next'), { recursive: true });
  fs.cpSync('.next/static', path.join(outDir, '_next/static'), { recursive: true });
}

for (const route of htmlRoutes) {
  const filePath = route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;
  await writeRoute(route, filePath);
}

for (const [route, filePath, required] of fileRoutes) {
  await writeRoute(route, filePath, required);
}

console.log(`Static public website written to ${outDir}`);
