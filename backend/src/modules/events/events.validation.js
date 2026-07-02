const { z } = require('zod');

const listEventsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  keyword: z.string().trim().max(120).optional(),
  category_id: z.string().trim().optional(),
  category_slug: z.string().trim().max(150).optional(),
  location: z.string().trim().max(120).optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  min_price: z.coerce.number().min(0).optional(),
  max_price: z.coerce.number().min(0).optional(),
  sort_by: z.enum(['start_time', 'created_at', 'updated_at', 'price']).default('start_time'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

const eventIdentifierSchema = z.object({
  identifier: z.string().trim().min(1),
});

const favoriteEventSchema = z.object({
  eventId: z.string().trim().min(1),
});

const sessionSeatsSchema = z.object({
  sessionId: z.string().uuid(),
});

const sessionSeatsQuerySchema = z.object({
  ticket_type_id: z.string().uuid().optional(),
});

const ticketAvailabilitySchema = z.object({
  event_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        ticket_type_id: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(4),
        session_seat_ids: z.array(z.string().uuid()).optional().default([]),
      }),
    )
    .min(1),
});

const seatHoldSchema = ticketAvailabilitySchema;

const seatHoldReleaseSchema = z.object({
  event_id: z.string().uuid(),
  session_seat_ids: z.array(z.string().uuid()).optional().default([]),
});

module.exports = {
  listEventsSchema,
  eventIdentifierSchema,
  favoriteEventSchema,
  sessionSeatsSchema,
  sessionSeatsQuerySchema,
  seatHoldReleaseSchema,
  seatHoldSchema,
  ticketAvailabilitySchema,
};



