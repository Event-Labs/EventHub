const { z } = require('zod');

const eventIdSchema = z.object({
  eventId: z.string().uuid('eventId must be a valid UUID'),
});

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

const hideEventSchema = z.object({
  hide_note: z.string().trim().max(2000).optional().nullable(),
});

module.exports = {
  eventIdSchema,
  reviewEventSchema,
  hideEventSchema,
};
