const prisma = require('../config/database');
const { success, badRequest, error, notFound } = require('../utils/response');
const { log, getRequestMeta } = require('../services/activity.service');
const {
  blogPostSchema,
  blogPostUpdateSchema,
  suburbPageSchema,
  suburbPageUpdateSchema,
  servicePageSchema,
  servicePageUpdateSchema,
} = require('../validation/content.schemas');

const auditContentChange = (req, action, resource, description, metadata) => log({
  actorType: 'staff',
  actorId: req.staff?.id,
  actorName: req.staff?.name,
  action,
  resource,
  description,
  metadata,
  ...getRequestMeta(req),
});

// ── Blog posts ───────────────────────────────────────────────────────────────

const getBlogPosts = async (_req, res) => {
  try {
    const posts = await prisma.blogPost.findMany({ orderBy: { createdAt: 'desc' } });
    return success(res, posts);
  } catch (err) {
    return error(res, 'Failed to fetch blog posts');
  }
};

const createBlogPost = async (req, res) => {
  try {
    const parsed = blogPostSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid blog post payload');
    const existing = await prisma.blogPost.findUnique({ where: { slug: parsed.data.slug } });
    if (existing) return badRequest(res, 'A blog post with this slug already exists');
    const post = await prisma.blogPost.create({
      data: { ...parsed.data, updatedBy: req.staff?.id || null },
    });
    await auditContentChange(req, 'BLOG_POST_CREATED', 'blog_post', `Created blog post "${post.title}"`, { blogPostId: post.id, slug: post.slug });
    return success(res, post);
  } catch (err) {
    return error(res, 'Failed to create blog post');
  }
};

const updateBlogPost = async (req, res) => {
  try {
    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) return notFound(res, 'Blog post not found');
    const parsed = blogPostUpdateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid blog post payload');
    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugTaken = await prisma.blogPost.findUnique({ where: { slug: parsed.data.slug } });
      if (slugTaken) return badRequest(res, 'A blog post with this slug already exists');
    }
    const post = await prisma.blogPost.update({
      where: { id: existing.id },
      data: { ...parsed.data, updatedBy: req.staff?.id || null },
    });
    await auditContentChange(req, 'BLOG_POST_UPDATED', 'blog_post', `Updated blog post "${post.title}"`, { blogPostId: post.id, slug: post.slug });
    return success(res, post);
  } catch (err) {
    return error(res, 'Failed to update blog post');
  }
};

const setBlogPostPublishState = (status) => async (req, res) => {
  try {
    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) return notFound(res, 'Blog post not found');
    const post = await prisma.blogPost.update({
      where: { id: existing.id },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? (existing.publishedAt || new Date()) : existing.publishedAt,
        updatedBy: req.staff?.id || null,
      },
    });
    await auditContentChange(req, status === 'PUBLISHED' ? 'BLOG_POST_PUBLISHED' : 'BLOG_POST_UNPUBLISHED', 'blog_post', `${status === 'PUBLISHED' ? 'Published' : 'Unpublished'} blog post "${post.title}"`, { blogPostId: post.id, slug: post.slug });
    return success(res, post);
  } catch (err) {
    return error(res, 'Failed to update blog post status');
  }
};

// ── Suburb pages ─────────────────────────────────────────────────────────────

const getSuburbPages = async (_req, res) => {
  try {
    const pages = await prisma.suburbPage.findMany({ orderBy: { createdAt: 'desc' } });
    return success(res, pages);
  } catch (err) {
    return error(res, 'Failed to fetch pickup zone pages');
  }
};

const createSuburbPage = async (req, res) => {
  try {
    const parsed = suburbPageSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid pickup zone page payload');
    const existing = await prisma.suburbPage.findUnique({ where: { slug: parsed.data.slug } });
    if (existing) return badRequest(res, 'A pickup zone page with this slug already exists');
    const page = await prisma.suburbPage.create({
      data: { ...parsed.data, updatedBy: req.staff?.id || null },
    });
    await auditContentChange(req, 'SUBURB_PAGE_CREATED', 'suburb_page', `Created pickup zone page "${page.title}"`, { suburbPageId: page.id, slug: page.slug });
    return success(res, page);
  } catch (err) {
    return error(res, 'Failed to create pickup zone page');
  }
};

const updateSuburbPage = async (req, res) => {
  try {
    const existing = await prisma.suburbPage.findUnique({ where: { id: req.params.id } });
    if (!existing) return notFound(res, 'Pickup zone page not found');
    const parsed = suburbPageUpdateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid pickup zone page payload');
    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugTaken = await prisma.suburbPage.findUnique({ where: { slug: parsed.data.slug } });
      if (slugTaken) return badRequest(res, 'A pickup zone page with this slug already exists');
    }
    const page = await prisma.suburbPage.update({
      where: { id: existing.id },
      data: { ...parsed.data, updatedBy: req.staff?.id || null },
    });
    await auditContentChange(req, 'SUBURB_PAGE_UPDATED', 'suburb_page', `Updated pickup zone page "${page.title}"`, { suburbPageId: page.id, slug: page.slug });
    return success(res, page);
  } catch (err) {
    return error(res, 'Failed to update pickup zone page');
  }
};

