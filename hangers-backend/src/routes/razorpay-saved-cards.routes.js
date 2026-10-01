const router = require('express').Router();
const { customerAuth } = require('../middleware/auth');
const { requireTrustedWrite } = require('../middleware/origin');
const { buildLimiter } = require('../middleware/rateLimit');
const controller = require('../controllers/razorpay-saved-cards.controller');

// Mounted only at /api/v1/customer/payments/razorpay/saved-cards.
// All actions require the existing customer session, never a public share.
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.vary('Cookie');
  res.vary('Authorization');
  next();
});
router.use(customerAuth);
router.use(requireTrustedWrite);
router.use(buildLimiter(60 * 1000, 30, 'Too many saved-card requests. Please wait before retrying.'));
router.use((req, res, next) => {
  if (['POST', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ success: false, code: 'SAVED_CARD_CONTENT_TYPE_INVALID', message: 'A JSON request is required.' });
  }
  return next();
});

router.get('/config', controller.getConfiguration);
router.get('/', controller.listSavedCards);
router.post('/consents', controller.recordConsent);
router.post('/prepare', controller.prepareNewCard);
router.post('/select', controller.selectSavedCard);
// The opaque selector belongs in JSON, never in the URL or access log.
router.delete('/', controller.deleteSavedCard);

module.exports = router;
