const express = require('express');
const router = express.Router();
const { getPublicInvoice } = require('../controllers/public.controller');

router.get('/invoices/:slug', getPublicInvoice);

module.exports = router;
