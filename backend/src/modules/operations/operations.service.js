const authRepository = require('../auth/auth.repository');
const operationsRepository = require('./operations.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const notificationsService = require('../notifications/notifications.service');

class OperationsService {
  async getOrganizerContext(userId) {
    const organizer = await operationsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found or inactive.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }
    return organizer;
  }

  async resolveOrganizerEvent(organizerId, eventId) {
    const event = await operationsRepository.findOrganizerEvent(eventId, organizerId);
    if (!event) {
      throw new AppError('Event not found or does not belong to this organizer.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return event;
  }

  async getStaffQuota(organizerId, eventId) {
    const plan = await operationsRepository.findOrganizerCurrentPlan(organizerId);
    const perEventLimit = Number(plan?.max_staff_per_event || plan?.staff_limit || 0);

    if (!plan || perEventLimit <= 0) {
      return {
        active: false,
        per_event_limit: 0,
        assigned_count: 0,
        pending_invitation_count: 0,
        reserved_count: 0,
        remaining_slots: 0,
        plan_name: null,
      };
    }

    const [assignedCount, pendingCount] = await Promise.all([
      operationsRepository.countEventStaff(eventId),
      operationsRepository.countPendingInvitations(eventId),
    ]);

    const reservedCount = assignedCount + pendingCount;

    return {
      active: true,
      per_event_limit: perEventLimit,
      assigned_count: assignedCount,
      pending_invitation_count: pendingCount,
      reserved_count: reservedCount,
      remaining_slots: Math.max(0, perEventLimit - reservedCount),
      plan_name: plan.name,
      subscription_end_date: plan.end_date,
    };
  }

  async assertStaffQuotaAvailable(organizerId, eventId) {
    const quota = await this.getStaffQuota(organizerId, eventId);

    if (!quota.active) {
      throw new AppError(
        'Active subscription is required before assigning staff.',
        403,
        ErrorCodes.STAFF_SUBSCRIPTION_REQUIRED,
      );
    }

    if (quota.remaining_slots <= 0) {
      throw new AppError(
        `Staff limit reached for current subscription (${quota.per_event_limit} staff per event).`,
        400,
        ErrorCodes.STAFF_LIMIT_REACHED,
        quota,
      );
    }

    return quota;
  }

  async assertInvitableUser(invitedUser, organizer, event) {
    if (invitedUser.id === organizer.user_id || invitedUser.id === event.organizer_user_id) {
      throw new AppError('You cannot invite the event organizer as staff.', 400, ErrorCodes.STAFF_INVITE_INVALID_USER);
    }

    const roles = await authRepository.findUserRoles(invitedUser.id);
    if (roles.includes('ORGANIZER')) {
      throw new AppError('Organizer accounts cannot be invited as event staff.', 400, ErrorCodes.STAFF_INVITE_INVALID_USER);
    }

    if (roles.includes('ADMIN')) {
      throw new AppError('Admin accounts cannot be invited as event staff.', 400, ErrorCodes.STAFF_INVITE_INVALID_USER);
    }
  }

  async getOrganizerOverview(userId) {
    const organizer = await this.getOrganizerContext(userId);
    const [plan, events, staffAssignments, tasks, invitations] = await Promise.all([
      operationsRepository.findOrganizerCurrentPlan(organizer.id),
      operationsRepository.findOrganizerEvents(organizer.id),
      operationsRepository.listEventStaff(null, organizer.id),
      operationsRepository.listOrganizerTasks(organizer.id),
      operationsRepository.listOrganizerInvitations(organizer.id),
    ]);

    const perEventLimit = Number(plan?.max_staff_per_event || plan?.staff_limit || 0);

    return {
      organizer,
      subscription: plan
        ? {
            active: true,
            name: plan.name,
            staff_limit: perEventLimit,
            total_staff_limit: Number(plan.staff_limit || 0),
            max_staff_per_event: perEventLimit,
            event_limit: plan.event_limit,
            end_date: plan.end_date,
          }
        : {
            active: false,
            name: null,
            staff_limit: 0,
            total_staff_limit: 0,
            max_staff_per_event: 0,
            event_limit: 0,
            end_date: null,
          },
      events,
      staff_assignments: staffAssignments,
      tasks,
      invitations,
    };
  }

  async listStaffCandidates(search = '') {
    return operationsRepository.findStaffUsers(search);
  }

  async inviteStaff(userId, payload) {
    const organizer = await this.getOrganizerContext(userId);
    const event = await this.resolveOrganizerEvent(organizer.id, payload.event_id);

    const invitedUser = await operationsRepository.findActiveUserByEmail(payload.email);
    if (!invitedUser) {
      throw new AppError('Email must belong to an active EventHub customer account.', 400, ErrorCodes.INVALID_INPUT);
    }

    await this.assertInvitableUser(invitedUser, organizer, event);

    const existing = await operationsRepository.findEventStaffAssignment(payload.event_id, invitedUser.id);
    if (existing) {
      throw new AppError('User đã là staff của sự kiện này.', 409, ErrorCodes.STAFF_ALREADY_ASSIGNED);
    }

    const pendingInvite = await operationsRepository.findPendingInvitation(payload.event_id, invitedUser.email);
    if (pendingInvite) {
      throw new AppError('Đã có lời mời đang chờ xử lý cho email này.', 409, ErrorCodes.STAFF_INVITE_PENDING_EXISTS);
    }

    const quota = await this.assertStaffQuotaAvailable(organizer.id, payload.event_id);

    const invitation = await operationsRepository.createStaffInvitation({
      eventId: payload.event_id,
      organizerId: organizer.id,
      invitedUserId: invitedUser.id,
      email: invitedUser.email,
      staffRole: payload.staff_role,
      invitedBy: userId,
    });

    await notificationsService.createAndDispatch(
      {
        userId: invitedUser.id,
        eventId: payload.event_id,
        title: 'Lời mời làm staff',
        content: `${organizer.organization_name || 'Ban tổ chức'} mời bạn làm staff cho sự kiện "${event.title}". Vui lòng vào mục Thông báo để đồng ý hoặc từ chối.`,
        type: 'EVENT',
      },
      {
        email: invitedUser.email,
      },
    );

    return {
      ...invitation,
      event_title: event.title,
      invited_user_name: invitedUser.full_name,
      quota,
    };
  }

  async removeStaff(userId, { eventId, staffId }) {
    const organizer = await this.getOrganizerContext(userId);
    await this.resolveOrganizerEvent(organizer.id, eventId);

    const removed = await operationsRepository.removeStaff(eventId, staffId);
    if (!removed) {
      throw new AppError('Staff assignment not found.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return { event_id: eventId, staff_id: staffId, removed: true };
  }

  async createTask(userId, payload) {
    const organizer = await this.getOrganizerContext(userId);
    const event = await this.resolveOrganizerEvent(organizer.id, payload.event_id);

    const assigned = await operationsRepository.findEventStaffAssignment(payload.event_id, payload.staff_id);
    if (!assigned) {
      throw new AppError('Staff must be assigned to the event before receiving tasks.', 400, ErrorCodes.STAFF_NOT_ASSIGNED);
    }

    const task = await operationsRepository.createTask({
      eventId: payload.event_id,
      staffId: payload.staff_id,
      title: payload.title,
      description: payload.description,
      createdBy: userId,
    });

    const staffUser = await operationsRepository.findActiveUserById(payload.staff_id);
    if (staffUser) {
      await notificationsService.createAndDispatch({
        userId: staffUser.id,
        eventId: payload.event_id,
        title: 'Công việc mới được giao',
        content: `Bạn được giao công việc "${payload.title}" cho sự kiện "${event.title}".`,
        type: 'EVENT',
      });
    }

    return task;
  }

  async listOrganizerTasks(userId, eventId = null) {
    const organizer = await this.getOrganizerContext(userId);
    return operationsRepository.listOrganizerTasks(organizer.id, eventId);
  }

  async listMyInvitations(userId) {
    const user = await operationsRepository.findActiveUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
    }

    return operationsRepository.listInvitationsForUser(user.id, user.email);
  }

  async acceptInvitation(userId, invitationId) {
    const user = await operationsRepository.findActiveUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
    }

    const invitation = await operationsRepository.findInvitationForUser(invitationId, user.id, user.email);
    if (!invitation) {
      throw new AppError('Invitation not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (invitation.status !== 'PENDING') {
      throw new AppError('Invitation has already been responded to.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await operationsRepository.declineInvitation(invitationId, user.id);
      throw new AppError('Invitation has expired.', 400, ErrorCodes.INVALID_INPUT);
    }

    const existing = await operationsRepository.findEventStaffAssignment(invitation.event_id, user.id);
    // invitation.organizer_id comes from the JSON metadata inside notifications.content
    if (!existing && invitation.organizer_id) {
      await this.assertStaffQuotaAvailable(invitation.organizer_id, invitation.event_id);
    }

    const result = await operationsRepository.acceptInvitation({
      invitationId,
      userId: user.id,
      staffRole: invitation.staff_role,
      acceptedBy: invitation.invited_by,
    });

    if (result.invalidStatus) {
      throw new AppError('Invitation has already been responded to.', 400, ErrorCodes.INVALID_INPUT);
    }

    return {
      ...result,
      requires_relogin: true,
      message: 'Bạn đã trở thành staff. Vui lòng đăng nhập lại để token có quyền STAFF.',
    };
  }

  async declineInvitation(userId, invitationId) {
    const user = await operationsRepository.findActiveUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
    }

    const invitation = await operationsRepository.findInvitationForUser(invitationId, user.id, user.email);
    if (!invitation) {
      throw new AppError('Invitation not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (invitation.status !== 'PENDING') {
      throw new AppError('Invitation has already been responded to.', 400, ErrorCodes.INVALID_INPUT);
    }

    return operationsRepository.declineInvitation(invitationId, user.id);
  }

  async listStaffAssignedEvents(staffId) {
    return operationsRepository.listStaffAssignedEvents(staffId);
  }

  async listStaffTasks(staffId, eventId = null) {
    return operationsRepository.listStaffTasks(staffId, eventId);
  }

  async updateStaffTaskStatus(staffId, taskId, status) {
    const task = await operationsRepository.updateStaffTaskStatus(taskId, staffId, status);
    if (!task) {
      throw new AppError('Task not found or you are not assigned to this task.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }
    return task;
  }
}

module.exports = new OperationsService();
