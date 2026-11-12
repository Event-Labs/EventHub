const { z } = require('zod');

const registerDeviceSchema = z.object({
  mac_address: z.string().trim().min(1, 'mac_address is required').max(32),
  hardware: z.string().trim().max(80).optional().nullable(),
  firmware_version: z.string().trim().max(64).optional().nullable(),
});

const pairingStatusQuerySchema = z.object({
  mac_address: z.string().trim().min(1, 'mac_address is required').max(32),
});

const heartbeatSchema = z.object({
  rssi: z.coerce.number().int().min(-127).max(20).optional().nullable(),
  ip: z.string().trim().max(64).optional().nullable(),
  free_heap: z.coerce.number().int().min(0).optional().nullable(),
  uptime_sec: z.coerce.number().int().min(0).optional().nullable(),
  firmware_version: z.string().trim().max(64).optional().nullable(),
  auto_confirm_override: z.boolean().optional().nullable(),
  base_config_version: z.preprocess(
    (val) => (val === null || val === undefined || val === '' ? undefined : val),
    z.coerce.number().int().min(0).optional(),
  ),
});

const scanTicketSchema = z.object({
  qr_code: z.string().trim().min(1, 'qr_code is required').max(1024),
  action: z.enum(['auto', 'verify', 'checkin']).default('auto'),
});

module.exports = {
  registerDeviceSchema,
  pairingStatusQuerySchema,
  heartbeatSchema,
  scanTicketSchema,
};

