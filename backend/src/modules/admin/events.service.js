const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const eventsAdminRepository = require('./events.repository');
const notificationsService = require('../notifications/notifications.service');

// ---------------------------------------------------------------------------
// Allowed status transitions
// ---------------------------------------------------------------------------
const REVIEWABLE_STATUSES = new Set(['PENDING_REVIEW']);
const HIDEABLE_STATUSES   = new Set(['PUBLISHED']);
const UNHIDEABLE_STATUSES = new Set(['HIDDEN']);

class EventsAdminService {
  // -------------------------------------------------------------------------
  // Function 80 — Review Event
  // Admin approves or rejects an event that is in PENDING_REVIEW status.
  //   APPROVED  → status = PUBLISHED,  approval_status = APPROVED
  //   REJECTED  → status = REJECTED,   approval_status = REJECTED
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Function 81 — Hide Event
  // Admin hides a PUBLISHED event due to violations or complaints.
  // This does NOT change approval_status (the event was legitimately approved).
  // -------------------------------------------------------------------------
  async hideEvent(adminId, eventId, payload = {}) {
    // 1. Fetch event
    const event = await eventsAdminRepository.findByIdForAdmin(eventId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // 2. Guard: only PUBLISHED events can be hidden
    if (!HIDEABLE_STATUSES.has(event.status)) {
      throw new AppError(
        `Event cannot be hidden in its current status: ${event.status}. Only PUBLISHED events can be hidden.`,
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

  // -------------------------------------------------------------------------
  // Unhide Event
  // Restore a HIDDEN+APPROVED event back to PUBLISHED.
  // Only works for events hidden after publication — rejected events must
  // be resubmitted by the organizer and reviewed again.
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  async _notifyReview({ organizerUserId, organizerEmail, eventId, eventTitle, status, reviewNote }) {
    if (!organizerUserId) return;

    const isApproved = status === 'APPROVED';
    const title = isApproved
      ? `Sự kiện "${eventTitle}" đã được phê duyệt`
      : `Sự kiện "${eventTitle}" bị từ chối`;

    let content = isApproved
      ? `Sự kiện "${eventTitle}" của bạn đã được Admin phê duyệt và hiện đang hiển thị công khai trên nền tảng.`
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

    await notificationsService.createAndDispatch(
      {
        userId: organizerUserId,
        eventId,
        title: `Sự kiện "${eventTitle}" đã được hiển thị trở lại`,
        content: `Sự kiện "${eventTitle}" của bạn đã được Admin khôi phục và hiện đang hiển thị công khai trên nền tảng.`,
        type: 'EVENT',
      },
      organizerEmail ? { email: organizerEmail } : {},
    );
  }
}

module.exports = new EventsAdminService();
