const { z } = require('zod');

const chatSchema = z.object({
  message: z.string().trim().min(2).max(1000),
  session_id: z.string().uuid().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(1000),
      }),
    )
    .max(10)
    .optional(),
});

module.exports = {
  chatSchema,
};
