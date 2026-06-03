const { z } = require('zod');

const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

const nullableDate = z
  .union([z.string().trim(), z.literal(''), z.null()])
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), {
    message: 'Invalid date',
  });

const platformFeeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  fee_type: z.enum(['PERCENTAGE', 'FIXED', 'COMBINED']),
  percentage_value: z.coerce.number().min(0).max(100).default(0),
  fixed_amount: z.coerce.number().min(0).default(0),
  event_category_id: z.string().uuid().optional().nullable(),
  is_active: z.coerce.boolean().default(true),
  effective_from: nullableDate,
  effective_to: nullableDate,
});

const updatePlatformFeeSchema = platformFeeSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' },
);

const policyConfigSchema = z.object({
  policy_type: z.enum([
    'REFUND',
    'PAYOUT',
    'EVENT_APPROVAL',
    'SERVICE_FEE',
    'ORGANIZER_REGULATION',
  ]),
  title: z.string().trim().min(2).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  config: z.record(z.string(), z.any()).default({}),
  is_active: z.coerce.boolean().default(true),
  effective_from: nullableDate,
  effective_to: nullableDate,
});

const updatePolicyConfigSchema = policyConfigSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' },
);

const policyDocumentSchema = z.object({
  title: z.string().trim().min(2).max(255),
  description: z.string().trim().max(5000).optional().nullable(),
  file_url: z.string().url(),
  file_name: z.string().trim().max(255).optional().nullable(),
  file_size: z.coerce.number().int().nonnegative().optional().nullable(),
  mime_type: z.string().trim().max(100).default('application/pdf'),
  version: z.string().trim().max(50).default('1.0'),
  is_public: z.coerce.boolean().default(true),
});

const updatePolicyDocumentSchema = policyDocumentSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' },
);

const policyTypeQuerySchema = z.object({
  policy_type: z
    .enum(['REFUND', 'PAYOUT', 'EVENT_APPROVAL', 'SERVICE_FEE', 'ORGANIZER_REGULATION'])
    .optional(),
});

module.exports = {
  policyDocumentSchema,
  policyTypeQuerySchema,
  policyConfigSchema,
  updatePolicyConfigSchema,
  updatePolicyDocumentSchema,
  platformFeeSchema,
  updatePlatformFeeSchema,
  uuidParamSchema,
};
