const express = require('express');
const router  = express.Router();
const { staffAuth }    = require('../middleware/auth');
const { requireRole, requireServiceAccess, superAdminOnly } = require('../middleware/rbac');
const { staffLoginLimiter, pinLoginLimiter } = require('../middleware/rateLimit');
const { privateNoStore } = require('../middleware/privateCache');
const { requireTrustedWrite } = require('../middleware/origin');

const {
  staffLoginController, staffMeController,
  staffLogoutController, staffChangePasswordController, createStaffController,
} = require('../controllers/staffAuth.controller');

const { pinLoginController, changePinController, resetPinController } =
  require('../controllers/staffPinAuth.controller');

const { listStaff, updateStaff, deactivateStaff, reactivateStaff } =
  require('../controllers/staffManagement.controller');

router.use(privateNoStore);
router.use(requireTrustedWrite);
const crmAccess = requireServiceAccess('CRM');
const staffAppAccess = requireServiceAccess('STAFF_APP');

// ── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login',      staffLoginLimiter, staffLoginController);
router.post('/auth/pin-login',  pinLoginLimiter, pinLoginController);          // Plant & Delivery app
router.get ('/auth/me',         staffAuth, staffMeController);
router.post('/auth/logout',     staffAuth, staffLogoutController);
router.post('/auth/change-password', staffAuth, staffChangePasswordController);
router.post('/auth/change-pin', staffAuth, staffAppAccess, changePinController);

// ── Create & manage staff ─────────────────────────────────────────────────────
router.post('/create',         staffAuth, crmAccess, superAdminOnly,                           createStaffController);
router.get ('/list',           staffAuth, crmAccess, requireRole('SUPER_ADMIN','MANAGER'),     listStaff);
router.put ('/:id',            staffAuth, crmAccess, requireRole('SUPER_ADMIN','MANAGER'),     updateStaff);
router.put ('/:id/deactivate', staffAuth, crmAccess, superAdminOnly,                           deactivateStaff);
router.put ('/:id/reactivate', staffAuth, crmAccess, superAdminOnly,                           reactivateStaff);
router.post('/:id/reset-pin',  staffAuth, crmAccess, requireRole('SUPER_ADMIN','MANAGER'),     resetPinController);

module.exports = router;
