const { z } = require('zod');

const VALID_STATUS_FILTERS = [
  'PENDING_REVIEW',
  'CANCEL_REQUESTS',
  'CANCELLATION_REQUESTS',
  'PUBLISHED',
  'REJECTED',
  'HIDDEN',
  'SUSPENDED',
  'SUSPENDED_BY_ADMIN',
  'DRAFT',
  'CANCELLED',
  'COMPLETED',
];

const listEventsAdminSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => VALID_STATUS_FILTERS.includes(v), {
      message: `status must be one of: ${VALID_STATUS_FILTERS.join(', ')}`,
    })
    .optional(),
});

module.exports = { listEventsAdminSchema };
