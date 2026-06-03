const express = require('express');
const uploadsController = require('./uploads.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/cloudinary/event-image/signature', protect, uploadsController.createEventImageSignature);
router.post('/cloudinary/avatar/signature', protect, uploadsController.createAvatarSignature);
router.post('/cloudinary/policy-pdf/signature', protect, uploadsController.createPolicyPdfSignature);

module.exports = router;
