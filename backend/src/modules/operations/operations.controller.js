const ApiResponse = require('../../core/response/ApiResponse');
const operationsService = require('./operations.service');
const {
  inviteStaffSchema,
  invitationIdParamSchema,
  removeStaffSchema,
  createTaskSchema,
  taskIdParamSchema,
  updateTaskStatusSchema,
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

  removeStaff = async (req, res, next) => {
    try {
      const params = removeStaffSchema.parse(req.params);
      const data = await operationsService.removeStaff(req.user.sub, params);
      res.status(200).json(ApiResponse.success(data, 'Staff removed successfully'));
    } catch (error) {
      next(error);
    }
  };

  createTask = async (req, res, next) => {
    try {
      const payload = createTaskSchema.parse(req.body);
      const data = await operationsService.createTask(req.user.sub, payload);
      res.status(201).json(ApiResponse.success(data, 'Staff task created successfully'));
    } catch (error) {
      next(error);
    }
  };

  organizerTasks = async (req, res, next) => {
    try {
      const query = eventIdQuerySchema.parse(req.query);
      const data = await operationsService.listOrganizerTasks(req.user.sub, query.event_id || null);
      res.status(200).json(ApiResponse.success(data, 'Staff tasks fetched successfully'));
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

  staffTasks = async (req, res, next) => {
    try {
      const query = eventIdQuerySchema.parse(req.query);
      const data = await operationsService.listStaffTasks(req.user.sub, query.event_id || null);
      res.status(200).json(ApiResponse.success(data, 'Assigned tasks fetched successfully'));
    } catch (error) {
      next(error);
    }
  };

  updateStaffTaskStatus = async (req, res, next) => {
    try {
      const params = taskIdParamSchema.parse(req.params);
      const payload = updateTaskStatusSchema.parse(req.body);
      const data = await operationsService.updateStaffTaskStatus(req.user.sub, params.taskId, payload.status);
      res.status(200).json(ApiResponse.success(data, 'Staff task status updated successfully'));
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