const setSuburbPagePublishState = (status) => async (req, res) => {
  try {
    const existing = await prisma.suburbPage.findUnique({ where: { id: req.params.id } });
    if (!existing) return notFound(res, 'Pickup zone page not found');
    const page = await prisma.suburbPage.update({
      where: { id: existing.id },
      data: { status, updatedBy: req.staff?.id || null },
    });
    await auditContentChange(req, status === 'PUBLISHED' ? 'SUBURB_PAGE_PUBLISHED' : 'SUBURB_PAGE_UNPUBLISHED', 'suburb_page', `${status === 'PUBLISHED' ? 'Published' : 'Unpublished'} pickup zone page "${page.title}"`, { suburbPageId: page.id, slug: page.slug });
    return success(res, page);
  } catch (err) {
    return error(res, 'Failed to update pickup zone page status');
  }
};

// ── Service pages (service x suburb) ────────────────────────────────────────

const getServicePages = async (_req, res) => {
  try {
    const pages = await prisma.servicePage.findMany({ orderBy: [{ serviceSlug: 'asc' }, { suburbSlug: 'asc' }] });
    return success(res, pages);
  } catch (err) {
    return error(res, 'Failed to fetch service pages');
  }
};

const createServicePage = async (req, res) => {
  try {
    const parsed = servicePageSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid service page payload');
    const existing = await prisma.servicePage.findUnique({
      where: { serviceSlug_suburbSlug: { serviceSlug: parsed.data.serviceSlug, suburbSlug: parsed.data.suburbSlug } },
    });
    if (existing) return badRequest(res, 'A service page for this service and suburb already exists');
    const page = await prisma.servicePage.create({
      data: { ...parsed.data, updatedBy: req.staff?.id || null },
    });
    await auditContentChange(req, 'SERVICE_PAGE_CREATED', 'service_page', `Created service page "${page.title}"`, { servicePageId: page.id, serviceSlug: page.serviceSlug, suburbSlug: page.suburbSlug });
    return success(res, page);
  } catch (err) {
    return error(res, 'Failed to create service page');
  }
};

const updateServicePage = async (req, res) => {
  try {
    const existing = await prisma.servicePage.findUnique({ where: { id: req.params.id } });
    if (!existing) return notFound(res, 'Service page not found');
    const parsed = servicePageUpdateSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error.issues[0]?.message || 'Invalid service page payload');
    const nextServiceSlug = parsed.data.serviceSlug || existing.serviceSlug;
    const nextSuburbSlug = parsed.data.suburbSlug || existing.suburbSlug;
    if (nextServiceSlug !== existing.serviceSlug || nextSuburbSlug !== existing.suburbSlug) {
      const slugTaken = await prisma.servicePage.findUnique({
        where: { serviceSlug_suburbSlug: { serviceSlug: nextServiceSlug, suburbSlug: nextSuburbSlug } },
      });
      if (slugTaken) return badRequest(res, 'A service page for this service and suburb already exists');
    }
    const page = await prisma.servicePage.update({
      where: { id: existing.id },
      data: { ...parsed.data, updatedBy: req.staff?.id || null },
    });
    await auditContentChange(req, 'SERVICE_PAGE_UPDATED', 'service_page', `Updated service page "${page.title}"`, { servicePageId: page.id, serviceSlug: page.serviceSlug, suburbSlug: page.suburbSlug });
    return success(res, page);
  } catch (err) {
    return error(res, 'Failed to update service page');
  }
};

const setServicePagePublishState = (status) => async (req, res) => {
  try {
    const existing = await prisma.servicePage.findUnique({ where: { id: req.params.id } });
    if (!existing) return notFound(res, 'Service page not found');
    const page = await prisma.servicePage.update({
      where: { id: existing.id },
      data: { status, updatedBy: req.staff?.id || null },
    });
    await auditContentChange(req, status === 'PUBLISHED' ? 'SERVICE_PAGE_PUBLISHED' : 'SERVICE_PAGE_UNPUBLISHED', 'service_page', `${status === 'PUBLISHED' ? 'Published' : 'Unpublished'} service page "${page.title}"`, { servicePageId: page.id, serviceSlug: page.serviceSlug, suburbSlug: page.suburbSlug });
    return success(res, page);
  } catch (err) {
    return error(res, 'Failed to update service page status');
  }
};

module.exports = {
  getBlogPosts,
  createBlogPost,
  updateBlogPost,
  publishBlogPost: setBlogPostPublishState('PUBLISHED'),
  unpublishBlogPost: setBlogPostPublishState('DRAFT'),
  getSuburbPages,
  createSuburbPage,
  updateSuburbPage,
  publishSuburbPage: setSuburbPagePublishState('PUBLISHED'),
  unpublishSuburbPage: setSuburbPagePublishState('DRAFT'),
  getServicePages,
  createServicePage,
  updateServicePage,
  publishServicePage: setServicePagePublishState('PUBLISHED'),
  unpublishServicePage: setServicePagePublishState('DRAFT'),
};
