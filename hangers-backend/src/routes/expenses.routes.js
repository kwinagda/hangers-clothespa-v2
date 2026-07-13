const express = require('express');
const router  = express.Router();
const { staffAuth }                                   = require('../middleware/auth');
const { requirePermission, requireServiceAccess }     = require('../middleware/rbac');
const { privateNoStore }                              = require('../middleware/privateCache');
const { requireTrustedWrite }                         = require('../middleware/origin');
const { getExpenses, addExpense, deleteExpense, approveExpense } = require('../controllers/expenses.controller');
const { idempotent }                                  = require('../middleware/idempotency');

const financeAccess = requireServiceAccess('FINANCE');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',       staffAuth, financeAccess, requirePermission('finance.view'), getExpenses);
router.post('/',      staffAuth, financeAccess, requirePermission('finance.expense_create'), idempotent({ scope: 'expense.create' }), addExpense);
router.post('/:id/approve', staffAuth, financeAccess, requirePermission('finance.expense_approve'), idempotent({ scope: 'expense.approve' }), approveExpense);
router.delete('/:id', staffAuth, financeAccess, requirePermission('finance.expense_void'), idempotent({ scope: 'expense.void' }), deleteExpense);

module.exports = router;
