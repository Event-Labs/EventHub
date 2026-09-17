const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const eventsAdminRepository = require('./events.repository');
const notificationsService = require('../notifications/notifications.service');
const REVIEWABLE_STATUSES  = new Set(['PENDING_REVIEW']);
const HIDEABLE_STATUSES    = new Set(['PUBLISHED', 'COMPLETED']);
const UNHIDEABLE_STATUSES  = new Set(['HIDDEN']);

class EventsAdminService {
  async getEventDetail(eventId) {
    const event = await eventsAdminRepository.findByIdForAdmin(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return event;
  }

  async reviewEvent(adminId, eventId, payload) {
    // 1. Fetch event (with organizer contact info for notification)
    const event = await eventsAdminRepository.findByIdForAdmin(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // 2. Guard: only PENDING_REVIEW events can be reviewed
    if (!REVIEWABLE_STATUSES.has(event.status)) {
      throw new AppError(
        `Event cannot be reviewed in its current status: ${event.status}. Only events with status PENDING_REVIEW are reviewable.`,
        400,
        ErrorCodes.EVENT_NOT_REVIEWABLE,
      );
    }

    // 3. Perform the review inside a DB transaction
    const updated = await eventsAdminRepository.reviewEvent({
      eventId,
      reviewedBy: adminId,
      status: payload.status,       // 'APPROVED' | 'REJECTED'
      reviewNote: payload.review_note ?? null,
    });

    if (!updated) {
      throw new AppError(
        'Failed to update event during review',
        500,
        ErrorCodes.INTERNAL_SERVER_ERROR,
      );
    }

    // 4. Notify organizer (fire-and-forget — never fail the HTTP response)
    this._notifyReview({
      organizerUserId: event.organizer_user_id,
      organizerEmail: event.organizer_email,
      eventId,
      eventTitle: event.title,
      status: payload.status,
      reviewNote: payload.review_note,
    }).catch((err) =>
      logger.error(`[ReviewEvent] Failed to send notification for event ${eventId}:`, err),
    );

    return updated;
  }

  async hideEvent(adminId, eventId, payload = {}) {
    // 1. Fetch event
    const event = await eventsAdminRepository.findByIdForAdmin(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // 2. Guard: only PUBLISHED or COMPLETED events can be hidden
    if (!HIDEABLE_STATUSES.has(event.status)) {
      throw new AppError(
        `Event cannot be hidden in its current status: ${event.status}. Only PUBLISHED or COMPLETED events can be hidden.`,
        400,
        ErrorCodes.EVENT_NOT_HIDEABLE,
      );
    }

    // 3. Update event status to HIDDEN
    const updated = await eventsAdminRepository.hideEvent({ eventId });

    if (!updated) {
      throw new AppError(
        'Failed to update event during hide operation',
        500,
        ErrorCodes.INTERNAL_SERVER_ERROR,
      );
    }

    // 4. Notify organizer (fire-and-forget)
    this._notifyHide({
      organizerUserId: event.organizer_user_id,
      organizerEmail: event.organizer_email,
      eventId,
      eventTitle: event.title,
      hideNote: payload.hide_note,
    }).catch((err) =>
      logger.error(`[HideEvent] Failed to send notification for event ${eventId}:`, err),
    );

    return updated;
  }

  async unhideEvent(adminId, eventId) {
    const event = await eventsAdminRepository.findByIdForAdmin(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!UNHIDEABLE_STATUSES.has(event.status)) {
      throw new AppError(
        `Only HIDDEN events can be unhidden. Current status: ${event.status}`,
        400,
        ErrorCodes.EVENT_NOT_HIDEABLE,
      );
    }

    // Rejected events (approval_status=REJECTED) must go through review again
    if (event.approval_status === 'REJECTED') {
      throw new AppError(
        'Rejected events cannot be unhidden. The organizer must resubmit for review.',
        400,
        ErrorCodes.EVENT_NOT_HIDEABLE,
      );
    }

    const updated = await eventsAdminRepository.unhideEvent({ eventId });
    if (!updated) {
      throw new AppError('Failed to unhide event', 500, ErrorCodes.INTERNAL_SERVER_ERROR);
    }

    // Notify organizer (fire-and-forget)
    this._notifyUnhide({
      organizerUserId: event.organizer_user_id,
      organizerEmail: event.organizer_email,
      eventId,
      eventTitle: event.title,
    }).catch((err) =>
      logger.error(`[UnhideEvent] Failed to send notification for event ${eventId}:`, err),
    );

    return updated;
  }

  async _notifyReview({ organizerUserId, organizerEmail, eventId, eventTitle, status, reviewNote }) {
    if (!organizerUserId) return;

    const isApproved = status === 'APPROVED';
    const title = isApproved
      ? `Sự kiện "${eventTitle}" đã được phê duyệt`
      : `Sự kiện "${eventTitle}" bị từ chối`;

    let content = isApproved
      ? `Sự kiện "${eventTitle}" của bạn đã được Admin phê duyệt. Bạn có thể xuất bản sự kiện bất cứ lúc nào từ trang quản lý sự kiện.`
      : `Sự kiện "${eventTitle}" của bạn đã bị Admin từ chối.`;

    if (!isApproved && reviewNote) {
      content += `\n\nLý do: ${reviewNote}`;
    }

    await notificationsService.createAndDispatch(
      {
        userId: organizerUserId,
        eventId,
        title,
        content,
        type: 'EVENT',
      },
      organizerEmail ? { email: organizerEmail } : {},
    );
  }

  async _notifyHide({ organizerUserId, organizerEmail, eventId, eventTitle, hideNote }) {
    if (!organizerUserId) return;

    const title = `Sự kiện "${eventTitle}" đã bị ẩn`;
    let content = `Sự kiện "${eventTitle}" của bạn đã bị Admin ẩn khỏi nền tảng do phát hiện vi phạm hoặc vấn đề cần xem xét.`;
    if (hideNote) {
      content += `\n\nLý do: ${hideNote}`;
    }
    content += '\n\nVui lòng liên hệ hỗ trợ để biết thêm thông tin.';

    await notificationsService.createAndDispatch(
      {
        userId: organizerUserId,
        eventId,
        title,
        content,
        type: 'EVENT',
      },
      organizerEmail ? { email: organizerEmail } : {},
    );
  }

  async _notifyUnhide({ organizerUserId, organizerEmail, eventId, eventTitle }) {
    if (!organizerUserId) return;

    const title = `Sự kiện "${eventTitle}" đã được khôi phục`;
    const content = `Sự kiện "${eventTitle}" của bạn đã được Admin khôi phục và hiện đang hiển thị công khai trên nền tảng.`;

    await notificationsService.createAndDispatch(
      {
        userId: organizerUserId,
        eventId,
        title,
        content,
        type: 'EVENT',
      },
      organizerEmail ? { email: organizerEmail } : {},
    );
  }

  async getAiReview(eventId) {
    const existing = await eventsAdminRepository.getLatestAiReview(eventId);
    return existing;
  }

  async runAiReview(eventId) {
    const event = await eventsAdminRepository.findEventFullDetailForAi(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const warnings = [];

    // 1. Missing mandatory fields check
    if (!event.title || event.title.trim().length < 5) {
      warnings.push('Tiêu đề sự kiện quá ngắn hoặc chưa có (tối thiểu 5 ký tự).');
    }
    if (!event.thumbnail_url) {
      warnings.push('Sự kiện chưa có ảnh đại diện (Thumbnail).');
    }
    if (!event.short_description) {
      warnings.push('Sự kiện chưa có phần mô tả ngắn tóm tắt.');
    }
    if (!event.description || event.description.trim().length < 30) {
      warnings.push('Nội dung mô tả chi tiết sự kiện quá ngắn (dưới 30 ký tự).');
    }
    if (!event.sessions || event.sessions.length === 0) {
      warnings.push('Sự kiện chưa thiết lập phiên diễn ra / lịch trình (Sessions).');
    }
    if (!event.ticket_types || event.ticket_types.length === 0) {
      warnings.push('Sự kiện chưa có hạng vé nào được mở bán.');
    }

    // 2. Logic & Time Consistency check
    if (event.start_time && event.end_time) {
      const start = new Date(event.start_time).getTime();
      const end = new Date(event.end_time).getTime();
      if (end <= start) {
        warnings.push('Thời gian kết thúc sự kiện phải diễn ra sau thời gian bắt đầu.');
      }
      if (start < Date.now() - 24 * 3600 * 1000) {
        warnings.push('Thời gian bắt đầu sự kiện nằm trong quá khứ.');
      }
    }

    (event.ticket_types || []).forEach((t) => {
      if (Number(t.price) < 0) {
        warnings.push(`Hạng vé "${t.name}" có mức giá không hợp lệ (< 0đ).`);
      }
      if (Number(t.quantity) <= 0) {
        warnings.push(`Hạng vé "${t.name}" có số lượng phát hành không hợp lệ (<= 0).`);
      }
    });

    // 3. Policy & Sensitive Content check
    const textContent = `${event.title || ''} ${event.short_description || ''} ${event.description || ''}`.toLowerCase();
    const sensitiveWords = ['lừa đảo', 'cờ bạc', 'bạo lực', 'vũ khí', 'hàng cấm'];
    let hasPolicyViolation = false;
    sensitiveWords.forEach((word) => {
      if (textContent.includes(word)) {
        hasPolicyViolation = true;
        warnings.push(`Phát hiện nội dung có nguy cơ vi phạm chính sách / từ khóa cấm: "${word}".`);
      }
    });

    // Determine recommendation
    let recommendation = 'APPROVE';
    if (hasPolicyViolation) {
      recommendation = 'REJECT';
    } else if (warnings.length > 0) {
      recommendation = 'NEEDS_REVIEW';
    }

    const saved = await eventsAdminRepository.saveAiReview({
      eventId,
      recommendation,
      warnings,
    });

    return saved;
  }
}

module.exports = new EventsAdminService();

