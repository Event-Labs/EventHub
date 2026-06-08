const { z } = require('zod');

const userIdSchema = z.object({
  id: z.string().uuid(),
});

const lockUserSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
  duration: z.enum(['1', '3', '7', '30', '90', 'PERMANENT', 'CUSTOM']),
  customDuration: z.string().optional(),
});

const listUsersSchema = z.object({
  search: z.preprocess((val) => (val === '' ? undefined : val), z.string().optional()),
  role: z.preprocess((val) => (val === '' ? undefined : val), z.string().optional()),
  status: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.enum(['ACTIVE', 'LOCKED', 'PENDING']).optional()
  ),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(10),
  sortBy: z.string().optional().default('created_at'),
  sortOrder: z.enum(['ASC', 'DESC']).optional().default('DESC'),
});

module.exports = {
  userIdSchema,
  lockUserSchema,
  listUsersSchema,
};
