const { z } = require('zod');

const ALLOWED_REFUND_REASONS = [
  'Trùng lịch cá nhân',
  'Sự kiện thay đổi thông tin',
  'Mua nhầm vé',
  'Lý do sức khỏe',
  'Khác',
];

const ALLOWED_REJECT_REASONS = [
  'Không đúng chính sách',
  'Vé đã qua sử dụng',
  'Lý do không hợp lý',
  'Khác',
];

const requestRefundSchema = z
  .object({
    order_id: z.string().uuid().optional().nullable(),
    ticket_id: z.string().uuid().optional().nullable(),
    reason: z
      .string()
      .trim()
      .min(1, 'Vui lòng chọn lý do hoàn tiền')
      .refine((val) => ALLOWED_REFUND_REASONS.includes(val), {
        message: `Lý do hoàn tiền không hợp lệ. Vui lòng chọn một trong: ${ALLOWED_REFUND_REASONS.join(', ')}`,
      }),
    customer_note: z.string().trim().max(500, 'Ghi chú không được vượt quá 500 ký tự').optional().nullable(),
    refund_method: z.string().optional().default('PAYOS'),
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
  })
  .refine(
    (data) => {
      if (data.reason === 'Khác') {
        return Boolean(data.customer_note && data.customer_note.trim().length > 0);
      }
      return true;
    },
    {
      message: 'Vui lòng nhập lý do cụ thể khi chọn "Khác".',
      path: ['customer_note'],
    },
  );

const processRefundSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT', 'REFUND', 'CONFIRM_REFUNDED'], {
      message: 'Hành động không hợp lệ (APPROVE, REJECT, REFUND)',
    }),
    refund_method: z.enum(['PAYOS', 'MANUAL_BANK_TRANSFER']).optional().default('PAYOS'),
    final_refund_amount: z.number().positive().optional().nullable(),
    reject_reason: z.string().trim().max(500).optional().nullable(),
    organizer_note: z.string().trim().max(500).optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
    proof_url: z.string().url().optional().nullable().or(z.literal('')),
    transaction_ref: z.string().trim().max(100).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.action === 'REJECT') {
        const reason = data.reject_reason || data.note;
        return Boolean(reason && reason.trim().length > 0);
      }
      return true;
    },
    {
      message: 'Vui lòng chọn lý do từ chối yêu cầu hoàn tiền.',
      path: ['reject_reason'],
    },
  )
  .refine(
    (data) => {
      if (data.action === 'REJECT' && data.reject_reason === 'Khác') {
        const note = data.organizer_note || data.note;
        return Boolean(note && note.trim().length > 0);
      }
      return true;
    },
    {
      message: 'Vui lòng nhập ghi chú khi chọn lý do từ chối là "Khác".',
      path: ['organizer_note'],
    },
  );

const refundQuerySchema = z.object({
  status: z
    .enum(['ALL', 'PENDING', 'APPROVED', 'PROCESSING', 'REJECTED', 'REFUNDED', 'FAILED'])
    .optional()
    .default('ALL'),
  eventId: z.string().uuid().optional().nullable(),
  keyword: z.string().trim().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

module.exports = {
  ALLOWED_REFUND_REASONS,
  ALLOWED_REJECT_REASONS,
  requestRefundSchema,
  processRefundSchema,
  refundQuerySchema,
  uuidParamSchema,
};
