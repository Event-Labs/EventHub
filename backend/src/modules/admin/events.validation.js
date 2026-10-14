const { z } = require('zod');

const eventIdSchema = z.object({
  eventId: z.string().uuid('eventId must be a valid UUID'),
});

const reviewEventSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED'], {
      errorMap: () => ({ message: 'status must be either APPROVED or REJECTED' }),
    }),
    review_note: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'REJECTED' && !data.review_note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['review_note'],
        message: 'review_note is required when rejecting an event',
      });
    }
  });

const hideEventSchema = z.object({
  hide_note: z.string().trim().max(2000).optional().nullable(),
});

const reviewCriteriaIdSchema = z.object({
  id: z.string().uuid('ID điều khoản không hợp lệ (phải là UUID)'),
});

const createReviewCriteriaSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Mã điều khoản tối thiểu 2 ký tự')
    .max(50, 'Mã điều khoản tối đa 50 ký tự')
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã điều khoản chỉ chứa chữ cái, số, gạch dưới và gạch ngang'),
  title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự').max(255, 'Tiêu đề tối đa 255 ký tự'),
  category: z
    .enum(['LEGAL', 'CONTENT', 'MEDIA', 'TICKETS', 'SCHEDULE', 'REFUND', 'GENERAL'])
    .default('GENERAL'),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO']).default('CRITICAL'),
  rule_content: z.string().trim().min(5, 'Nội dung quy tắc tối thiểu 5 ký tự').max(5000, 'Nội dung quy tắc tối đa 5000 ký tự'),
  is_active: z.boolean().default(true),
  order_index: z.coerce.number().int().default(0),
});

const updateReviewCriteriaSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Mã điều khoản tối thiểu 2 ký tự')
    .max(50, 'Mã điều khoản tối đa 50 ký tự')
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã điều khoản chỉ chứa chữ cái, số, gạch dưới và gạch ngang')
    .optional(),
  title: z.string().trim().min(3, 'Tiêu đề tối thiểu 3 ký tự').max(255, 'Tiêu đề tối đa 255 ký tự').optional(),
  category: z
    .enum(['LEGAL', 'CONTENT', 'MEDIA', 'TICKETS', 'SCHEDULE', 'REFUND', 'GENERAL'])
    .optional(),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO']).optional(),
  rule_content: z.string().trim().min(5, 'Nội dung quy tắc tối thiểu 5 ký tự').max(5000, 'Nội dung quy tắc tối đa 5000 ký tự').optional(),
  is_active: z.boolean().optional(),
  order_index: z.coerce.number().int().optional(),
});

module.exports = {
  eventIdSchema,
  reviewEventSchema,
  hideEventSchema,
  reviewCriteriaIdSchema,
  createReviewCriteriaSchema,
  updateReviewCriteriaSchema,
};

