const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const { sendEmail } = require('../../infrastructure/email/email.service');
const db = require('../../infrastructure/database/db.client');
const notificationsRepository = require('./notifications.repository');
const notificationStream = require('./notifications.stream');
const env = require('../../config/env');
const {
  formatReminderDate,
  formatReminderTime,
  formatVenueAddress,
  buildEventReminderHtml,
  buildEventReminderText,
} = require('./eventReminderEmail.template');
const {
  buildFeedbackInvitationHtml,
  buildFeedbackInvitationText,
} = require('./feedbackInvitationEmail.template');

function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    event_id: row.event_id,
    title: row.title,
    content: row.content,
    type: row.type,
    is_read: Boolean(row.is_read),
    created_at: row.created_at,
    event: row.event_title
      ? {
          title: row.event_title,
          slug: row.event_slug,
        }
      : null,
  };
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

function venueLine(row) {
  return [row.venue_name, row.address_line, row.district, row.city].filter(Boolean).join(', ');
}

async function sendEmailSafely({ email, subject, message, html, attachments }) {
  try {
    await sendEmail({ email, subject, message, html, attachments });
    return true;
  } catch (error) {
    logger.error(`Notification email failed for ${email}:`, error);
    return false;
  }
}

class NotificationsService {
  async list(userId, query) {
    const limit = query.limit;
    const page = query.page;
    const { rows, total } = await notificationsRepository.listByUser(userId, {
      limit,
      offset: (page - 1) * limit,
      unreadOnly: query.unread_only,
      category: query.category,
    });
    const unread = await notificationsRepository.unreadCount(userId);

    return {
      items: rows.map(mapNotification),
      unread_count: unread,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async unreadCount(userId) {
    return { unread_count: await notificationsRepository.unreadCount(userId) };
  }

  async createAndDispatch(payload, options = {}) {
    if (!payload.userId) return null;

    const notification = await notificationsRepository.createNotification(payload);
    const mapped = mapNotification(notification);
    notificationStream.sendToUser(payload.userId, 'notification', mapped);
    notificationStream.sendToUser(payload.userId, 'unread_count', {
      unread_count: await notificationsRepository.unreadCount(payload.userId),
    });

    if (options.email) {
      await sendEmailSafely({
        email: options.email,
        subject: options.subject || payload.title,
        message: options.message || payload.content,
        html: options.html || `<div>${payload.content}</div>`,
      });
    }

    return mapped;
  }

  async markRead(userId, notificationId) {
    const notification = await notificationsRepository.markRead(userId, notificationId);
    if (!notification) {
      throw new AppError('Notification not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    notificationStream.sendToUser(userId, 'unread_count', {
      unread_count: await notificationsRepository.unreadCount(userId),
    });
    return mapNotification(notification);
  }

  async markAllRead(userId) {
    await notificationsRepository.markAllRead(userId);
    notificationStream.sendToUser(userId, 'unread_count', { unread_count: 0 });
    return { unread_count: 0 };
  }

  async listOrganizerEvents(organizerId) {
    const organizer = await this.getActiveOrganizerProfile(organizerId);
    return notificationsRepository.findOrganizerEvents(organizer.id);
  }

  async listAnnouncements(organizerId) {
    const organizer = await this.getActiveOrganizerProfile(organizerId);
    return notificationsRepository.listAnnouncements(organizer.id);
  }

  async getActiveOrganizerProfile(userId) {
    const organizer = await notificationsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return organizer;
  }

  async sendAnnouncement(organizerId, payload) {
    const organizer = await this.getActiveOrganizerProfile(organizerId);
    const event = await notificationsRepository.findOrganizerEvent(payload.event_id, organizer.id);
    if (!event) {
      throw new AppError('Event not found or not owned by organizer', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const channels = new Set(payload.channels);
    const announcement = await notificationsRepository.createAnnouncement({
      eventId: payload.event_id,
      organizerId: organizer.id,
      title: payload.title,
      content: payload.content,
    });

    const attendees = await notificationsRepository.findEventAttendeeContacts(payload.event_id);
    let webSent = 0;
    let emailSent = 0;

    const emailAttachments = (payload.attachments || []).map((att) => ({
      filename: att.filename,
      path: att.path,
      contentType: att.contentType,
    }));

    // If attachments exist, append an attachment list section in the email body
    const attachmentHtml = (payload.attachments && payload.attachments.length > 0)
      ? `<div style="margin-top: 24px; padding: 12px 16px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #1e293b; font-size: 13px;">📎 Tệp đính kèm (${payload.attachments.length}):</p>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px;">
            ${payload.attachments.map((att) => `<li style="margin-bottom: 4px;"><a href="${att.path}" target="_blank" style="color: #0284c7; text-decoration: underline; font-weight: 500;">${att.filename}</a></li>`).join('')}
          </ul>
        </div>`
      : '';

    // If attachments exist, format web notification content with links
    const webContent = (payload.attachments && payload.attachments.length > 0)
      ? `${payload.content}<div style="margin-top: 16px; padding: 10px 14px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);"><p style="margin: 0 0 6px 0; font-weight: bold; font-size: 13px;">📎 Tệp đính kèm (${payload.attachments.length}):</p><ul style="margin: 0; padding-left: 20px; font-size: 13px;">${payload.attachments.map((att) => `<li style="margin-bottom: 4px;"><a href="${att.path}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: underline;">${att.filename}</a></li>`).join('')}</ul></div>`
      : payload.content;

    // Asynchronously dispatch notifications and emails in background batches for immediate performance
    this.dispatchAnnouncementAsync({
      attendees,
      channels,
      payload,
      event,
      webContent,
      attachmentHtml,
      emailAttachments,
    });

    const webCount = channels.has('web') ? attendees.filter((a) => a.user_id).length : 0;
    const emailCount = channels.has('email') ? attendees.filter((a) => a.email).length : 0;

    return {
      announcement,
      recipients: attendees.length,
      web_sent: webCount,
      email_sent: emailCount,
    };
  }

  dispatchAnnouncementAsync({ attendees, channels, payload, event, webContent, attachmentHtml, emailAttachments }) {
    setImmediate(async () => {
      try {
        logger.info(`[Announcement] Starting background dispatch to ${attendees.length} attendees for event "${event.title}" (id: ${payload.event_id})`);

        const BATCH_SIZE = 5;
        let totalWeb = 0;
        let totalEmail = 0;

        for (let i = 0; i < attendees.length; i += BATCH_SIZE) {
          const chunk = attendees.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(
            chunk.map(async (attendee) => {
              if (channels.has('web') && attendee.user_id) {
                try {
                  await this.createAndDispatch({
                    userId: attendee.user_id,
                    eventId: payload.event_id,
                    title: payload.title,
                    content: webContent,
                    type: 'EVENT',
                  });
                  totalWeb += 1;
                } catch (err) {
                  logger.error(`[Announcement] Web dispatch error for user ${attendee.user_id}:`, err);
                }
              }

              if (channels.has('email') && attendee.email) {
                try {
                  const sent = await sendEmailSafely({
                    email: attendee.email,
                    subject: `[EventHub] ${payload.title}`,
                    message: payload.content,
                    html: `
                      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 640px; margin: 0 auto;">
                        <h2 style="color: #0f172a; margin-bottom: 8px;">${payload.title}</h2>
                        <p style="color: #64748b; font-size: 14px; margin-top: 0; margin-bottom: 16px;"><strong>Sự kiện:</strong> ${event.title}</p>
                        <div style="font-size: 14px; color: #334155;">
                          ${payload.content}
                        </div>
                        ${attachmentHtml}
                      </div>
                    `,
                    attachments: emailAttachments.length ? emailAttachments : undefined,
                  });
                  if (sent) totalEmail += 1;
                } catch (err) {
                  logger.error(`[Announcement] Email dispatch error for ${attendee.email}:`, err);
                }
              }
            }),
          );
        }
        logger.info(`[Announcement] Background dispatch finished: ${totalWeb} web, ${totalEmail} email sent`);
      } catch (error) {
        logger.error('[Announcement] Error in background dispatch:', error);
      }
    });
  }

  async sendOrderNotification({ userId, eventId, email, eventTitle, orderCode }) {
    return this.createAndDispatch(
      {
        userId,
        eventId,
        title: 'Thanh toán thành công',
        content: `Đơn hàng ${orderCode} cho sự kiện "${eventTitle}" đã được thanh toán thành công. Vé của bạn đã sẵn sàng trong mục Vé của tôi.`,
        type: 'PAYMENT',
      },
      { email },
    );
  }

  async sendDueReminders() {
    const now = new Date();
    let sentCount = 0;

    // Milestone 1: 2h reminder (Events starting between 30 mins and 2.5 hours from now)
    const from2h = new Date(now.getTime() + 30 * 60 * 1000);
    const to2h = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);
    const recipients2h = await notificationsRepository.findUpcomingReminderRecipients({
      from: from2h,
      to: to2h,
      milestone: '2h',
    });

    for (const row of recipients2h) {
      const isSent = await this.dispatchReminderEmail(row, '2h');
      if (isSent) sentCount += 1;
    }

    // Milestone 2: 24h reminder (Events starting between 2.5 hours and 26 hours from now)
    const from24h = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);
    const to24h = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    const recipients24h = await notificationsRepository.findUpcomingReminderRecipients({
      from: from24h,
      to: to24h,
      milestone: '24h',
    });

    for (const row of recipients24h) {
      const isSent = await this.dispatchReminderEmail(row, '24h');
      if (isSent) sentCount += 1;
    }

    if (sentCount > 0) {
      logger.info(`Sent ${sentCount} event reminders (2h: ${recipients2h.length}, 24h: ${recipients24h.length})`);
    }
    return sentCount;
  }

  async dispatchReminderEmail(row, milestone = '24h') {
    try {
      const is2h = milestone === '2h';
      const clientUrl = String(env.CLIENT_URL || '').replace(/\/$/, '');
      const ticketLink = row.order_code
        ? `${clientUrl}/my-tickets?order=${encodeURIComponent(row.order_code)}`
        : `${clientUrl}/my-tickets`;

      const isOnline = row.event_format === 'ONLINE' || (!row.venue_name && !row.address_line);
      const formattedDate = formatReminderDate(row.start_time);
      const formattedTime = formatReminderTime(row.start_time, row.end_time);

      const emailSubject = is2h
        ? `[EventHub] Nhắc lịch: "${row.event_title}" sắp bắt đầu sau 2 giờ nữa!`
        : `[EventHub] Nhắc lịch: "${row.event_title}" sẽ diễn ra vào ngày mai (${formattedDate})`;

      const notifTitle = is2h
        ? `Nhắc lịch: "${row.event_title}" sắp diễn ra trong 2 giờ tới!`
        : `Nhắc lịch: "${row.event_title}" diễn ra trong 24 giờ tới (${formattedDate})`;

      const notifContent = `Sự kiện "${row.event_title}" sẽ bắt đầu lúc ${formattedTime}, ${formattedDate}${
        isOnline ? ' (Trực tuyến)' : row.venue_name ? ` tại ${row.venue_name}` : ''
      }. Hãy chuẩn bị vé điện tử để check-in đúng giờ.`;

      const html = buildEventReminderHtml({
        attendeeName: row.full_name || 'bạn',
        eventTitle: row.event_title,
        bannerUrl: row.banner_url || row.thumbnail_url,
        startTime: row.start_time,
        endTime: row.end_time,
        venueName: row.venue_name,
        addressLine: row.address_line,
        ward: row.ward,
        district: row.district,
        city: row.city,
        isOnline,
        ticketLink,
        milestone,
      });

      const message = buildEventReminderText({
        attendeeName: row.full_name || 'bạn',
        eventTitle: row.event_title,
        startTime: row.start_time,
        endTime: row.end_time,
        venueName: row.venue_name,
        addressLine: row.address_line,
        ward: row.ward,
        district: row.district,
        city: row.city,
        isOnline,
        ticketLink,
        milestone,
      });

      await this.createAndDispatch(
        {
          userId: row.user_id,
          eventId: row.event_id,
          title: notifTitle,
          content: notifContent,
          type: 'EVENT',
        },
        {
          email: row.email,
          subject: emailSubject,
          message,
          html,
        },
      );
      return true;
    } catch (err) {
      logger.error(`Failed to dispatch reminder to user ${row.user_id} (${row.email}):`, err);
      return false;
    }
  }

  async notifyEventCancellation(eventId, { reason, title } = {}) {
    try {
      const { rows } = await db.query(`SELECT id, title, slug, organizer_id FROM events WHERE id = $1`, [eventId]);
      const event = rows[0];
      if (!event) return;

      const attendees = await notificationsRepository.findEventAttendeeContacts(eventId);
      const notifTitle = `Sự kiện "${event.title}" đã bị hủy`;
      const reasonText = reason ? ` (Lý do: ${reason})` : '';
      const notifContent = `Sự kiện "${event.title}" đã chính thức bị hủy${reasonText}. Hệ thống đã tự động tạo yêu cầu hoàn tiền 100%. Vui lòng vào mục "Vé của tôi" để kiểm tra và cung cấp thông tin tài khoản ngân hàng nhận tiền hoàn.`;

      for (const att of attendees) {
        if (att.user_id) {
          await this.createAndDispatch(
            {
              userId: att.user_id,
              eventId: event.id,
              title: notifTitle,
              content: notifContent,
              type: 'EVENT',
            },
            att.email
              ? {
                  email: att.email,
                  subject: `[EventHub] ${notifTitle}`,
                  html: `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                      <h2 style="color: #dc2626;">Thông báo hủy sự kiện</h2>
                      <p>Kính gửi quý khách <strong>${att.full_name || 'Khách hàng'}</strong>,</p>
                      <p>Sự kiện <strong>"${event.title}"</strong> đã chính thức bị hủy${reasonText}.</p>
                      <p>Hệ thống đã tự động tạo yêu cầu hoàn trả 100% số tiền vé đã thanh toán cho bạn.</p>
                      <p><strong>Hướng dẫn nhận tiền hoàn:</strong></p>
                      <ol>
                        <li>Đăng nhập vào EventHub và truy cập mục <strong>Vé của tôi</strong>.</li>
                        <li>Chọn vé sự kiện và bấm <strong>Cung cấp thông tin nhận tiền</strong> (Số tài khoản & Tên ngân hàng).</li>
                        <li>Ban tổ chức sẽ tiến hành chuyển khoản hoàn tiền cho bạn theo quy định.</li>
                      </ol>
                      <p style="margin-top: 20px; font-size: 13px; color: #666;">Trân trọng,<br>Đội ngũ EventHub</p>
                    </div>
                  `,
                }
              : {},
          ).catch((e) => logger.warn(`[NOTIFY_CANCEL_ERR] ${e.message}`));
        }
      }
    } catch (err) {
      logger.error('[NOTIFY_EVENT_CANCELLATION_ERR]', err);
    }
  }

  async notifyEventChange(eventId, { reason, changeClass } = {}) {
    try {
      const { rows } = await db.query(`SELECT id, title, slug FROM events WHERE id = $1`, [eventId]);
      const event = rows[0];
      if (!event) return;

      const attendees = await notificationsRepository.findEventAttendeeContacts(eventId);
      const notifTitle = `Cập nhật thông tin sự kiện "${event.title}"`;
      const notifContent = `Sự kiện "${event.title}" vừa có cập nhật thông tin quan trọng${reason ? `: ${reason}` : ''}. Quý khách vui lòng kiểm tra lại vé và lịch trình tham dự trong mục "Vé của tôi".`;

      for (const att of attendees) {
        if (att.user_id) {
          await this.createAndDispatch(
            {
              userId: att.user_id,
              eventId: event.id,
              title: notifTitle,
              content: notifContent,
              type: 'EVENT',
            },
            att.email
              ? {
                  email: att.email,
                  subject: `[EventHub] ${notifTitle}`,
                  html: `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                      <h2 style="color: #f59e0b;">Thông báo cập nhật sự kiện</h2>
                      <p>Kính gửi quý khách <strong>${att.full_name || 'Khách hàng'}</strong>,</p>
                      <p>Sự kiện <strong>"${event.title}"</strong> vừa có cập nhật thông tin quan trọng${reason ? `: <em>${reason}</em>` : ''}.</p>
                      <p>Vui lòng đăng nhập vào mục <strong>Vé của tôi</strong> để xem chi tiết thời gian và địa điểm mới nhất.</p>
                      <p style="margin-top: 20px; font-size: 13px; color: #666;">Trân trọng,<br>Đội ngũ EventHub</p>
                    </div>
                  `,
                }
              : {},
          ).catch((e) => logger.warn(`[NOTIFY_CHANGE_ERR] ${e.message}`));
        }
      }
    } catch (err) {
      logger.error('[NOTIFY_EVENT_CHANGE_ERR]', err);
    }
  }

  async sendTwoThirdsFeedbackInvitations() {
    const recipients = await notificationsRepository.findTwoThirdsFeedbackRecipients();
    let sentCount = 0;

    for (const row of recipients) {
      const isSent = await this.dispatchFeedbackInvitation(row);
      if (isSent) sentCount += 1;
    }

    if (sentCount > 0) {
      logger.info(`[NotificationsService] Sent ${sentCount} feedback invitation(s) for events at 2/3 milestone.`);
    }
    return sentCount;
  }

  async dispatchFeedbackInvitation(row) {
    try {
      const clientUrl = String(env.CLIENT_URL || '').replace(/\/$/, '');
      const feedbackLink = `${clientUrl}/feedback?event_id=${encodeURIComponent(row.event_id)}`;
      const isOnline = row.event_format === 'ONLINE' || (!row.venue_name && !row.address_line);

      const emailSubject = `[EventHub] Bạn cảm thấy thế nào về sự kiện "${row.event_title}"? Chia sẻ cảm nhận nhé!`;
      const notifTitle = `Đánh giá sự kiện: "${row.event_title}"`;
      const notifContent = `Sự kiện "${row.event_title}" đã đi qua 2/3 thời gian. Hãy chia sẻ cảm nhận và phản hồi của bạn để ban tổ chức ngày càng hoàn thiện hơn nhé!`;

      const html = buildFeedbackInvitationHtml({
        attendeeName: row.full_name || 'bạn',
        eventTitle: row.event_title,
        bannerUrl: row.banner_url || row.thumbnail_url,
        startTime: row.start_time,
        endTime: row.end_time,
        venueName: row.venue_name,
        addressLine: row.address_line,
        ward: row.ward,
        district: row.district,
        city: row.city,
        isOnline,
        feedbackLink,
      });

      const message = buildFeedbackInvitationText({
        attendeeName: row.full_name || 'bạn',
        eventTitle: row.event_title,
        feedbackLink,
      });

      // 1. Send email safely to customer email
      await sendEmailSafely({
        email: row.email,
        subject: emailSubject,
        message,
        html,
      });

      // 2. Create in-app notification & dispatch via SSE
      await this.createAndDispatch({
        userId: row.user_id,
        eventId: row.event_id,
        title: notifTitle,
        content: notifContent,
        type: 'EVENT',
      });

      return true;
    } catch (error) {
      logger.error(`Failed to dispatch feedback invitation for user ${row.user_id}, event ${row.event_id}:`, error);
      return false;
    }
  }
}

module.exports = new NotificationsService();
