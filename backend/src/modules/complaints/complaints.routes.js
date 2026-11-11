const express = require('express');
const { protect } = require('../../middlewares/auth.middleware');
const complaintsController = require('./complaints.controller');

const router = express.Router();

router.use(protect);

router.post('/', (req, res, next) => complaintsController.submitComplaint(req, res, next));
router.get('/my', (req, res, next) => complaintsController.getMyComplaints(req, res, next));
router.get('/:id', (req, res, next) => complaintsController.getComplaintDetail(req, res, next));

module.exports = router;

