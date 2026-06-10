const { z } = require('zod');

const categoryIdSchema = z.object({
  id: z.string().uuid(),
});

const createEventCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  is_active: z.coerce.boolean().default(true),
});

const updateEventCategorySchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  slug: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  is_active: z.coerce.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

module.exports = {
  categoryIdSchema,
  createEventCategorySchema,
  updateEventCategorySchema,
};
