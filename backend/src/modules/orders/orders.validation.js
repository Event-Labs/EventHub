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
  promo_code: z.string().trim().max(50).optional().nullable(),
  event_terms_accepted: z.boolean().optional().default(false),
  attendees: z
    .array(
      z.object({
        ticket_type_id: z.string().uuid(),
        session_seat_id: z.string().uuid().optional().nullable(),
        name: z.string().trim().min(2).max(255),
        email: z.string().trim().email().max(255),
      }),
    )
    .optional()
    .default([]),
  items: z
    .array(
      z.object({
        ticket_type_id: z.string().uuid(),
        quantity: z.coerce.number().int().min(1),
        session_seat_ids: z.array(z.string().uuid()).optional().default([]),
      }),
    )
    .min(1),
});

const orderIdParamSchema = z.object({
  orderId: z.string().uuid(),
});

const staffDirectPaymentMethods = ['cash', 'bank_transfer'];

const staffDirectBookingSchema = z.object({
  event_id: z.string().uuid(),
  buyer_name: z.string().trim().min(2).max(255),
  buyer_phone: z
    .string()
    .trim()
    .regex(/^(0|\+84)(3|5|7|8|9)[0-9]{8}$/),
  buyer_email: z.string().trim().email().max(255),
  internal_note: z.string().trim().max(1000).optional().nullable(),
  payment_method: z.enum(staffDirectPaymentMethods),
  items: z
    .array(
      z.object({
        ticket_type_id: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(20),
        session_seat_ids: z.array(z.string().uuid()).optional().default([]),
      }),
    )
    .min(1),
});

module.exports = {
  checkoutSchema,
  orderIdParamSchema,
  staffDirectBookingSchema,
};


