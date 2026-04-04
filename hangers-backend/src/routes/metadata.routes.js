const router = require('express').Router();
const { getMetadata } = require('../controllers/metadata.controller');

router.get('/', getMetadata);

module.exports = router;
