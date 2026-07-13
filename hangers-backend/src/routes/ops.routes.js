const express = require('express');
const { staffAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { getOperationalHealth } = require('../controllers/ops.controller');

const router = express.Router();
router.use(privateNoStore);
router.get('/health', staffAuth, requirePermission('ops.view'), getOperationalHealth);

module.exports = router;
