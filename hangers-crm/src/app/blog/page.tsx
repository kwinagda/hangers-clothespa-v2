import Link from 'next/link'
import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { getPublicBlogPosts } from '@/lib/publicContent'
import { buildPublicMetadata } from '@/lib/seo'
export const metadata = buildPublicMetadata({ title: 'Garment Care Journal | Hangers Clothes Spa', description: 'Practical guidance for garment, curtain, stain, storage and footwear care from Hangers Clothes Spa.', path: '/blog' })

export default async function BlogPage() {
  const [profile, posts] = await Promise.all([getPublicSiteProfile(), getPublicBlogPosts()])
  if (!profile) return <PublicUnavailable />
  const phone = profile.phone.replace(/\D/g, '')
  return <PublicContentPage profile={profile} crumbs={[{label:'Home',href:'/'},{label:'Journal'}]} title="Garment Care Journal" intro="Practical guidance from the Hangers counter: stains, storage, curtains, footwear and the small decisions that can prevent permanent damage.">
    <section className="dp-section"><Link href="/blog/what-to-check-before-curtains-come-down" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px,100%),1fr))', overflow: 'hidden', border: '1px solid #dce8f0', borderRadius: 16, background: '#fff', color: 'inherit' }}><img src="/brand/curtain-care-hero.webp" alt="Professional curtain care at a customer home" width="1280" height="853" loading="lazy" style={{ width: '100%', height: '100%', minHeight: 320, objectFit: 'cover' }} /><div style={{ padding: 'clamp(26px,3.4vw,40px)' }}><div className="dp-kicker">Curtain care</div><h2 className="dp-title">What to check before curtains come down</h2><p className="dp-copy" style={{ marginBottom: 14 }}>Photograph the original fall, inspect weak stitching and note the lining. Fabric, sun exposure and prior shrinkage all affect the appropriate cleaning process.</p><p className="dp-copy">Hangers offers free curtain removal and reinstallation, with a typical turnaround of {profile.turnaround.curtains}.</p></div></Link></section>
    {posts.length ? (
      <section className="dp-section"><div className="dp-grid">{posts.map((post) => (
        <Link href={`/blog/${post.slug}`} key={post.slug} className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: 13, color: 'inherit' }}>
          <div className="dp-kicker" style={{ margin: 0, color: '#023c62' }}>{post.kicker}</div>
          <h2>{post.title}</h2>
          <p style={{ flex: 1 }}>{post.excerpt}</p>
        </Link>
      ))}</div></section>
    ) : null}
    <section className="dp-band" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}><div><h2 className="dp-title">Have an item you are not sure about?</h2><p className="dp-copy">Send a clear photo of the fabric, label or stain before attempting a home treatment.</p></div><a className="dp-btn" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">Ask Hangers on WhatsApp</a></section>
  </PublicContentPage>
}
