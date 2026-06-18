// ─────────────────────────────────────────────────────────────────────────────
// ADDRESSES ROUTES — /api/v1/addresses  (customer-auth protected)
// Add to src/index.js:
//   const addressesRouter = require('./routes/addresses.routes');
//   app.use('/api/v1/addresses', addressesRouter);
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();
const { customerAuth } = require('../middleware/auth');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');
const {
  getAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
} = require('../controllers/addresses.controller');

router.use(privateNoStore);
router.use(requireTrustedWrite);

router.get('/',              customerAuth, getAddresses);
router.post('/',             customerAuth, createAddress);
router.patch('/:id',         customerAuth, updateAddress);
router.patch('/:id/default', customerAuth, setDefaultAddress);
router.delete('/:id',        customerAuth, deleteAddress);

module.exports = router;
