const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const feedbacksRepository = require('./feedbacks.repository');

function mapFeedback(row) {
  if (!row) return null;

  return {
    id: row.id,
    event_id: row.event_id,
    user_id: row.user_id,
    rating: row.rating,
    content: row.content,
    created_at: row.created_at,
    user: {
      full_name: row.user_full_name,
      email: row.user_email,
    },
  };
}

function mapEligibleEvent(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    end_time: row.end_time,
    thumbnail_url: row.thumbnail_url,
  };
}

function mapOrganizerEvent(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    end_time: row.end_time,
    status: row.status,
    feedback_count: row.feedback_count,
    average_rating: row.average_rating ? Number(row.average_rating) : null,
  };
}

class FeedbacksService {
  async getActiveOrganizerProfile(userId) {
    const organizer = await feedbacksRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return organizer;
  }

  async assertOrganizerOwnsEvent(organizerId, eventId) {
    const event = await feedbacksRepository.findEventById(eventId);
    if (!event || event.deleted_at) {
      throw new AppError('Event not found', 404, ErrorCodes.FEEDBACK_EVENT_NOT_FOUND);
    }
    if (event.organizer_id !== organizerId) {
      throw new AppError(
        'You do not have permission to view feedback for this event',
        403,
        ErrorCodes.AUTH_FORBIDDEN,
      );
    }
    return event;
  }

  async getEligibleEvents(userId) {
    const rows = await feedbacksRepository.findEligibleEventsForUser(userId);
    return rows.map(mapEligibleEvent);
  }

  async submitFeedback(userId, payload) {
    const event = await feedbacksRepository.findEventById(payload.event_id);
    if (!event || event.deleted_at) {
      throw new AppError('Event not found', 404, ErrorCodes.FEEDBACK_EVENT_NOT_FOUND);
    }

    if (new Date(event.end_time) > new Date()) {
      throw new AppError(
        'You can only submit feedback after the event has ended',
        400,
        ErrorCodes.FEEDBACK_NOT_ELIGIBLE,
      );
    }

    const hasTicket = await feedbacksRepository.userHasTicketForEvent(userId, payload.event_id);
    if (!hasTicket) {
      throw new AppError(
        'You must have attended this event (valid ticket) to submit feedback',
        403,
        ErrorCodes.FEEDBACK_NOT_ELIGIBLE,
      );
    }

    const existing = await feedbacksRepository.findByUserAndEvent(userId, payload.event_id);
    if (existing) {
      throw new AppError(
        'You have already submitted feedback for this event',
        400,
        ErrorCodes.FEEDBACK_ALREADY_EXISTS,
      );
    }

    try {
      const row = await feedbacksRepository.create({
        userId,
        eventId: payload.event_id,
        rating: payload.rating,
        content: payload.content,
      });
      return mapFeedback(row);
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError(
          'You have already submitted feedback for this event',
          400,
          ErrorCodes.FEEDBACK_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }

  async getOrganizerEvents(organizerId) {
    const organizer = await this.getActiveOrganizerProfile(organizerId);
    const rows = await feedbacksRepository.findOrganizerEvents(organizer.id);
    return rows.map(mapOrganizerEvent);
  }

  async getEventFeedbackReport(organizerId, eventId) {
    const organizer = await this.getActiveOrganizerProfile(organizerId);
    const event = await this.assertOrganizerOwnsEvent(organizer.id, eventId);
    const summary = await feedbacksRepository.getReportSummary(eventId);
    const feedbacks = await feedbacksRepository.findByEventForOrganizer(eventId);

    const total = summary?.total_feedbacks || 0;
    const averageRating = summary?.average_rating ? Number(summary.average_rating) : null;

    return {
      event: {
        id: event.id,
        title: event.title,
        slug: event.slug,
        end_time: event.end_time,
        status: event.status,
      },
      summary: {
        total_feedbacks: total,
        average_rating: averageRating,
        satisfaction_percent:
          total > 0
            ? Math.round(
                (((summary.rating_4 || 0) + (summary.rating_5 || 0)) / total) * 100,
              )
            : null,
        distribution: {
          5: summary?.rating_5 || 0,
          4: summary?.rating_4 || 0,
          3: summary?.rating_3 || 0,
          2: summary?.rating_2 || 0,
          1: summary?.rating_1 || 0,
        },
      },
      feedbacks: feedbacks.map(mapFeedback),
    };
  }
}

module.exports = new FeedbacksService();
