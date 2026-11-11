const express = require('express');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const complaintsController = require('../complaints/complaints.controller');

const router = express.Router();

router.use(protect);
router.use(authorize('ADMIN'));

router.get('/', (req, res, next) => complaintsController.getAdminComplaints(req, res, next));
router.get('/stats', (req, res, next) => complaintsController.getComplaintStats(req, res, next));
router.get('/:id', (req, res, next) => complaintsController.getComplaintDetail(req, res, next));
router.patch('/:id/status', (req, res, next) => complaintsController.updateComplaintStatus(req, res, next));

module.exports = router;

