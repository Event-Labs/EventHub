const { z } = require('zod');

const uuidSchema = z.string().uuid();

const inviteStaffSchema = z.object({
  event_id: uuidSchema,
  email: z.string().trim().email().max(255),
  staff_role: z.string().trim().min(2).max(50).optional().nullable(),
  gate: z.string().trim().max(100).optional().nullable(),
  zone: z.string().trim().max(100).optional().nullable(),
});

const updateStaffAssignmentSchema = z.object({
  staff_role: z.string().trim().min(2).max(50).optional().nullable(),
  gate: z.string().trim().max(100).optional().nullable(),
  zone: z.string().trim().max(100).optional().nullable(),
});

const invitationIdParamSchema = z.object({
  invitationId: uuidSchema,
});

const removeStaffSchema = z.object({
  eventId: uuidSchema,
  staffId: uuidSchema,
});

const eventIdQuerySchema = z.object({
  event_id: uuidSchema.optional(),
});

module.exports = {
  inviteStaffSchema,
  updateStaffAssignmentSchema,
  invitationIdParamSchema,
  removeStaffSchema,
  eventIdQuerySchema,
};
