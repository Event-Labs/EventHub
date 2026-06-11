const { z } = require('zod');

const promoCodeSchema = z.object({
  event_id: z.preprocess((val) => (val === '' ? null : val), z.string().uuid({ message: "Invalid Event ID format" }).optional().nullable()),
  code: z.string().trim().min(3, "Code must be at least 3 characters").max(50, "Code too long"),
  discount_type: z.enum(['PERCENTAGE', 'FIXED'], { errorMap: () => ({ message: "Discount type must be PERCENTAGE or FIXED" }) }),
  discount_value: z.coerce.number({ invalid_type_error: "Discount value must be a number" }).positive("Discount value must be positive"),
  min_order_value: z.coerce.number().min(0).optional().nullable(),
  max_discount: z.coerce.number().positive().optional().nullable(),
  usage_limit: z.preprocess((val) => (val === '' ? null : val), z.coerce.number().int().min(0).optional().nullable()),
  start_time: z.coerce.date({ invalid_type_error: "Invalid start date" }),
  end_time: z.coerce.date({ invalid_type_error: "Invalid end date" }),
  is_active: z.boolean().optional(),
});

const updatePromoCodeSchema = promoCodeSchema.partial();

const listPromosQuerySchema = z.object({
  keyword: z.string().optional(),
  status: z.string().optional(),
});

module.exports = {
  promoCodeSchema,
  updatePromoCodeSchema,
  listPromosQuerySchema,
};
