import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ContentTemplate } from '@/components/public/ContentTemplate'
import { PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { getPublicBlogPost, getPublicBlogPosts } from '@/lib/publicContent'
import { buildPublicMetadata, SITE_URL } from '@/lib/seo'
import { organizationRef } from '@/lib/schema'
import type { Metadata } from 'next'

// Hand-curated topical mapping, not auto-matched: verified against the real kicker
// values in the DB (Stains, Seasonal care, Curtain care, Footwear, Bridal wear, Care
// labels) and the 6 real service slugs. Naive substring matching fails for most of
// these (e.g. "Footwear" vs "shoe-care" share no substring), and "Care labels" is
// genuinely general — it deliberately has no service mapping rather than a forced one.
const KICKER_TO_SERVICE_SLUG: Record<string, string> = {
  'Stains': 'dry-cleaning',
  'Seasonal care': 'dry-cleaning',
  'Curtain care': 'curtain-cleaning',
  'Footwear': 'shoe-care',
  'Bridal wear': 'dry-cleaning',
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPublicBlogPost(slug)
  if (!post) return buildPublicMetadata({ title: 'Article not found | Hangers Clothes Spa', description: 'This article is no longer available.', path: `/blog/${slug}` })
  return buildPublicMetadata({ title: `${post.title} | Hangers Garment Care Journal`, description: post.metaDescription, path: `/blog/${slug}` })
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [profile, post, allPosts] = await Promise.all([getPublicSiteProfile(), getPublicBlogPost(slug), getPublicBlogPosts()])
  if (!profile) return <PublicUnavailable />
  if (!post) return notFound()

  const relatedServiceSlug = KICKER_TO_SERVICE_SLUG[post.kicker]
  const relatedPosts = allPosts.filter((p) => p.kicker === post.kicker && p.slug !== post.slug).slice(0, 3)

  const articleUrl = `${SITE_URL}/blog/${post.slug}`
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription,
    image: new URL(post.heroImage, SITE_URL).toString(),
    author: organizationRef(),
    publisher: organizationRef(),
    mainEntityOfPage: articleUrl,
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
  }
  const faqSchema = post.faqs?.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  } : null

  const relatedServiceLabel = relatedServiceSlug?.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

  const related = [
    relatedServiceSlug ? { t: relatedServiceLabel as string, s: `See ${relatedServiceLabel?.toLowerCase()} coverage and pricing across every area Hangers serves.`, href: `/services/${relatedServiceSlug}` } : null,
    ...relatedPosts.map((p) => ({ t: p.title, s: p.excerpt, href: `/blog/${p.slug}` })),
  ].filter(Boolean) as { t: string; s: string; href: string }[]
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema).replace(/</g, '\\u003c') }} />
    {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} />}
    <ContentTemplate profile={profile} data={{
      crumbs: [['Home', '/'], ['Journal', '/blog'], [post.title]],
      title: post.title,
      intro: post.excerpt,
      image: { src: post.heroImage, alt: post.heroImageAlt },
      sections: post.sections.map((section) => [section.heading, section.body] as [string, string]),
      faq: post.faqs?.map((faq) => [faq.question, faq.answer] as [string, string]),
      lists: related.length ? [{ h: 'Related', items: related.map((r) => ({ t: r.t, s: r.s, href: r.href })) }] : undefined,
    }} />
  </>
}
