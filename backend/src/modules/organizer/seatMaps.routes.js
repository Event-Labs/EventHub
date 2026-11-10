const express = require('express');
const multer = require('multer');
const seatMapsController = require('./seatMaps.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const router = express.Router();

router.use(
  protect,
  authorize('ORGANIZER', 'organizer', 'ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'),
);

router.post(
  '/ai-generate',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  seatMapsController.generateFromImage,
);
router.get('/:seatMapId', seatMapsController.getSeatMap);
router.put('/:seatMapId', seatMapsController.updateSeatMap);
router.delete('/:seatMapId', seatMapsController.deleteSeatMap);

module.exports = router;
