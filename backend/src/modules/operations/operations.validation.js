const { z } = require('zod');

const uuidSchema = z.string().uuid();

const inviteStaffSchema = z.object({
  event_id: uuidSchema,
  email: z.string().trim().email().max(255),
  staff_role: z.string().trim().min(2).max(50).optional().nullable(),
  gate_id: uuidSchema.optional().nullable(),
  gate: z.string().trim().max(100).optional().nullable(),
  zone: z.string().trim().max(100).optional().nullable(),
  session_id: uuidSchema.optional().nullable(),
  session_ids: z.array(uuidSchema).optional().nullable(),
});

const updateStaffAssignmentSchema = z.object({
  staff_role: z.string().trim().min(2).max(50).optional().nullable(),
  gate_id: uuidSchema.optional().nullable(),
  gate: z.string().trim().max(100).optional().nullable(),
  zone: z.string().trim().max(100).optional().nullable(),
  session_id: uuidSchema.optional().nullable(),
  session_ids: z.array(uuidSchema).optional().nullable(),
});

const invitationIdParamSchema = z.object({
  invitationId: uuidSchema,
});

const removeStaffSchema = z.object({
  eventId: uuidSchema,
  staffId: uuidSchema,
});

const eventIdParamSchema = z.object({
  eventId: uuidSchema,
});

const eventGateParamSchema = z.object({
  eventId: uuidSchema,
  gateId: uuidSchema,
});

const createEventGateSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên cổng').max(100),
  description: z.string().trim().max(255).optional().nullable(),
});

const updateEventGateSchema = z.object({
  name: z.string().trim().min(1, 'Tên cổng không được để trống').max(100).optional(),
  description: z.string().trim().max(255).optional().nullable(),
  sort_order: z.coerce.number().int().min(0).optional(),
}).refine(
  (data) => data.name !== undefined || data.description !== undefined || data.sort_order !== undefined,
  { message: 'Vui lòng cung cấp thông tin cần cập nhật' },
);

const eventDeviceParamSchema = z.object({
  eventId: uuidSchema,
  deviceId: uuidSchema,
});

const updateEventDeviceGateSchema = z.object({
  assigned_gate_id: uuidSchema.nullable(),
});

const eventIdQuerySchema = z.object({
  event_id: uuidSchema.optional(),
});

const gateHistoryQuerySchema = z.object({
  event_id: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  result: z.enum(['OK', 'ALL']).optional().default('OK'),
  source: z.enum(['ALL', 'STAFF', 'IOT']).optional().default('ALL'),
});

module.exports = {
  inviteStaffSchema,
  updateStaffAssignmentSchema,
  invitationIdParamSchema,
  removeStaffSchema,
  eventIdParamSchema,
  eventGateParamSchema,
  createEventGateSchema,
  updateEventGateSchema,
  eventDeviceParamSchema,
  updateEventDeviceGateSchema,
  eventIdQuerySchema,
  gateHistoryQuerySchema,
};
