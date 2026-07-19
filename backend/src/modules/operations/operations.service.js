const authRepository = require('../auth/auth.repository');
const jwt = require('jsonwebtoken');
const operationsRepository = require('./operations.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const notificationsService = require('../notifications/notifications.service');
const { sendEmail } = require('../../infrastructure/email/email.service');
const logger = require('../../core/logger');

class OperationsService {
  escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  formatVietnamDateTime(value) {
    if (!value) return 'Không xác định';
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(value));
  }

  async sendStaffInvitationEmail({ email, event, organizer, invitedUser, invitation }) {
    const notificationsUrl = `${process.env.CLIENT_URL}/notifications`;
    const subject = `Lời mời làm staff cho sự kiện ${event.title}`;
    const role = invitation.staff_role || 'Staff';
    const expiresAt = this.formatVietnamDateTime(invitation.expires_at);
    const organizerName = organizer.organization_name || 'Ban tổ chức';
    const message = [
      `Xin chào ${invitedUser.full_name || invitedUser.email},`,
      '',
      `${organizerName} đã mời bạn làm ${role} cho sự kiện "${event.title}".`,
      `Lời mời hết hạn lúc: ${expiresAt}.`,
      '',
      `Vui lòng đăng nhập EventHub và vào trang Thông báo để chấp nhận hoặc từ chối lời mời: ${notificationsUrl}`,
    ].join('\n');
    const html = `
      <p>Xin chào <strong>${this.escapeHtml(invitedUser.full_name || invitedUser.email)}</strong>,</p>
      <p><strong>${this.escapeHtml(organizerName)}</strong> đã mời bạn làm <strong>${this.escapeHtml(role)}</strong> cho sự kiện <strong>${this.escapeHtml(event.title)}</strong>.</p>
      <p>Lời mời hết hạn lúc: <strong>${this.escapeHtml(expiresAt)}</strong>.</p>
      <p>
        <a href="${this.escapeHtml(notificationsUrl)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
          Xem lời mời trên EventHub
        </a>
      </p>
      <p>Nếu nút không hoạt động, hãy truy cập: ${this.escapeHtml(notificationsUrl)}</p>
    `;

    try {
      await sendEmail({ email, subject, message, html });
      return true;
    } catch (error) {
      logger.error(`Staff invitation email failed for ${email}:`, error);
      return false;
    }
  }

  serializeAuthUser(user, roles) {
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      roles,
    };
  }

  async generateAccessTokenForUser(user) {
    const rawRoles = await authRepository.findUserRoles(user.id);
    let roles = rawRoles;
    const staffEventIds = rawRoles.includes('STAFF')
      ? await operationsRepository.getStaffEventIds(user.id)
      : [];

    if (rawRoles.includes('STAFF') && staffEventIds.length === 0) {
      roles = rawRoles.filter((role) => role !== 'STAFF');
    }

    const payload = { sub: user.id, roles };

    if (roles.includes('STAFF')) {
      payload.staff_event_ids = staffEventIds;
    }

    const accessToken = jwt.sign(
      payload,
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN },
    );

    return {
      accessToken,
      user: this.serializeAuthUser(user, roles),
    };
  }

  isEventStaffManageable(event) {
    if (!event || event.status === 'DRAFT') {
      return false;
    }

    const isApprovedForStaff = event.status === 'PUBLISHED'
      || (event.status === 'COMPLETED' && event.approval_status === 'APPROVED');
    if (!isApprovedForStaff) {
      return false;
    }

    const effectiveEnd = event.end_time || event.start_time;
    if (!effectiveEnd) {
      return false;
    }

    return new Date(effectiveEnd).getTime() >= Date.now();
  }

  assertEventStaffManageable(event) {
    if (!this.isEventStaffManageable(event)) {
      throw new AppError(
        'Sự kiện đã hết hiệu lực, đang ở bản nháp hoặc chưa được duyệt. Bạn chỉ có thể xem thông số và báo cáo.',
        400,
        ErrorCodes.INVALID_INPUT,
      );
    }
  }

  async getOrganizerContext(userId) {
    const organizer = await operationsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Không tìm thấy hồ sơ organizer hoặc tài khoản chưa hoạt động.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }
    return organizer;
  }

  async resolveOrganizerEvent(organizerId, eventId) {
    const event = await operationsRepository.findOrganizerEvent(eventId, organizerId);
    if (!event) {
      throw new AppError('Không tìm thấy sự kiện hoặc sự kiện không thuộc organizer này.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
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
        'Bạn cần có gói đăng ký còn hiệu lực trước khi phân công staff.',
        403,
        ErrorCodes.STAFF_SUBSCRIPTION_REQUIRED,
      );
    }

    if (quota.remaining_slots <= 0) {
      throw new AppError(
        `Đã đạt giới hạn staff của gói hiện tại (${quota.per_event_limit} staff cho mỗi sự kiện).`,
        400,
        ErrorCodes.STAFF_LIMIT_REACHED,
        quota,
      );
    }

    return quota;
  }

  async assertInvitableUser(invitedUser, organizer, event) {
    if (invitedUser.id === organizer.user_id || invitedUser.id === event.organizer_user_id) {
      throw new AppError('Không thể mời chủ sự kiện làm staff của chính sự kiện này.', 400, ErrorCodes.STAFF_INVITE_INVALID_USER);
    }

    const roles = await authRepository.findUserRoles(invitedUser.id);
    if (roles.includes('ORGANIZER')) {
      throw new AppError('Không thể mời tài khoản organizer làm staff sự kiện.', 400, ErrorCodes.STAFF_INVITE_INVALID_USER);
    }

    if (roles.includes('ADMIN')) {
      throw new AppError('Không thể mời tài khoản admin làm staff sự kiện.', 400, ErrorCodes.STAFF_INVITE_INVALID_USER);
    }
  }

  async assertStaffScheduleAvailable(staffId, eventId) {
    const conflict = await operationsRepository.findStaffScheduleConflict(staffId, eventId);
    if (!conflict) return;

    const conflictStart = this.formatVietnamDateTime(conflict.start_time);
    const conflictEnd = this.formatVietnamDateTime(conflict.end_time || conflict.start_time);
    throw new AppError(
      `Nhân sự đã có lịch tại sự kiện "${conflict.event_title}" từ ${conflictStart} đến ${conflictEnd}.`,
      409,
      ErrorCodes.STAFF_SCHEDULE_CONFLICT,
      conflict,
    );
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
    this.assertEventStaffManageable(event);

    const invitedUser = await operationsRepository.findActiveUserByEmail(payload.email);
    if (!invitedUser) {
      throw new AppError('Email phải thuộc về một tài khoản customer EventHub đang hoạt động.', 400, ErrorCodes.INVALID_INPUT);
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

    await this.assertStaffScheduleAvailable(invitedUser.id, payload.event_id);

    const quota = await this.assertStaffQuotaAvailable(organizer.id, payload.event_id);

    const invitation = await operationsRepository.createStaffInvitation({
      eventId: payload.event_id,
      organizerId: organizer.id,
      invitedUserId: invitedUser.id,
      email: invitedUser.email,
      staffRole: payload.staff_role,
      invitedBy: userId,
    });

    const emailSent = await this.sendStaffInvitationEmail({
      email: invitedUser.email,
      event,
      organizer,
      invitedUser,
      invitation,
    });

    return {
      ...invitation,
      event_title: event.title,
      invited_user_name: invitedUser.full_name,
      email_sent: emailSent,
      quota,
    };
  }

  async removeStaff(userId, { eventId, staffId }) {
    const organizer = await this.getOrganizerContext(userId);
    const event = await this.resolveOrganizerEvent(organizer.id, eventId);
    this.assertEventStaffManageable(event);

    const removed = await operationsRepository.removeStaff(eventId, staffId);
    if (!removed) {
      throw new AppError('Không tìm thấy phân công staff cho sự kiện này.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return { event_id: eventId, staff_id: staffId, removed: true };
  }

  async createTask(userId, payload) {
    const organizer = await this.getOrganizerContext(userId);
    const event = await this.resolveOrganizerEvent(organizer.id, payload.event_id);
    this.assertEventStaffManageable(event);

    const assigned = await operationsRepository.findEventStaffAssignment(payload.event_id, payload.staff_id);
    if (!assigned) {
      throw new AppError('Staff phải được phân công vào sự kiện trước khi nhận công việc.', 400, ErrorCodes.STAFF_NOT_ASSIGNED);
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
      throw new AppError('Không tìm thấy người dùng.', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
    }

    return operationsRepository.listInvitationsForUser(user.id, user.email);
  }

  async acceptInvitation(userId, invitationId) {
    const user = await operationsRepository.findActiveUserById(userId);
    if (!user) {
      throw new AppError('Không tìm thấy người dùng.', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
    }

    const invitation = await operationsRepository.findInvitationForUser(invitationId, user.id, user.email);
    if (!invitation) {
      throw new AppError('Không tìm thấy lời mời staff.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (invitation.status !== 'PENDING') {
      throw new AppError('Lời mời này đã được phản hồi trước đó.', 400, ErrorCodes.INVALID_INPUT);
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await operationsRepository.declineInvitation(invitationId, user.id);
      throw new AppError('Lời mời staff đã hết hạn.', 400, ErrorCodes.INVALID_INPUT);
    }

    const existing = await operationsRepository.findEventStaffAssignment(invitation.event_id, user.id);
    // invitation.organizer_id comes from the JSON metadata inside notifications.content
    if (!existing && invitation.organizer_id) {
      const event = await operationsRepository.findOrganizerEvent(invitation.event_id, invitation.organizer_id);
      this.assertEventStaffManageable(event);
      await this.assertStaffScheduleAvailable(user.id, invitation.event_id);
      await this.assertStaffQuotaAvailable(invitation.organizer_id, invitation.event_id);
    }

    const result = await operationsRepository.acceptInvitation({
      invitationId,
      userId: user.id,
      staffRole: invitation.staff_role,
      acceptedBy: invitation.invited_by,
    });

    if (result.invalidStatus) {
      throw new AppError('Lời mời này đã được phản hồi trước đó.', 400, ErrorCodes.INVALID_INPUT);
    }

    const session = await this.generateAccessTokenForUser(user);

    return {
      ...result,
      ...session,
      staff_portal_url: '/staff',
      message: 'Bạn đã nhận lời mời thành công. Cổng nhân sự đã sẵn sàng cho bạn.',
    };
  }

  async declineInvitation(userId, invitationId) {
    const user = await operationsRepository.findActiveUserById(userId);
    if (!user) {
      throw new AppError('Không tìm thấy người dùng.', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
    }

    const invitation = await operationsRepository.findInvitationForUser(invitationId, user.id, user.email);
    if (!invitation) {
      throw new AppError('Không tìm thấy lời mời staff.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (invitation.status !== 'PENDING') {
      throw new AppError('Lời mời này đã được phản hồi trước đó.', 400, ErrorCodes.INVALID_INPUT);
    }

    return operationsRepository.declineInvitation(invitationId, user.id);
  }

  async listStaffAssignedEvents(staffId) {
    return operationsRepository.listStaffAssignedEvents(staffId);
  }

  async getStaffOverview(staffId) {
    return operationsRepository.getStaffOverview(staffId);
  }

  async getStaffCheckInReport(staffId, eventId = null) {
    let event = null;

    if (eventId) {
      event = await operationsRepository.findStaffAssignedEvent(staffId, eventId);
      if (!event) {
        throw new AppError(
          'Không tìm thấy sự kiện hoặc bạn không được phân công vào sự kiện này.',
          403,
          ErrorCodes.AUTH_FORBIDDEN,
        );
      }
    }

    const report = await operationsRepository.getStaffCheckInReport(staffId, eventId);
    return { event, ...report };
  }

  async listStaffTasks(staffId, eventId = null) {
    return operationsRepository.listStaffTasks(staffId, eventId);
  }

  async updateStaffTaskStatus(staffId, taskId, status) {
    const task = await operationsRepository.updateStaffTaskStatus(taskId, staffId, status);
    if (!task) {
      throw new AppError('Không tìm thấy công việc hoặc bạn không còn quyền staff cho sự kiện này.', 403, ErrorCodes.AUTH_FORBIDDEN);
    }
    return task;
  }
}

module.exports = new OperationsService();
