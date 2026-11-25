const authRepository = require('../auth/auth.repository');
const jwt = require('jsonwebtoken');
const operationsRepository = require('./operations.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const notificationsService = require('../notifications/notifications.service');
const notificationsRepository = require('../notifications/notifications.repository');
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
    const sessionStr = invitation.session_name ? ` (Phiên: ${invitation.session_name})` : ' (Toàn bộ sự kiện)';
    const locParts = [
      invitation.gate ? `tại ${invitation.gate}` : '',
      invitation.zone ? `khu vực ${invitation.zone}` : '',
    ].filter(Boolean);
    const locationStr = locParts.length > 0 ? ` [${locParts.join(' • ')}]` : '';
    const expiresAt = this.formatVietnamDateTime(invitation.expires_at);
    const organizerName = organizer.organization_name || 'Ban tổ chức';
    const message = [
      `Xin chào ${invitedUser.full_name || invitedUser.email},`,
      '',
      `${organizerName} đã mời bạn làm ${role}${locationStr} cho sự kiện "${event.title}"${sessionStr}.`,
      `Lời mời hết hạn lúc: ${expiresAt}.`,
      '',
      `Vui lòng đăng nhập EventHub và vào trang Thông báo để chấp nhận hoặc từ chối lời mời: ${notificationsUrl}`,
    ].join('\n');
    const html = `
      <p>Xin chào <strong>${this.escapeHtml(invitedUser.full_name || invitedUser.email)}</strong>,</p>
      <p><strong>${this.escapeHtml(organizerName)}</strong> đã mời bạn làm <strong>${this.escapeHtml(role)}</strong>${locationStr ? ` (<strong>${this.escapeHtml(locationStr)}</strong>)` : ''} cho sự kiện <strong>${this.escapeHtml(event.title)}</strong> <em>${this.escapeHtml(sessionStr)}</em>.</p>
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
      if (roles.length === 0) roles.push('CUSTOMER');
      try {
        await authRepository.removeRole(user.id, 'STAFF');
      } catch (_) {}
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
    if (!plan) {
      return {
        active: false,
        per_event_limit: 0,
        is_unlimited: false,
        assigned_count: 0,
        pending_invitation_count: 0,
        reserved_count: 0,
        remaining_slots: 0,
        plan_name: null,
      };
    }

    const perEventLimit = Number(plan?.max_staff_per_event || plan?.staff_limit || 0);
    const isUnlimited = perEventLimit === 0;
    const [assignedCount, pendingCount] = await Promise.all([
      operationsRepository.countEventStaff(eventId),
      operationsRepository.countPendingInvitations(eventId),
    ]);

    const reservedCount = assignedCount + pendingCount;

    return {
      active: true,
      per_event_limit: perEventLimit,
      is_unlimited: isUnlimited,
      assigned_count: assignedCount,
      pending_invitation_count: pendingCount,
      reserved_count: reservedCount,
      remaining_slots: isUnlimited ? 999999 : Math.max(0, perEventLimit - reservedCount),
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

    if (!quota.is_unlimited && quota.remaining_slots <= 0) {
      const msg = `Đã đạt giới hạn staff của gói hiện tại (${quota.per_event_limit} staff cho mỗi sự kiện).`;
      throw new AppError(
        msg,
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

  async assertStaffScheduleAvailable(staffId, eventId, sessionIds = null) {
    const conflict = await operationsRepository.findStaffScheduleConflict(staffId, eventId, sessionIds);
    if (!conflict) return;

    const conflictStart = this.formatVietnamDateTime(conflict.start_time);
    const conflictEnd = this.formatVietnamDateTime(conflict.end_time || conflict.start_time);
    const sessionDetail = conflict.conflict_session_name && conflict.conflict_session_name !== conflict.event_title
      ? ` (${conflict.conflict_session_name})`
      : '';
    throw new AppError(
      `Nhân sự đã có lịch tại sự kiện "${conflict.event_title}"${sessionDetail} từ ${conflictStart} đến ${conflictEnd}.`,
      409,
      ErrorCodes.STAFF_SCHEDULE_CONFLICT,
      conflict,
    );
  }

  async getOrganizerOverview(userId) {
    const organizer = await this.getOrganizerContext(userId);
    const [plan, events, staffAssignments, invitations] = await Promise.all([
      operationsRepository.findOrganizerCurrentPlan(organizer.id),
      operationsRepository.findOrganizerEvents(organizer.id),
      operationsRepository.listEventStaff(null, organizer.id),
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
      invitations,
    };
  }

  async listStaffCandidates(search = '') {
    return operationsRepository.findStaffUsers(search);
  }

  async resolveGateForEvent(eventId, { gateId, gate } = {}) {
    if (gateId !== undefined) {
      if (!gateId) {
        return { gateId: null, gateName: null };
      }
      const gateRow = await operationsRepository.findEventGateById(eventId, gateId);
      if (!gateRow) {
        throw new AppError(
          'Cổng check-in được chọn không hợp lệ hoặc không thuộc sự kiện này.',
          400,
          ErrorCodes.INVALID_INPUT,
        );
      }
      return { gateId: gateRow.id, gateName: gateRow.name };
    }

    if (gate !== undefined) {
      const trimmed = typeof gate === 'string' ? gate.trim() : '';
      if (!trimmed) {
        return { gateId: null, gateName: null };
      }
      if (typeof operationsRepository.findEventGateByName === 'function') {
        const matched = await operationsRepository.findEventGateByName(eventId, trimmed);
        if (matched) {
          return { gateId: matched.id, gateName: matched.name };
        }
      }
      return { gateId: null, gateName: trimmed };
    }

    return undefined;
  }

  async listEventGates(userId, eventId) {
    const organizer = await this.getOrganizerContext(userId);
    await this.resolveOrganizerEvent(organizer.id, eventId);
    return operationsRepository.listEventGates(eventId);
  }

  async createEventGate(userId, eventId, payload) {
    const organizer = await this.getOrganizerContext(userId);
    const event = await this.resolveOrganizerEvent(organizer.id, eventId);
    this.assertEventStaffManageable(event);

    const existing = await operationsRepository.findEventGateByName(eventId, payload.name);
    if (existing) {
      throw new AppError(
        `Cổng "${existing.name}" đã tồn tại trong sự kiện này.`,
        409,
        ErrorCodes.INVALID_INPUT,
      );
    }

    try {
      return await operationsRepository.createEventGate(eventId, {
        name: payload.name,
        description: payload.description || null,
      });
    } catch (err) {
      if (err?.code === '23505') {
        throw new AppError(
          `Cổng "${payload.name}" đã tồn tại trong sự kiện này.`,
          409,
          ErrorCodes.INVALID_INPUT,
        );
      }
      throw err;
    }
  }

  async updateEventGate(userId, eventId, gateId, payload) {
    const organizer = await this.getOrganizerContext(userId);
    const event = await this.resolveOrganizerEvent(organizer.id, eventId);
    this.assertEventStaffManageable(event);

    const current = await operationsRepository.findEventGateById(eventId, gateId);
    if (!current) {
      throw new AppError('Không tìm thấy cổng check-in trong sự kiện này.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (payload.name !== undefined) {
      const dup = await operationsRepository.findEventGateByName(eventId, payload.name);
      if (dup && dup.id !== gateId) {
        throw new AppError(
          `Cổng "${dup.name}" đã tồn tại trong sự kiện này.`,
          409,
          ErrorCodes.INVALID_INPUT,
        );
      }
    }

    const updated = await operationsRepository.updateEventGate(eventId, gateId, {
      name: payload.name,
      description: payload.description,
      sortOrder: payload.sort_order,
    });
    if (!updated) {
      throw new AppError('Không tìm thấy cổng check-in trong sự kiện này.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return updated;
  }

  async deleteEventGate(userId, eventId, gateId) {
    const organizer = await this.getOrganizerContext(userId);
    const event = await this.resolveOrganizerEvent(organizer.id, eventId);
    this.assertEventStaffManageable(event);

    const deleted = await operationsRepository.deleteEventGate(eventId, gateId);
    if (!deleted) {
      throw new AppError('Không tìm thấy cổng check-in trong sự kiện này.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return { gate_id: gateId, deleted: true };
  }

  async updateOrganizerEventDeviceGate(userId, eventId, deviceId, assignedGateId) {
    const organizer = await this.getOrganizerContext(userId);
    const event = await this.resolveOrganizerEvent(organizer.id, eventId);
    this.assertEventStaffManageable(event);

    const device = await operationsRepository.findEventDevice(eventId, deviceId);
    if (!device) {
      throw new AppError(
        'Không tìm thấy thiết bị IoT được gán cho sự kiện này.',
        404,
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    }

    if (device.status === 'REVOKED') {
      throw new AppError('Thiết bị đã bị thu hồi quyền, không thể phân cổng.', 400, ErrorCodes.INVALID_INPUT);
    }

    const resolvedGate = await this.resolveGateForEvent(eventId, { gateId: assignedGateId });
    const updated = await operationsRepository.updateEventDeviceGate(eventId, deviceId, {
      gateId: resolvedGate?.gateId || null,
      gateName: resolvedGate?.gateName || null,
    });

    return updated;
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

    // Process session selection
    let normalizedSessionIds = null;
    let sessionName = null;
    if (Array.isArray(payload.session_ids) && payload.session_ids.length > 0) {
      normalizedSessionIds = payload.session_ids;
    } else if (payload.session_id) {
      normalizedSessionIds = [payload.session_id];
    }

    if (normalizedSessionIds && normalizedSessionIds.length > 0) {
      const validSessions = await operationsRepository.findEventSessions(payload.event_id, normalizedSessionIds);
      if (validSessions.length !== normalizedSessionIds.length) {
        throw new AppError('Một hoặc nhiều phiên sự kiện đã chọn không hợp lệ hoặc không thuộc sự kiện này.', 400, ErrorCodes.INVALID_INPUT);
      }
      sessionName = validSessions.map((s, idx) => s.session_name || `Phiên ${idx + 1}`).join(', ');
    }

    await this.assertStaffScheduleAvailable(invitedUser.id, payload.event_id, normalizedSessionIds);

    const resolvedGate = await this.resolveGateForEvent(payload.event_id, {
      gateId: payload.gate_id,
      gate: payload.gate,
    });

    const quota = await this.assertStaffQuotaAvailable(organizer.id, payload.event_id);

    const invitationPayload = {
      eventId: payload.event_id,
      organizerId: organizer.id,
      invitedUserId: invitedUser.id,
      email: invitedUser.email,
      staffRole: payload.staff_role,
      gate: resolvedGate !== undefined ? resolvedGate.gateName : payload.gate,
      zone: payload.zone,
      sessionIds: normalizedSessionIds,
      sessionName,
      invitedBy: userId,
    };
    if (resolvedGate?.gateId) {
      invitationPayload.gateId = resolvedGate.gateId;
    }

    const invitation = await operationsRepository.createStaffInvitation(invitationPayload);

    const metaContent = JSON.stringify({
      status: 'PENDING',
      invitation_id: invitation.id,
      organizer_id: organizer.id,
      organization_name: organizer.organization_name || 'Ban tổ chức',
      invited_email: invitedUser.email,
      staff_role: payload.staff_role || 'Staff',
      gate_id: resolvedGate?.gateId || null,
      gate: resolvedGate !== undefined ? resolvedGate.gateName : payload.gate,
      zone: payload.zone || null,
      session_ids: normalizedSessionIds,
      session_name: sessionName,
      invited_by: userId,
      expires_at: invitation.expires_at,
    });

    notificationsService.notifyStaff(invitedUser.id, {
      title: 'Lời mời làm staff',
      content: metaContent,
      type: 'EVENT',
      eventId: payload.event_id,
      metadata: {
        invitation_id: invitation.id,
        event_id: payload.event_id,
        event_title: event.title,
        staff_role: payload.staff_role || 'Staff',
        gate: resolvedGate?.gateName || payload.gate || null,
        zone: payload.zone || null,
        session_name: sessionName,
        action_url: '/staff/notifications',
      },
    }).catch((err) => logger.warn(`[NOTIFY_STAFF_INVITE_FAIL] ${err.message}`));

    const emailSent = await this.sendStaffInvitationEmail({
      email: invitedUser.email,
      event,
      organizer,
      invitedUser,
      invitation,
    });

    if (!emailSent) {
      await operationsRepository.deleteStaffInvitation(invitation.id);
      throw new AppError(
        'Không thể gửi email lời mời lúc này. Vui lòng thử lại.',
        502,
        ErrorCodes.EMAIL_DELIVERY_FAILED,
      );
    }

    return {
      ...invitation,
      event_title: event.title,
      invited_user_name: invitedUser.full_name,
      email_sent: emailSent,
      quota,
    };
  }

  async updateStaffAssignment(userId, { eventId, staffId, staffRole, gateId, gate, zone, sessionId, sessionIds }) {
    const organizer = await this.getOrganizerContext(userId);
    const event = await this.resolveOrganizerEvent(organizer.id, eventId);
    this.assertEventStaffManageable(event);

    const existing = await operationsRepository.findEventStaffAssignment(eventId, staffId);
    if (!existing) {
      throw new AppError('Không tìm thấy phân công nhân sự cho sự kiện này.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    let normalizedSessionIds = undefined;
    if (sessionId !== undefined) {
      normalizedSessionIds = sessionId ? [sessionId] : null;
    } else if (sessionIds !== undefined) {
      normalizedSessionIds = Array.isArray(sessionIds) && sessionIds.length > 0 ? sessionIds : null;
    }

    if (normalizedSessionIds && normalizedSessionIds.length > 0) {
      const validSessions = await operationsRepository.findEventSessions(eventId, normalizedSessionIds);
      if (validSessions.length !== normalizedSessionIds.length) {
        throw new AppError('Một hoặc nhiều phiên sự kiện đã chọn không hợp lệ hoặc không thuộc sự kiện này.', 400, ErrorCodes.INVALID_INPUT);
      }
    }

    const resolvedGate = await this.resolveGateForEvent(eventId, { gateId, gate });

    const updatePayload = {
      staffRole: staffRole !== undefined ? staffRole : existing.staff_role,
      gate: resolvedGate !== undefined ? resolvedGate.gateName : existing.gate,
      zone: zone !== undefined ? zone : existing.zone,
      sessionIds: normalizedSessionIds,
    };
    if (resolvedGate !== undefined) {
      if (resolvedGate.gateId !== null || gateId !== undefined || existing.gate_id) {
        updatePayload.gateId = resolvedGate.gateId;
      }
    } else if (existing.gate_id !== undefined) {
      updatePayload.gateId = existing.gate_id;
    }

    const updated = await operationsRepository.updateStaffAssignment(eventId, staffId, updatePayload);

    notificationsService.notifyStaff(staffId, {
      title: `Cập nhật phân công sự kiện "${event.title}"`,
      content: `Ban tổ chức đã cập nhật phân công của bạn tại sự kiện "${event.title}": Vai trò ${updatePayload.staffRole || 'Staff'}${updatePayload.gate ? ` (Cổng: ${updatePayload.gate})` : ''}${updatePayload.zone ? ` (Khu vực: ${updatePayload.zone})` : ''}.`,
      type: 'EVENT',
      eventId,
      metadata: {
        event_id: eventId,
        action_url: `/staff/events/${eventId}`,
      },
    }).catch((err) => logger.warn(`[NOTIFY_STAFF_UPDATE_ASSIGNMENT_FAIL] ${err.message}`));

    return updated;
  }

  async removeStaff(userId, { eventId, staffId }) {
    const organizer = await this.getOrganizerContext(userId);
    const event = await this.resolveOrganizerEvent(organizer.id, eventId);
    this.assertEventStaffManageable(event);

    const removed = await operationsRepository.removeStaff(eventId, staffId);
    if (!removed) {
      throw new AppError('Không tìm thấy phân công staff cho sự kiện này.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    notificationsService.notifyStaff(staffId, {
      title: `Ngừng phân công sự kiện "${event.title}"`,
      content: `Ban tổ chức đã điều chỉnh nhân sự và kết thúc phân công của bạn tại sự kiện "${event.title}".`,
      type: 'EVENT',
      eventId,
      metadata: {
        event_id: eventId,
        action_url: '/staff/events',
      },
    }).catch((err) => logger.warn(`[NOTIFY_STAFF_REMOVE_FAIL] ${err.message}`));

    return { event_id: eventId, staff_id: staffId, removed: true };
  }

  async deleteStaffInvitation(userId, invitationId) {
    const organizer = await this.getOrganizerContext(userId);
    const invitation = await operationsRepository.findInvitationForOrganizer(invitationId, organizer.id);
    if (!invitation) {
      throw new AppError('Không tìm thấy lời mời nhân sự.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    const event = await this.resolveOrganizerEvent(organizer.id, invitation.event_id);
    this.assertEventStaffManageable(event);

    const deleted = await operationsRepository.deleteStaffInvitation(invitationId);
    if (!deleted) {
      throw new AppError('Không tìm thấy lời mời nhân sự.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return { invitation_id: invitationId, deleted: true };
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
      gateId: invitation.gate_id || null,
      gate: invitation.gate,
      zone: invitation.zone,
      acceptedBy: invitation.invited_by,
    });

    if (result.invalidStatus) {
      throw new AppError('Lời mời này đã được phản hồi trước đó.', 400, ErrorCodes.INVALID_INPUT);
    }

    // Thông báo cho Organizer rằng staff đã đồng ý
    notificationsRepository.getOrganizerUserIdByEventId(invitation.event_id).then((orgUserId) => {
      const targetOrgUserId = invitation.invited_by || orgUserId;
      if (targetOrgUserId) {
        notificationsService.notifyOrganizer(targetOrgUserId, {
          title: 'Nhân sự đã chấp nhận lời mời',
          content: `Nhân viên "${user.full_name || user.email}" đã đồng ý tham gia hỗ trợ sự kiện "${invitation.event_title || 'sự kiện'}" với vai trò ${invitation.staff_role || 'Staff'}.`,
          type: 'EVENT',
          eventId: invitation.event_id,
          metadata: {
            event_id: invitation.event_id,
            staff_id: user.id,
            action_url: '/organizer/staff-management',
          },
        }).catch((err) => logger.warn(`[NOTIFY_ORGANIZER_STAFF_ACCEPT_FAIL] ${err.message}`));
      }
    }).catch((e) => logger.warn(`[GET_ORGANIZER_FAIL] ${e.message}`));

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

    const declineResult = await operationsRepository.declineInvitation(invitationId, user.id);

    // Thông báo cho Organizer rằng staff đã từ chối
    notificationsRepository.getOrganizerUserIdByEventId(invitation.event_id).then((orgUserId) => {
      const targetOrgUserId = invitation.invited_by || orgUserId;
      if (targetOrgUserId) {
        notificationsService.notifyOrganizer(targetOrgUserId, {
          title: 'Nhân sự đã từ chối lời mời',
          content: `Người dùng "${user.full_name || user.email}" đã từ chối lời mời làm staff cho sự kiện "${invitation.event_title || 'sự kiện'}".`,
          type: 'EVENT',
          eventId: invitation.event_id,
          metadata: {
            event_id: invitation.event_id,
            staff_id: user.id,
            action_url: '/organizer/staff-management',
          },
        }).catch((err) => logger.warn(`[NOTIFY_ORGANIZER_STAFF_DECLINE_FAIL] ${err.message}`));
      }
    }).catch((e) => logger.warn(`[GET_ORGANIZER_FAIL] ${e.message}`));

    return declineResult;
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

  async getStaffGateCheckInHistory(staffId, { eventId = null, page, limit = 10, result, source } = {}) {
    if (eventId) {
      const event = await operationsRepository.findStaffAssignedEvent(staffId, eventId);
      if (!event) {
        throw new AppError(
          'Không tìm thấy sự kiện hoặc bạn không được phân công vào sự kiện này.',
          403,
          ErrorCodes.AUTH_FORBIDDEN,
        );
      }
    }

    const params = { eventId, limit };
    if (page !== undefined) params.page = page;
    if (result) params.result = result;
    if (source) params.source = source;
    return operationsRepository.getStaffGateCheckInHistory(staffId, params);
  }
}

module.exports = new OperationsService();
