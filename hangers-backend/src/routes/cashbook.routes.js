const express = require('express');
const router  = express.Router();
const { staffAuth }                          = require('../middleware/auth');
const { requirePermission, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore }                     = require('../middleware/privateCache');
const { requireTrustedWrite }                = require('../middleware/origin');
const { getCashBook, addCashEntry }          = require('../controllers/cashbook.controller');
const { idempotent }                         = require('../middleware/idempotency');

const financeAccess = requireServiceAccess('FINANCE');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',  staffAuth, financeAccess, requirePermission('finance.view'), getCashBook);
router.post('/', staffAuth, financeAccess, requirePermission('finance.cash_manage'), idempotent({ scope: 'cashbook.entry' }), addCashEntry);

module.exports = router;
