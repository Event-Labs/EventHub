const ApiResponse = require('../../core/response/ApiResponse');
const operationsService = require('./operations.service');
const {
  inviteStaffSchema,
  updateStaffAssignmentSchema,
  invitationIdParamSchema,
  removeStaffSchema,
  eventIdParamSchema,
  eventGateParamSchema,
  createEventGateSchema,
  updateEventGateSchema,
  eventDeviceParamSchema,
  updateEventDeviceGateSchema,
  eventIdQuerySchema,
  gateHistoryQuerySchema,
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
        gateId: payload.gate_id,
        gate: payload.gate,
        zone: payload.zone,
        sessionId: payload.session_id,
        sessionIds: payload.session_ids,
      });
      res.status(200).json(ApiResponse.success(data, 'Staff assignment updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  listEventGates = async (req, res, next) => {
    try {
      const { eventId } = eventIdParamSchema.parse(req.params);
      const data = await operationsService.listEventGates(req.user.sub, eventId);
      res.status(200).json(ApiResponse.success(data, 'Event gates fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  createEventGate = async (req, res, next) => {
    try {
      const { eventId } = eventIdParamSchema.parse(req.params);
      const payload = createEventGateSchema.parse(req.body);
      const data = await operationsService.createEventGate(req.user.sub, eventId, payload);
      res.status(201).json(ApiResponse.success(data, 'Event gate created successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateEventGate = async (req, res, next) => {
    try {
      const { eventId, gateId } = eventGateParamSchema.parse(req.params);
      const payload = updateEventGateSchema.parse(req.body);
      const data = await operationsService.updateEventGate(req.user.sub, eventId, gateId, payload);
      res.status(200).json(ApiResponse.success(data, 'Event gate updated successfully'));
    } catch (error) {
      next(error);
    }
  };

  deleteEventGate = async (req, res, next) => {
    try {
      const { eventId, gateId } = eventGateParamSchema.parse(req.params);
      const data = await operationsService.deleteEventGate(req.user.sub, eventId, gateId);
      res.status(200).json(ApiResponse.success(data, 'Event gate deleted successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateEventDeviceGate = async (req, res, next) => {
    try {
      const { eventId, deviceId } = eventDeviceParamSchema.parse(req.params);
      const payload = updateEventDeviceGateSchema.parse(req.body);
      const data = await operationsService.updateOrganizerEventDeviceGate(
        req.user.sub,
        eventId,
        deviceId,
        payload.assigned_gate_id,
      );
      res.status(200).json(ApiResponse.success(data, 'Device gate updated successfully'));
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

  staffGateCheckInHistory = async (req, res, next) => {
    try {
      const query = gateHistoryQuerySchema.parse(req.query);
      const data = await operationsService.getStaffGateCheckInHistory(req.user.sub, {
        eventId: query.event_id || null,
        page: query.page,
        limit: query.limit,
        result: query.result,
        source: query.source,
      });
      res.status(200).json(ApiResponse.success(data, 'Staff gate check-in history fetched successfully'));
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
