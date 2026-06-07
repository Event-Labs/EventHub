const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const { sendEmail } = require('../../infrastructure/email/email.service');
const notificationsRepository = require('./notifications.repository');
const notificationStream = require('./notifications.stream');

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

async function sendEmailSafely({ email, subject, message, html }) {
  try {
    await sendEmail({ email, subject, message, html });
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
        subject: payload.title,
        message: payload.content,
        html: `<p>${payload.content.replace(/\n/g, '<br />')}</p>`,
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
    return notificationsRepository.findOrganizerEvents(organizerId);
  }

  async listAnnouncements(organizerId) {
    return notificationsRepository.listAnnouncements(organizerId);
  }

  async sendAnnouncement(organizerId, payload) {
    const event = await notificationsRepository.findOrganizerEvent(payload.event_id, organizerId);
    if (!event) {
      throw new AppError('Event not found or not owned by organizer', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const channels = new Set(payload.channels);
    const announcement = await notificationsRepository.createAnnouncement({
      eventId: payload.event_id,
      organizerId,
      title: payload.title,
      content: payload.content,
    });

    const attendees = await notificationsRepository.findEventAttendeeContacts(payload.event_id);
    let webSent = 0;
    let emailSent = 0;

    for (const attendee of attendees) {
      if (channels.has('web') && attendee.user_id) {
        await this.createAndDispatch({
          userId: attendee.user_id,
          eventId: payload.event_id,
          title: payload.title,
          content: payload.content,
          type: 'EVENT',
        });
        webSent += 1;
      }

      if (channels.has('email') && attendee.email) {
        const sent = await sendEmailSafely({
          email: attendee.email,
          subject: `[EventHub] ${payload.title}`,
          message: payload.content,
          html: `
            <h2>${payload.title}</h2>
            <p><strong>Sự kiện:</strong> ${event.title}</p>
            <p>${payload.content.replace(/\n/g, '<br />')}</p>
          `,
        });
        if (sent) emailSent += 1;
      }
    }

    return {
      announcement,
      recipients: attendees.length,
      web_sent: webSent,
      email_sent: emailSent,
    };
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
    const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const recipients = await notificationsRepository.findUpcomingReminderRecipients({ from: now, to });
    let sent = 0;

    for (const row of recipients) {
      const content = `Sự kiện "${row.event_title}" sẽ bắt đầu lúc ${formatDateTime(row.start_time)}${venueLine(row) ? ` tại ${venueLine(row)}` : ''}. Hãy kiểm tra vé và chuẩn bị check-in đúng giờ.`;
      await this.createAndDispatch(
        {
          userId: row.user_id,
          eventId: row.event_id,
          title: 'Nhắc lịch sự kiện',
          content,
          type: 'EVENT',
        },
        {
          email: row.email,
        },
      );
      sent += 1;
    }

    if (sent > 0) logger.info(`Sent ${sent} event reminders`);
    return sent;
  }
}

module.exports = new NotificationsService();
