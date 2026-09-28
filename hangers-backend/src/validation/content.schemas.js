const { z } = require('zod');

const slugSchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase, hyphen-separated');

const sectionSchema = z.object({
  heading: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
}).strict();

const faqSchema = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(2000),
}).strict();

const blogPostSchema = z.object({
  slug: slugSchema,
  kicker: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  metaDescription: z.string().trim().min(1).max(300),
  heroImage: z.string().trim().min(1).max(400),
  heroImageAlt: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().min(1).max(500),
  sections: z.array(sectionSchema).min(1).max(20),
  faqs: z.array(faqSchema).max(20).optional().nullable(),
}).strict();

const blogPostUpdateSchema = blogPostSchema.partial().strict();

const suburbPageSchema = z.object({
  slug: slugSchema,
  suburbName: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  metaDescription: z.string().trim().min(1).max(300),
  heroImage: z.string().trim().min(1).max(400),
  heroImageAlt: z.string().trim().min(1).max(200),
  intro: z.string().trim().min(1).max(1000),
  landmarks: z.array(z.string().trim().min(1).max(120)).max(30).optional().nullable(),
  pickupNotes: z.string().trim().max(1000).optional().nullable(),
  faqs: z.array(faqSchema).max(20).optional().nullable(),
}).strict();

const suburbPageUpdateSchema = suburbPageSchema.partial().strict();

module.exports = {
  blogPostSchema,
  blogPostUpdateSchema,
  suburbPageSchema,
  suburbPageUpdateSchema,
};
