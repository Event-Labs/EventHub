const ApiResponse = require('../../core/response/ApiResponse');
const operationsService = require('./operations.service');
const {
  inviteStaffSchema,
  updateStaffAssignmentSchema,
  invitationIdParamSchema,
  removeStaffSchema,
  eventIdQuerySchema,
} = require('./operations.validation');

class OperationsController {
  organizerOverview = async (req, res, next) => {
    try {
      const data = await operationsService.getOrganizerOverview(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Organizer operations fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  staffCandidates = async (req, res, next) => {
    try {
      const data = await operationsService.listStaffCandidates(req.query.search || '');
      res.status(200).json(ApiResponse.success(data, 'Staff candidates fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  inviteStaff = async (req, res, next) => {
    try {
      const payload = inviteStaffSchema.parse(req.body);
      const data = await operationsService.inviteStaff(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Staff invitation sent successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateStaffAssignment = async (req, res, next) => {
    try {
      const params = removeStaffSchema.parse(req.params);
      const payload = updateStaffAssignmentSchema.parse(req.body);
      const data = await operationsService.updateStaffAssignment(req.user.sub, {
        eventId: params.eventId,
        staffId: params.staffId,
        staffRole: payload.staff_role,
        gate: payload.gate,
        zone: payload.zone,
      });
      res.status(200).json(ApiResponse.success(data, 'Staff assignment updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  removeStaff = async (req, res, next) => {
    try {
      const params = removeStaffSchema.parse(req.params);
      const data = await operationsService.removeStaff(req.user.sub, params);
      res.status(200).json(ApiResponse.success(data, 'Staff removed successfully'));
    } catch (error) {
      next(error);
    }
  };

  deleteStaffInvitation = async (req, res, next) => {
    try {
      const params = invitationIdParamSchema.parse(req.params);
      const data = await operationsService.deleteStaffInvitation(req.user.sub, params.invitationId);
      res.status(200).json(ApiResponse.success(data, 'Staff invitation deleted successfully'));
    } catch (error) {
      next(error);
    }
  };

  staffEvents = async (req, res, next) => {
    try {
      const data = await operationsService.listStaffAssignedEvents(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Assigned events fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  staffOverview = async (req, res, next) => {
    try {
      const data = await operationsService.getStaffOverview(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Staff overview fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  staffCheckInReport = async (req, res, next) => {
    try {
      const query = eventIdQuerySchema.parse(req.query);
      const data = await operationsService.getStaffCheckInReport(req.user.sub, query.event_id || null);
      res.status(200).json(ApiResponse.success(data, 'Staff check-in report fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  myInvitations = async (req, res, next) => {
    try {
      const data = await operationsService.listMyInvitations(req.user.sub);
      res.status(200).json(ApiResponse.success(data, 'Staff invitations fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  acceptInvitation = async (req, res, next) => {
    try {
      const params = invitationIdParamSchema.parse(req.params);
      const data = await operationsService.acceptInvitation(req.user.sub, params.invitationId);
      res.status(200).json(ApiResponse.success(data, 'Staff invitation accepted successfully'));
    } catch (error) {
      next(error);
    }
  };

  declineInvitation = async (req, res, next) => {
    try {
      const params = invitationIdParamSchema.parse(req.params);
      const data = await operationsService.declineInvitation(req.user.sub, params.invitationId);
      res.status(200).json(ApiResponse.success(data, 'Staff invitation declined successfully'));
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new OperationsController();
