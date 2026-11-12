const { z } = require('zod');

const deviceIdParamSchema = z.object({
  id: z.string().uuid('ID thiết bị không hợp lệ'),
});

const listDevicesQuerySchema = z.object({
  status: z.enum(['ALL', 'PENDING', 'ACTIVE', 'DISABLED', 'REVOKED']).default('ALL'),
  online: z.enum(['ALL', 'ONLINE', 'OFFLINE']).default('ALL'),
  event_id: z.string().uuid().optional().or(z.literal('')),
  search: z.string().trim().max(100).optional().default(''),
});

const deviceHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  result: z.string().trim().max(40).optional().default('ALL'),
  search: z.string().trim().max(100).optional().default(''),
});

const approveDeviceSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên thiết bị').max(120),
  assigned_event_id: z.string().uuid('Sự kiện được chọn không hợp lệ').nullable().optional(),
  auto_confirm: z.boolean().default(false),
});

const updateDeviceSchema = z.object({
  name: z.string().trim().min(1, 'Tên thiết bị không được để trống').max(120).optional(),
  assigned_event_id: z.string().uuid('Sự kiện được chọn không hợp lệ').nullable().optional(),
  auto_confirm: z.boolean().optional(),
}).refine(
  (data) =>
    data.name !== undefined
    || data.assigned_event_id !== undefined
    || data.auto_confirm !== undefined,
  { message: 'Vui lòng cung cấp ít nhất một thông tin cần cập nhật' },
);

module.exports = {
  deviceIdParamSchema,
  listDevicesQuerySchema,
  deviceHistoryQuerySchema,
  approveDeviceSchema,
  updateDeviceSchema,
};

