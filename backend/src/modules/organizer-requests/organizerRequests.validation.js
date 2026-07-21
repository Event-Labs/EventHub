const { z } = require('zod');

const requestIdSchema = z.object({
  id: z.string().uuid(),
});

const verifyOrganizerBusinessEmailSchema = z.object({
  token: z.string().trim().min(20),
});

const optionalUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .optional()
  .or(z.literal(''));

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
  organization_avatar_url: optionalUrlSchema,
  tax_code: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{13})$/, 'Invalid Vietnamese tax code')
    .optional()
    .or(z.literal('')),
  legal_document_url: optionalUrlSchema,
  business_license_url: optionalUrlSchema,
  legal_representative_name: z.string().trim().max(255).optional().or(z.literal('')),
  legal_representative_position: z.string().trim().max(255).optional().or(z.literal('')),
  legal_representative_id_url: optionalUrlSchema,
  authorization_letter_url: optionalUrlSchema,
  individual_full_name: z.string().trim().max(255).optional().or(z.literal('')),
  individual_identity_number: z
    .string()
    .trim()
    .regex(/^(\d{9}|\d{12}|[A-Z0-9]{6,20})$/, 'Invalid identity document number')
    .optional()
    .or(z.literal('')),
  individual_id_front_url: optionalUrlSchema,
  individual_id_back_url: optionalUrlSchema,
  individual_selfie_url: optionalUrlSchema,
  individual_tax_code: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{13})$/, 'Invalid personal tax code')
    .optional()
    .or(z.literal('')),
  terms_accepted: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (!data.terms_accepted) {
    ctx.addIssue({
      code: 'custom',
      message: 'Organizer terms must be accepted',
      path: ['terms_accepted'],
    });
  }

  if (!data.organization_avatar_url?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Organizer avatar is required',
      path: ['organization_avatar_url'],
    });
  }

  if (data.request_type === 'INDIVIDUAL') {
    if (!data.individual_full_name?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Legal full name is required for individual requests',
        path: ['individual_full_name'],
      });
    } else if (data.individual_full_name.trim() !== data.individual_full_name.trim().toLocaleUpperCase('vi-VN')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Legal full name must be uppercase and match the identity document',
        path: ['individual_full_name'],
      });
    }

    [
      ['individual_identity_number', 'Identity document number is required for individual requests'],
      ['individual_id_front_url', 'Identity document front image is required for individual requests'],
      ['individual_id_back_url', 'Identity document back image is required for individual requests'],
      ['individual_selfie_url', 'Selfie image is required for individual requests'],
      ['individual_tax_code', 'Personal tax code is required for individual requests'],
    ].forEach(([field, message]) => {
      if (!data[field]?.trim()) {
        ctx.addIssue({ code: 'custom', message, path: [field] });
      }
    });

    return;
  }

  if (!data.business_email?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Business email is required for organization requests',
      path: ['business_email'],
    });
  }

  if (!data.tax_code?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Tax code is required for organization requests',
      path: ['tax_code'],
    });
  }

  [
    ['legal_document_url', 'Business registration certificate is required for organization requests'],
    ['legal_representative_name', 'Legal representative name is required for organization requests'],
    ['legal_representative_position', 'Legal representative position is required for organization requests'],
    ['legal_representative_id_url', 'Legal representative identity document is required for organization requests'],
  ].forEach(([field, message]) => {
    if (!data[field]?.trim()) {
      ctx.addIssue({ code: 'custom', message, path: [field] });
    }
  });
});

const organizerProfileUpdateSchema = z.object({
  request_type: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
  tax_code: z.string().trim().max(30).optional().or(z.literal('')),
  legal_document_url: optionalUrlSchema,
  business_license_url: optionalUrlSchema,
  legal_representative_name: z.string().trim().max(255).optional().or(z.literal('')),
  legal_representative_position: z.string().trim().max(255).optional().or(z.literal('')),
  legal_representative_id_url: optionalUrlSchema,
  authorization_letter_url: optionalUrlSchema,
  individual_full_name: z.string().trim().max(255).optional().or(z.literal('')),
  individual_identity_number: z.string().trim().max(50).optional().or(z.literal('')),
  individual_id_front_url: optionalUrlSchema,
  individual_id_back_url: optionalUrlSchema,
  individual_selfie_url: optionalUrlSchema,
  individual_tax_code: z.string().trim().max(30).optional().or(z.literal('')),
});

const listOrganizerRequestsSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  request_type: z.enum(['INDIVIDUAL', 'ORGANIZATION']).optional(),
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
  organizerProfileUpdateSchema,
  listOrganizerRequestsSchema,
  reviewOrganizerRequestSchema,
};
