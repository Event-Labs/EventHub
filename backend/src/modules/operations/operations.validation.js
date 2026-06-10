const { z } = require('zod');

const uuidSchema = z.string().uuid();

const inviteStaffSchema = z.object({
  event_id: uuidSchema,
  email: z.string().trim().email().max(255),
  staff_role: z.string().trim().min(2).max(50).optional().nullable(),
});

const invitationIdParamSchema = z.object({
  invitationId: uuidSchema,
});

const removeStaffSchema = z.object({
  eventId: uuidSchema,
  staffId: uuidSchema,
});

const createTaskSchema = z.object({
  event_id: uuidSchema,
  staff_id: uuidSchema,
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(2000).optional().nullable(),
});

const eventIdQuerySchema = z.object({
  event_id: uuidSchema.optional(),
});

module.exports = {
  inviteStaffSchema,
  invitationIdParamSchema,
  removeStaffSchema,
  createTaskSchema,
  eventIdQuerySchema,
};
