const express = require('express');
const router = express.Router();
const { staffAuth } = require('../middleware/auth');
const { requireRole, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const {
  getBlogPosts,
  createBlogPost,
  updateBlogPost,
  publishBlogPost,
  unpublishBlogPost,
  getSuburbPages,
  createSuburbPage,
  updateSuburbPage,
  publishSuburbPage,
  unpublishSuburbPage,
} = require('../controllers/content.controller');

const adminRoles = requireRole('SUPER_ADMIN', 'MANAGER');
const marketingAccess = requireServiceAccess('MARKETING');

router.use(privateNoStore);
router.use(requireTrustedWrite);
router.use(staffAuth, marketingAccess, adminRoles);

router.get('/blog-posts', getBlogPosts);
router.post('/blog-posts', createBlogPost);
router.patch('/blog-posts/:id', updateBlogPost);
router.post('/blog-posts/:id/publish', publishBlogPost);
router.post('/blog-posts/:id/unpublish', unpublishBlogPost);

router.get('/pickup-zones', getSuburbPages);
router.post('/pickup-zones', createSuburbPage);
router.patch('/pickup-zones/:id', updateSuburbPage);
router.post('/pickup-zones/:id/publish', publishSuburbPage);
router.post('/pickup-zones/:id/unpublish', unpublishSuburbPage);

module.exports = router;
