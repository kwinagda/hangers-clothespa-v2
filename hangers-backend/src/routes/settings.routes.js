const express = require('express');
const router  = express.Router();
const { staffAuth } = require('../middleware/auth');
const { getSettings, updateSettings, getPublicSettings } = require('../controllers/settings.controller');

router.get('/public',  getPublicSettings);          // no auth — used by POS
router.get('/',        staffAuth, getSettings);
router.patch('/',      staffAuth, updateSettings);

module.exports = router;
