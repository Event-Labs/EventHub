const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const complaintsRepository = require('./complaints.repository');
const notificationsRepository = require('../notifications/notifications.repository');
const db = require('../../infrastructure/database/db.client');

class ComplaintsService {
  async createComplaint(userId, payload) {
    const {
      eventId,
      organizerId,
      ticketId,
      orderId,
      category,
      title,
      description,
      evidenceUrls,
      contactEmail,
      contactPhone,
    } = payload;

    if (!title || !title.trim()) {
      throw new AppError('Tiêu đề khiếu nại không được để trống.', 400, ErrorCodes.VALIDATION_ERROR);
    }

    if (!description || !description.trim()) {
      throw new AppError('Nội dung chi tiết khiếu nại không được để trống.', 400, ErrorCodes.VALIDATION_ERROR);
    }

    if (!category) {
      throw new AppError('Vui lòng chọn danh mục khiếu nại.', 400, ErrorCodes.VALIDATION_ERROR);
    }

    // Auto-resolve event_id and order_id if ticketId is provided
    let finalEventId = eventId;
    let finalOrderId = orderId;
    let finalOrganizerId = organizerId;

    if (ticketId) {
      const ticketRes = await db.query(
        `SELECT t.id, t.order_id, t.event_id, e.organizer_id 
         FROM tickets t 
         LEFT JOIN events e ON e.id = t.event_id 
         WHERE t.id = $1`,
        [ticketId]
      );
      if (ticketRes.rows.length > 0) {
        const tRow = ticketRes.rows[0];
        finalEventId = finalEventId || tRow.event_id;
        finalOrderId = finalOrderId || tRow.order_id;
        finalOrganizerId = finalOrganizerId || tRow.organizer_id;
      }
    } else if (finalEventId && !finalOrganizerId) {
      const evRes = await db.query('SELECT organizer_id FROM events WHERE id = $1', [finalEventId]);
      if (evRes.rows.length > 0) {
        finalOrganizerId = evRes.rows[0].organizer_id;
      }
    }

    const complaint = await complaintsRepository.createComplaint({
      customerId: userId,
      eventId: finalEventId,
      organizerId: finalOrganizerId,
      ticketId,
      orderId: finalOrderId,
      category,
      title: title.trim(),
      description: description.trim(),
      evidenceUrls: Array.isArray(evidenceUrls) ? evidenceUrls : [],
      contactEmail: contactEmail?.trim() || null,
      contactPhone: contactPhone?.trim() || null,
    });

    // Notify customer
    try {
      await notificationsRepository.createNotification({
        userId,
        eventId: finalEventId || null,
        title: 'Khiếu nại của bạn đã được tiếp nhận',
        content: `Hệ thống EventHub đã ghi nhận khiếu nại "${complaint.title}" (Mã: #${complaint.id.slice(0, 8)}). Ban Quản trị sẽ xem xét và phản hồi trong thời gian sớm nhất.`,
        type: 'SYSTEM',
      });
    } catch (notifErr) {
      logger.warn(`[ComplaintsService] Failed to send notification to customer: ${notifErr.message}`);
    }

    return complaint;
  }

  async getMyComplaints(userId) {
    return complaintsRepository.findCustomerComplaints(userId);
  }

  async getAdminComplaints(filters) {
    return complaintsRepository.findComplaints(filters);
  }

  async getComplaintById(id) {
    const complaint = await complaintsRepository.findComplaintById(id);
    if (!complaint) {
      throw new AppError('Không tìm thấy khiếu nại.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return complaint;
  }

  async updateComplaintStatus(id, { status, adminNote, adminUserId }) {
    const validStatuses = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      throw new AppError('Trạng thái khiếu nại không hợp lệ.', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const existing = await complaintsRepository.findComplaintById(id);
    if (!existing) {
      throw new AppError('Không tìm thấy khiếu nại.', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const updated = await complaintsRepository.updateComplaintStatus(id, {
      status,
      adminNote: adminNote?.trim() || null,
      resolvedById: adminUserId,
    });

    // Notify customer if resolved or rejected
    if (['RESOLVED', 'REJECTED'].includes(status) && existing.customer_id) {
      const statusLabel = status === 'RESOLVED' ? 'Đã được giải quyết' : 'Đã được xử lý / Bác bỏ';
      try {
        await notificationsRepository.createNotification({
          userId: existing.customer_id,
          eventId: existing.event_id || null,
          title: `Khiếu nại #${existing.id.slice(0, 8)}: ${statusLabel}`,
          content: `Ban Quản trị EventHub đã phản hồi khiếu nại "${existing.title}": ${adminNote ? `"${adminNote}"` : 'Trạng thái khiếu nại đã được cập nhật.'}`,
          type: 'SYSTEM',
        });
      } catch (notifErr) {
        logger.warn(`[ComplaintsService] Failed to send resolution notification: ${notifErr.message}`);
      }
    }

    return updated;
  }

  async getComplaintStats() {
    return complaintsRepository.getComplaintStats();
  }
}

module.exports = new ComplaintsService();

