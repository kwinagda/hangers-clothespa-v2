const express = require('express');
const router  = express.Router();
const { staffAuth }                                   = require('../middleware/auth');
const { requireRole, requireServiceAccess }           = require('../middleware/rbac');
const { privateNoStore }                              = require('../middleware/privateCache');
const { requireTrustedWrite }                         = require('../middleware/origin');
const { getExpenses, addExpense, deleteExpense }      = require('../controllers/expenses.controller');

const financeRoles  = requireRole('SUPER_ADMIN', 'MANAGER', 'ACCOUNTS');
const financeAccess = requireServiceAccess('FINANCE');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',     staffAuth, financeAccess, financeRoles, getExpenses);
router.post('/',    staffAuth, financeAccess, financeRoles, addExpense);
router.delete('/:id', staffAuth, financeAccess, financeRoles, deleteExpense);

module.exports = router;
