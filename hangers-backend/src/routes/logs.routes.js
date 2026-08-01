const express = require('express');
const router = express.Router();
const { staffAuth } = require('../middleware/auth');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { requirePermission, requireServiceAccess } = require('../middleware/rbac');
const { listOrderTimelineLogs } = require('../controllers/logs.controller');

const crmAccess = requireServiceAccess('CRM');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/order-timeline', staffAuth, crmAccess, requirePermission('orders.view'), listOrderTimelineLogs);

module.exports = router;
