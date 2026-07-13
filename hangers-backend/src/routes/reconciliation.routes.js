const express = require('express');
const { staffAuth } = require('../middleware/auth');
const { requirePermission, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const { idempotent } = require('../middleware/idempotency');
const { listRuns, runNow } = require('../controllers/reconciliation.controller');

const router = express.Router();
router.use(privateNoStore);
router.use(requireTrustedWrite);
router.get('/', staffAuth, requireServiceAccess('FINANCE'), requirePermission('finance.reconcile'), listRuns);
router.post('/run', staffAuth, requireServiceAccess('FINANCE'), requirePermission('finance.reconcile'), idempotent({ scope: 'finance.reconcile' }), runNow);

module.exports = router;
