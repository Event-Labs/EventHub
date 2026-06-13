const { z } = require('zod');

const eventIdSchema = z.object({
  eventId: z.string().uuid('eventId must be a valid UUID'),
});

/**
 * Function 80 — Review Event
 * status: APPROVED → event becomes PUBLISHED
 * status: REJECTED → event becomes REJECTED
 * review_note: required when rejecting, optional when approving
 */
const reviewEventSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED'], {
      errorMap: () => ({ message: 'status must be either APPROVED or REJECTED' }),
    }),
    review_note: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'REJECTED' && !data.review_note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['review_note'],
        message: 'review_note is required when rejecting an event',
      });
    }
  });

/**
 * Function 81 — Hide Event
 * hide_note: optional reason for hiding
 */
const hideEventSchema = z.object({
  hide_note: z.string().trim().max(2000).optional().nullable(),
});

module.exports = {
  eventIdSchema,
  reviewEventSchema,
  hideEventSchema,
};
