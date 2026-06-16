const { z } = require('zod');

const listOrdersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  eventId: z.string().uuid().optional(),
  // PENDING | PAID | CANCELLED | EXPIRED
  status: z
    .enum(['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'])
    .optional(),
  search: z.string().trim().max(200).optional(),
});

const orderIdParamSchema = z.object({
  orderId: z.string().uuid(),
});

const eventIdParamSchema = z.object({
  eventId: z.string().uuid(),
});

const listAttendeesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sessionId: z.string().uuid().optional(),
  ticketTypeId: z.string().uuid().optional(),
  // VALID | USED | CANCELLED
  status: z.enum(['VALID', 'USED', 'CANCELLED']).optional(),
  search: z.string().trim().max(200).optional(),
});

module.exports = {
  listOrdersSchema,
  orderIdParamSchema,
  eventIdParamSchema,
  listAttendeesSchema,
};
