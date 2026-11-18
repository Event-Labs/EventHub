const express = require('express');
const operationsController = require('./operations.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/organizer/overview', authorize('ORGANIZER', 'ADMIN'), operationsController.organizerOverview);
router.get('/organizer/staff-candidates', authorize('ORGANIZER', 'ADMIN'), operationsController.staffCandidates);
router.post('/organizer/staff-invitations', authorize('ORGANIZER', 'ADMIN'), operationsController.inviteStaff);
router.delete('/organizer/staff-invitations/:invitationId', authorize('ORGANIZER', 'ADMIN'), operationsController.deleteStaffInvitation);
router.patch('/organizer/events/:eventId/staff/:staffId', authorize('ORGANIZER', 'ADMIN'), operationsController.updateStaffAssignment);
router.delete('/organizer/events/:eventId/staff/:staffId', authorize('ORGANIZER', 'ADMIN'), operationsController.removeStaff);

router.get('/organizer/events/:eventId/gates', authorize('ORGANIZER', 'ADMIN'), operationsController.listEventGates);
router.post('/organizer/events/:eventId/gates', authorize('ORGANIZER', 'ADMIN'), operationsController.createEventGate);
router.patch('/organizer/events/:eventId/gates/:gateId', authorize('ORGANIZER', 'ADMIN'), operationsController.updateEventGate);
router.delete('/organizer/events/:eventId/gates/:gateId', authorize('ORGANIZER', 'ADMIN'), operationsController.deleteEventGate);
router.patch('/organizer/events/:eventId/devices/:deviceId/gate', authorize('ORGANIZER', 'ADMIN'), operationsController.updateEventDeviceGate);

router.get('/staff-invitations/me', operationsController.myInvitations);
router.post('/staff-invitations/:invitationId/accept', operationsController.acceptInvitation);
router.post('/staff-invitations/:invitationId/decline', operationsController.declineInvitation);

router.get('/staff/overview', authorize('STAFF', 'ADMIN'), operationsController.staffOverview);
router.get('/staff/events', authorize('STAFF', 'ADMIN'), operationsController.staffEvents);
router.get('/staff/check-in-report', authorize('STAFF', 'ADMIN'), operationsController.staffCheckInReport);
router.get('/staff/gate-checkin-history', authorize('STAFF', 'ADMIN'), operationsController.staffGateCheckInHistory);

module.exports = router;
