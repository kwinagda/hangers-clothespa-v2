const express = require('express');
const router  = express.Router();
const { staffAuth }    = require('../middleware/auth');
const { requireRole, superAdminOnly } = require('../middleware/rbac');

const {
  staffLoginController, staffMeController,
  staffLogoutController, createStaffController,
} = require('../controllers/staffAuth.controller');

const { pinLoginController, changePinController, resetPinController } =
  require('../controllers/staffPinAuth.controller');

const { listStaff, updateStaff, deactivateStaff, reactivateStaff } =
  require('../controllers/staffManagement.controller');

// ── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login',      staffLoginController);
router.post('/auth/pin-login',  pinLoginController);          // Plant & Delivery app
router.get ('/auth/me',         staffAuth, staffMeController);
router.post('/auth/logout',     staffAuth, staffLogoutController);
router.post('/auth/change-pin', staffAuth, changePinController);

// ── Create & manage staff ─────────────────────────────────────────────────────
router.post('/create',         staffAuth, superAdminOnly,                           createStaffController);
router.get ('/list',           staffAuth, requireRole('SUPER_ADMIN','MANAGER'),     listStaff);
router.put ('/:id',            staffAuth, requireRole('SUPER_ADMIN','MANAGER'),     updateStaff);
router.put ('/:id/deactivate', staffAuth, superAdminOnly,                           deactivateStaff);
router.put ('/:id/reactivate', staffAuth, superAdminOnly,                           reactivateStaff);
router.post('/:id/reset-pin',  staffAuth, requireRole('SUPER_ADMIN','MANAGER'),     resetPinController);

module.exports = router;
