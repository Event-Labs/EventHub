const { z } = require('zod');

const checkoutSchema = z.object({
  event_id: z.string().uuid(),
  buyer_name: z.string().trim().min(2).max(255),
  buyer_email: z.string().trim().email().max(255),
  buyer_phone: z
    .string()
    .trim()
    .regex(/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/)
    .optional()
    .nullable(),
  items: z
    .array(
      z.object({
        ticket_type_id: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(10),
        session_seat_ids: z.array(z.string().uuid()).optional(),
        attendee_name: z.string().trim().min(2).max(255),
        attendee_email: z.string().trim().email().max(255),
      }),
    )
    .min(1),
});

module.exports = {
  checkoutSchema,
};
