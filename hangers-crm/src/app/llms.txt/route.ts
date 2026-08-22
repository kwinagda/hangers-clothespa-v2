import { getPublicRateChart, getPublicSiteProfile } from '@/lib/publicSite'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [profile, rateChart] = await Promise.all([getPublicSiteProfile(), getPublicRateChart()])
  if (!profile) return new Response('Hangers public profile is temporarily unavailable.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  const siteUrl = profile.seo?.siteUrl || 'https://hangers-cs.com'
  const categories = (rateChart?.categories || []).map((category) => category.label).join(', ')
  const text = [
    `# ${profile.businessName}`,
    '',
    `> Professional dry cleaning, curtain care, ironing and home-care services in ${profile.pickupZones.join(', ')}.`,
    '',
    '## Business facts',
    `- Address: ${profile.address}`,
    `- Phone: ${profile.phone}`,
    `- Email: ${profile.email}`,
    `- Hours: ${profile.openingHours.map((item) => `${item.label} ${item.hours}`).join('; ')}`,
    `- Established: ${profile.establishedYear}`,
    `- Pickup areas: ${profile.pickupZones.join(', ')}`,
    `- Minimum pickup order: Rs. ${profile.pickupMinimumOrder}`,
    `- Dry-cleaning turnaround: ${profile.turnaround.dryCleaning}`,
    `- Curtain-care turnaround: ${profile.turnaround.curtains}`,
    '- Curtain removal and reinstallation: Included at no extra fitting charge',
    `- Service categories: ${categories}`,
    '',
    '## Canonical public pages',
    `- Home: ${siteUrl}/`,
    `- Services: ${siteUrl}/services`,
    `- Live rate chart: ${siteUrl}/rate-chart`,
    `- Book a pickup: ${siteUrl}/book-pickup`,
    `- Pickup areas: ${siteUrl}/pickup-zones`,
    `- Contact: ${siteUrl}/contact`,
    '',
    'Prices are subject to item and fabric inspection. Use the live rate chart as the current pricing source.',
  ].join('\n')
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=3600' } })
}
