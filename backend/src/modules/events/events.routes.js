const express = require('express');
const eventsController = require('./events.controller');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.get('/', optionalAuth, eventsController.getPublicEvents);
router.get('/categories', eventsController.getPublicCategories);
router.get('/sessions/:sessionId/seats', eventsController.getSessionSeats);
router.post('/availability/check', protect, eventsController.checkTicketAvailability);
router.post('/availability/hold', protect, eventsController.holdSeats);
router.post('/availability/release', protect, eventsController.releaseSeatHolds);
router.get('/favorites/me', protect, eventsController.getFavoriteEvents);
router.post('/:eventId/favorite', protect, eventsController.addFavorite);
router.delete('/:eventId/favorite', protect, eventsController.removeFavorite);
router.post('/:eventId/favorite/toggle', protect, eventsController.toggleFavorite);
router.get('/my-events', protect, eventsController.getOrganizerEvents);
router.get('/:identifier', optionalAuth, eventsController.getPublicEventDetail);

module.exports = router;


