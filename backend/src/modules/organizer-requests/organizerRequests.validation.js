const { z } = require('zod');

const requestIdSchema = z.object({
  id: z.string().uuid(),
});

const submitOrganizerRequestSchema = z.object({
  organization_name: z.string().trim().min(2).max(255),
  organization_description: z.string().trim().min(10).max(5000),
  business_email: z.string().trim().email().max(255),
  business_phone: z
    .string()
    .trim()
    .regex(/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/, 'Invalid Vietnamese phone number'),
});

const listOrganizerRequestsSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

const reviewOrganizerRequestSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    review_note: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'REJECTED' && !data.review_note?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Review note is required when rejecting a request',
        path: ['review_note'],
      });
    }
  });

module.exports = {
  requestIdSchema,
  submitOrganizerRequestSchema,
  listOrganizerRequestsSchema,
  reviewOrganizerRequestSchema,
};
