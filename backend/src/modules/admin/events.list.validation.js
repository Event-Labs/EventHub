const { z } = require('zod');

// Accepted status filter values for the admin event list.
// 'REJECTED' and 'HIDDEN' are virtual filters (both map to status=HIDDEN in DB,
// distinguished by approval_status — see events.list.repository.js).
const VALID_STATUS_FILTERS = [
  'PENDING_REVIEW',
  'PUBLISHED',
  'REJECTED', // status=HIDDEN AND approval_status=REJECTED
  'HIDDEN',   // status=HIDDEN AND approval_status=APPROVED
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
