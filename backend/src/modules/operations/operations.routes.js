const express = require('express');
const operationsController = require('./operations.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/organizer/overview', authorize('ORGANIZER', 'ADMIN'), operationsController.organizerOverview);
router.get('/organizer/staff-candidates', authorize('ORGANIZER', 'ADMIN'), operationsController.staffCandidates);
router.post('/organizer/staff-invitations', authorize('ORGANIZER', 'ADMIN'), operationsController.inviteStaff);
router.delete('/organizer/staff-invitations/:invitationId', authorize('ORGANIZER', 'ADMIN'), operationsController.deleteStaffInvitation);
router.delete('/organizer/events/:eventId/staff/:staffId', authorize('ORGANIZER', 'ADMIN'), operationsController.removeStaff);
router.post('/organizer/tasks', authorize('ORGANIZER', 'ADMIN'), operationsController.createTask);
router.get('/organizer/tasks', authorize('ORGANIZER', 'ADMIN'), operationsController.organizerTasks);

router.get('/staff-invitations/me', operationsController.myInvitations);
router.post('/staff-invitations/:invitationId/accept', operationsController.acceptInvitation);
router.post('/staff-invitations/:invitationId/decline', operationsController.declineInvitation);

router.get('/staff/overview', authorize('STAFF', 'ADMIN'), operationsController.staffOverview);
router.get('/staff/events', authorize('STAFF', 'ADMIN'), operationsController.staffEvents);
router.get('/staff/check-in-report', authorize('STAFF', 'ADMIN'), operationsController.staffCheckInReport);
router.get('/staff/tasks', authorize('STAFF', 'ADMIN'), operationsController.staffTasks);
router.patch('/staff/tasks/:taskId/status', authorize('STAFF', 'ADMIN'), operationsController.updateStaffTaskStatus);

module.exports = router;
