const express  = require('express');
const router   = express.Router();
const { listCustomers, getCustomer, createCustomer, updateCustomer } = require('../controllers/customers.controller');
const { staffAuth } = require('../middleware/auth');

router.get('/',      staffAuth, listCustomers);
router.get('/:id',   staffAuth, getCustomer);
router.post('/',     staffAuth, createCustomer);
router.patch('/:id', staffAuth, updateCustomer);

module.exports = router;
