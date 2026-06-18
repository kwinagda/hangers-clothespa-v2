const express  = require('express');
const router   = express.Router();
const { listCustomers, getCustomer, getReferralReport, createCustomer, updateCustomer, addCustomerAddress } = require('../controllers/customers.controller');
const { staffAuth } = require('../middleware/auth');
const { requirePermission, requireServiceAccess } = require('../middleware/rbac');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const crmAccess = requireServiceAccess('CRM');

router.get('/',      staffAuth, crmAccess, requirePermission('customers.view'), listCustomers);
router.get('/referrals/report', staffAuth, crmAccess, requirePermission('customers.view'), getReferralReport);
router.get('/:id',   staffAuth, crmAccess, requirePermission('customers.view'), getCustomer);
router.post('/',     staffAuth, crmAccess, requirePermission('customers.edit'), createCustomer);
router.post('/:id/addresses', staffAuth, crmAccess, requirePermission('customers.edit'), addCustomerAddress);
router.patch('/:id', staffAuth, crmAccess, requirePermission('customers.edit'), updateCustomer);

module.exports = router;
