const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const complaintsRepository = require('./complaints.repository');
const notificationsRepository = require('../notifications/notifications.repository');
const db = require('../../infrastructure/database/db.client');
const { sendEmail } = require('../../infrastructure/email/email.service');

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

    let finalContactEmail = contactEmail?.trim() || null;
    let finalContactPhone = contactPhone?.trim() || null;
    if (!finalContactEmail && userId) {
      const uRes = await db.query('SELECT email, phone FROM users WHERE id = $1', [userId]);
      if (uRes.rows.length > 0) {
        finalContactEmail = uRes.rows[0].email;
        finalContactPhone = finalContactPhone || uRes.rows[0].phone;
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
      contactEmail: finalContactEmail,
      contactPhone: finalContactPhone,
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

      // Send email to customer
      const targetEmail = existing.contact_email || existing.customer_email;
      if (targetEmail) {
        try {
          const emailSubject = `[EventHub] Phản hồi khiếu nại #${existing.id.slice(0, 8)}: ${statusLabel}`;
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #0f172a; margin-top: 0; padding-bottom: 12px; border-bottom: 2px solid #C99A47;">
                Phản hồi khiếu nại từ Ban Quản trị EventHub
              </h2>
              <p style="color: #334155; font-size: 15px;">Xin chào <strong>${existing.customer_name || 'Quý khách'}</strong>,</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                Ban Quản trị EventHub đã xem xét và phản hồi về khiếu nại của bạn:
              </p>
              <div style="background-color: #f8fafc; border-left: 4px solid #C99A47; border-radius: 4px; padding: 14px 18px; margin: 18px 0;">
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e293b;"><strong>Mã khiếu nại:</strong> #${existing.id.slice(0, 8)}</p>
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e293b;"><strong>Tiêu đề:</strong> ${existing.title}</p>
                <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e293b;"><strong>Trạng thái:</strong> <span style="color: ${status === 'RESOLVED' ? '#10b981' : '#ef4444'}; font-weight: bold;">${statusLabel}</span></p>
                ${existing.event_title ? `<p style="margin: 0; font-size: 14px; color: #1e293b;"><strong>Sự kiện:</strong> ${existing.event_title}</p>` : ''}
              </div>
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px 20px; margin: 18px 0;">
                <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px;">Nội dung phản hồi từ Admin:</h4>
                <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-line;">${adminNote || 'Khiếu nại của bạn đã được tiếp nhận và xử lý theo quy định.'}</p>
              </div>
              <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 14px;">
                Cảm ơn bạn đã phản ánh thông tin giúp cộng đồng EventHub ngày một hoàn thiện hơn.<br/>
                Nếu có thêm thắc mắc, bạn có thể xem chi tiết tại mục <em>Khiếu nại & Phản ánh</em> trên hệ thống.
              </p>
            </div>
          `;
          await sendEmail({
            email: targetEmail,
            subject: emailSubject,
            message: `Phản hồi khiếu nại #${existing.id.slice(0, 8)}: ${statusLabel}\n\nNội dung phản hồi: ${adminNote || 'Đã xử lý'}`,
            html: emailHtml,
          });
          logger.info(`[ComplaintsService] Sent resolution email to ${targetEmail} for complaint #${existing.id}`);
        } catch (mailErr) {
          logger.warn(`[ComplaintsService] Failed to send complaint resolution email: ${mailErr.message}`);
        }
      }
    }

    return updated;
  }

  async getComplaintStats() {
    return complaintsRepository.getComplaintStats();
  }
}

module.exports = new ComplaintsService();

