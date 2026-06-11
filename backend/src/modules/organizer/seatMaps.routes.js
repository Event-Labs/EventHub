const express = require('express');
const seatMapsController = require('./seatMaps.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(
  protect,
  authorize('ORGANIZER', 'organizer', 'ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'),
);

router.get('/:seatMapId', seatMapsController.getSeatMap);
router.put('/:seatMapId', seatMapsController.updateSeatMap);
router.delete('/:seatMapId', seatMapsController.deleteSeatMap);

module.exports = router;
