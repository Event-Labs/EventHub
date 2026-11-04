const { z } = require('zod');

const booleanQuerySchema = z.preprocess(
  (value) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false || value === undefined) return false;
    return value;
  },
  z.boolean(),
);

const listNotificationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread_only: booleanQuerySchema.default(false),
  category: z.enum(['all', 'invitation']).default('all'),
});

const notificationIdSchema = z.object({
  notificationId: z.string().uuid(),
});

const createAnnouncementSchema = z.object({
  event_id: z.string().min(1, 'Vui lòng chọn sự kiện'),
  title: z.string().trim().min(3, 'Tiêu đề phải có ít nhất 3 ký tự').max(255, 'Tiêu đề không quá 255 ký tự'),
  content: z.string().min(5, 'Nội dung thông báo phải có ít nhất 5 ký tự'),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        path: z.string(),
        contentType: z.string().optional(),
        size: z.number().optional(),
      })
    )
    .optional()
    .default([]),
  channels: z
    .array(z.enum(['web', 'email']))
    .min(1, 'Vui lòng chọn ít nhất một kênh gửi (Website hoặc Email)')
    .default(['web', 'email']),
});

module.exports = {
  listNotificationsSchema,
  notificationIdSchema,
  createAnnouncementSchema,
};
