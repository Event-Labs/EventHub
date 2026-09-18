const { z } = require('zod');

const requestRefundSchema = z
  .object({
    order_id: z.string().uuid().optional().nullable(),
    ticket_id: z.string().uuid().optional().nullable(),
    reason: z.string().trim().min(2, 'Vui lòng cung cấp lý do hoàn vé').max(1000),
    customer_note: z.string().trim().max(1000).optional().nullable(),
    refund_method: z.string().optional().default('MANUAL_BANK_TRANSFER'),
    bank_name: z.string().trim().max(100).optional().nullable(),
    bank_account_number: z.string().trim().max(50).optional().nullable(),
    bank_account_name: z.string().trim().max(255).optional().nullable(),
    bank_info: z
      .object({
        bank_name: z.string().optional().nullable(),
        account_number: z.string().optional().nullable(),
        account_holder: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),
  })
  .refine((data) => Boolean(data.order_id || data.ticket_id), {
    message: 'Vui lòng cung cấp mã đơn hàng (order_id) hoặc mã vé (ticket_id)',
  });

const processRefundSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REFUND', 'CONFIRM_REFUNDED']),
  note: z.string().trim().max(1000).optional().nullable(),
  organizer_note: z.string().trim().max(1000).optional().nullable(),
  reject_reason: z.string().trim().max(1000).optional().nullable(),
  proof_url: z.string().url().optional().nullable().or(z.literal('')),
  transaction_ref: z.string().trim().max(100).optional().nullable(),
});

const refundQuerySchema = z.object({
  status: z.enum(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'REFUNDED']).optional().default('ALL'),
  eventId: z.string().uuid().optional().nullable(),
  keyword: z.string().trim().optional().nullable(),
});

const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

module.exports = {
  requestRefundSchema,
  processRefundSchema,
  refundQuerySchema,
  uuidParamSchema,
};
