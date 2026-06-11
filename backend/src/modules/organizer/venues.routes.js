const express = require('express');
const venuesController = require('./venues.controller');
const seatMapsController = require('./seatMaps.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(
  protect,
  authorize('ORGANIZER', 'organizer', 'ADMIN', 'admin', 'SUPER_ADMIN', 'super_admin'),
);

router.get('/', venuesController.listVenues);
router.post('/', venuesController.createVenue);
router.get('/:venueId/seat-maps', seatMapsController.listByVenue);
router.post('/:venueId/seat-maps', seatMapsController.create);
router.get('/:venueId', venuesController.getVenue);
router.put('/:venueId', venuesController.updateVenue);
router.delete('/:venueId', venuesController.deleteVenue);

module.exports = router;
