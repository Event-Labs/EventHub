const express = require('express');
const multer = require('multer');
const organizerEventsController = require('./organizerEvents.controller');
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

router.get('/me', organizerEventsController.getMe);
router.patch('/me', organizerEventsController.updateMe);
router.post('/me/sensitive-access/start', organizerEventsController.startSensitiveAccess);
router.post('/me/sensitive-access/verify', organizerEventsController.verifySensitiveAccess);
router.get('/venues', organizerEventsController.getVenues);
router.get('/ai-content-generation/latest', organizerEventsController.getLatestAiContentGeneration);
router.post('/ai-content-generation', organizerEventsController.generateAiEventContent);
router.post('/ai-extract-event', upload.single('file'), organizerEventsController.extractEventFromFile);
router.post('/', organizerEventsController.createEvent);
router.get('/', organizerEventsController.listEvents);
router.get('/:eventId', organizerEventsController.getEvent);
router.put('/:eventId', organizerEventsController.updateEvent);
router.post('/:eventId/submit', organizerEventsController.submitEvent);
router.post('/:eventId/publish', organizerEventsController.publishEvent);
router.post('/:eventId/cancel', organizerEventsController.cancelEvent);
router.post('/:eventId/sessions', organizerEventsController.addSession);
router.put('/:eventId/sessions/:id', organizerEventsController.updateSession);
router.delete('/:eventId/sessions/:id', organizerEventsController.deleteSession);
router.post('/:eventId/sessions/:id/zone-assignments', organizerEventsController.assignZoneTicketTypes);
router.post('/:eventId/sessions/:id/ticket-types', organizerEventsController.addTicketType);
router.put('/:eventId/sessions/:id/ticket-types/:ttId', organizerEventsController.updateTicketType);
router.delete('/:eventId/sessions/:id/ticket-types/:ttId', organizerEventsController.deleteTicketType);

module.exports = router;
