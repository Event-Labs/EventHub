const { z } = require('zod');

const organizerIdSchema = z.object({
  id: z.string().uuid('Mã organizer không hợp lệ.'),
});

const listOrganizersSchema = z.object({
  search: z.preprocess((val) => (val === '' ? undefined : val), z.string().trim().optional()),
  status: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  ),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  sortBy: z
    .enum(['created_at', 'organization_name', 'status', 'gross_revenue', 'total_events'])
    .optional()
    .default('created_at'),
  sortOrder: z.enum(['ASC', 'DESC']).optional().default('DESC'),
});

const updateOrganizerStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'], {
    errorMap: () => ({ message: 'Trạng thái organizer không hợp lệ.' }),
  }),
});

module.exports = {
  organizerIdSchema,
  listOrganizersSchema,
  updateOrganizerStatusSchema,
};
