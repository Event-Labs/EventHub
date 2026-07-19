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
  event_id: z.string().uuid(),
  title: z.string().trim().min(3).max(255),
  content: z.string().trim().min(5).max(5000),
  channels: z
    .array(z.enum(['web', 'email']))
    .min(1)
    .default(['web', 'email']),
});

module.exports = {
  listNotificationsSchema,
  notificationIdSchema,
  createAnnouncementSchema,
};
