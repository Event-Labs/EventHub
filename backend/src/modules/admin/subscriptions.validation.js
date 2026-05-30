const { z } = require('zod');

const subscriptionIdSchema = z.object({
  id: z.string().uuid(),
});

const subscriptionPayloadSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  price: z.coerce.number().min(0),
  duration_days: z.coerce.number().int().min(1).max(3650).default(30),
  event_limit: z.coerce.number().int().min(0).default(0),
  staff_limit: z.coerce.number().int().min(0).default(0),
  analytics_enabled: z.coerce.boolean().default(false),
  priority_support: z.coerce.boolean().default(false),
  is_active: z.coerce.boolean().default(true),
  features: z.array(z.string().trim().min(1).max(150)).default([]),
});

const updateSubscriptionSchema = subscriptionPayloadSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' },
);

module.exports = {
  subscriptionIdSchema,
  subscriptionPayloadSchema,
  updateSubscriptionSchema,
};
