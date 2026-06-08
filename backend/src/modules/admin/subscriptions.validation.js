const { z } = require('zod');

const subscriptionIdSchema = z.object({
  id: z.string().uuid(),
});

const subscriptionPayloadSchema = z.object({
  name: z.string().trim().min(2).max(100),
  price: z.coerce.number().min(0),
  event_limit: z.coerce.number().int().min(0).default(0),
  staff_limit: z.coerce.number().int().min(0).default(0),
  max_active_events: z.coerce.number().int().min(0).default(0),
  max_tickets_per_event: z.coerce.number().int().min(0).default(0),
  max_staff_per_event: z.coerce.number().int().min(0).default(0),
  max_ticket_types_per_event: z.coerce.number().int().min(0).default(0),
  max_promo_codes_per_event: z.coerce.number().int().min(0).default(0),
  promo_code_enabled: z.coerce.boolean().default(false),
  seat_map_enabled: z.coerce.boolean().default(false),
  manual_checkin_enabled: z.coerce.boolean().default(false),
  attendee_export_enabled: z.coerce.boolean().default(false),
  advanced_analytics_enabled: z.coerce.boolean().default(false),
  ai_report_enabled: z.coerce.boolean().default(false),
  custom_branding_enabled: z.coerce.boolean().default(false),
  analytics_enabled: z.coerce.boolean().default(false),
  priority_support: z.coerce.boolean().default(false),
  is_active: z.coerce.boolean().default(true),
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
