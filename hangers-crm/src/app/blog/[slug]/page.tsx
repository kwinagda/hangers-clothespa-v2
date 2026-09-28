import { notFound } from 'next/navigation'
import { PublicContentPage, PublicUnavailable } from '@/components/public/PublicContentPage'
import { getPublicSiteProfile } from '@/lib/publicSite'
import { getPublicBlogPost } from '@/lib/publicContent'
import { buildPublicMetadata, SITE_URL } from '@/lib/seo'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPublicBlogPost(slug)
  if (!post) return buildPublicMetadata({ title: 'Article not found | Hangers Clothes Spa', description: 'This article is no longer available.', path: `/blog/${slug}` })
  return buildPublicMetadata({ title: `${post.title} | Hangers Garment Care Journal`, description: post.metaDescription, path: `/blog/${slug}` })
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [profile, post] = await Promise.all([getPublicSiteProfile(), getPublicBlogPost(slug)])
  if (!profile) return <PublicUnavailable />
  if (!post) return notFound()

  const articleUrl = `${SITE_URL}/blog/${post.slug}`
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription,
    image: new URL(post.heroImage, SITE_URL).toString(),
    author: { '@type': 'Organization', name: 'Hangers Clothes Spa' },
    publisher: { '@type': 'Organization', name: 'Hangers Clothes Spa' },
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

  return <PublicContentPage profile={profile} eyebrow={post.kicker} title={post.title} intro={post.excerpt}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema).replace(/</g, '\\u003c') }} />
    {faqSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} />}
    <section className="dp-section">
      <img className="dp-media" src={post.heroImage} alt={post.heroImageAlt} width={1280} height={853} loading="lazy" />
    </section>
    {post.sections.map((section) => (
      <section className="dp-section" key={section.heading}>
        <h2 className="dp-title">{section.heading}</h2>
        <p className="dp-copy">{section.body}</p>
      </section>
    ))}
    {post.faqs?.length ? (
      <section className="dp-section">
        <h2 className="dp-title">Frequently asked</h2>
        <div className="dp-faq">
          {post.faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
    ) : null}
  </PublicContentPage>
}
