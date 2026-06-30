const { z } = require('zod');

const requestIdSchema = z.object({
  id: z.string().uuid(),
});

const verifyOrganizerBusinessEmailSchema = z.object({
  token: z.string().trim().min(20),
});

const submitOrganizerRequestSchema = z.object({
  request_type: z.enum(['INDIVIDUAL', 'ORGANIZATION']).default('INDIVIDUAL'),
  organization_name: z.string().trim().min(2).max(255),
  organization_description: z.string().trim().min(10).max(5000),
  business_email: z
    .string()
    .trim()
    .email()
    .max(255)
    .optional()
    .or(z.literal('')),
  business_phone: z
    .string()
    .trim()
    .regex(/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/, 'Invalid Vietnamese phone number'),
  organization_avatar_url: z
    .string()
    .trim()
    .url()
    .max(2000)
    .optional()
    .or(z.literal('')),
  tax_code: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{13})$/, 'Invalid Vietnamese tax code')
    .optional()
    .or(z.literal('')),
}).superRefine((data, ctx) => {
  if (data.request_type !== 'ORGANIZATION') return;

  if (!data.business_email?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Business email is required for organization requests',
      path: ['business_email'],
    });
  }

  if (!data.organization_avatar_url?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Organization avatar is required for organization requests',
      path: ['organization_avatar_url'],
    });
  }

  if (!data.tax_code?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Tax code is required for organization requests',
      path: ['tax_code'],
    });
  }
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
  verifyOrganizerBusinessEmailSchema,
  submitOrganizerRequestSchema,
  listOrganizerRequestsSchema,
  reviewOrganizerRequestSchema,
};
