const express  = require('express');
const router   = express.Router();
const { listCustomers, getCustomer, createCustomer, updateCustomer, addCustomerAddress } = require('../controllers/customers.controller');
const { staffAuth } = require('../middleware/auth');

router.get('/',      staffAuth, listCustomers);
router.get('/:id',   staffAuth, getCustomer);
router.post('/',     staffAuth, createCustomer);
router.post('/:id/addresses', staffAuth, addCustomerAddress);
router.patch('/:id', staffAuth, updateCustomer);

module.exports = router;
