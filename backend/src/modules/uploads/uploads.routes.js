const express = require('express');
const uploadsController = require('./uploads.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/cloudinary/event-image/signature', protect, uploadsController.createEventImageSignature);
router.post('/cloudinary/avatar/signature', protect, uploadsController.createAvatarSignature);

module.exports = router;
