const { z } = require('zod');

const eventIdParamSchema = z.object({
  eventId: z.string().uuid(),
});

const submitFeedbackSchema = z.object({
  event_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  content: z.string().trim().min(10).max(2000),
});

module.exports = {
  eventIdParamSchema,
  submitFeedbackSchema,
};
