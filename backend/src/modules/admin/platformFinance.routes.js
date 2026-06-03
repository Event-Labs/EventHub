const express = require('express');
const platformFinanceController = require('./platformFinance.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, authorize('ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'));

router.get('/fees', platformFinanceController.listFees);
router.post('/fees', platformFinanceController.createFee);
router.patch('/fees/:id', platformFinanceController.updateFee);
router.delete('/fees/:id', platformFinanceController.deleteFee);

router.get('/policies', platformFinanceController.listPolicies);
router.post('/policies', platformFinanceController.createPolicy);
router.patch('/policies/:id', platformFinanceController.updatePolicy);
router.delete('/policies/:id', platformFinanceController.deletePolicy);

router.get('/policies/:id/documents', platformFinanceController.listDocuments);
router.post('/policies/:id/documents', platformFinanceController.createDocument);
router.patch('/policy-documents/:id', platformFinanceController.updateDocument);
router.delete('/policy-documents/:id', platformFinanceController.deleteDocument);

module.exports = router;
