const { z } = require('zod');

const eventIdParamSchema = z.object({
  eventId: z.string().uuid('Mã sự kiện không hợp lệ.'),
});

const submitFeedbackSchema = z.object({
  event_id: z.string().uuid('Vui lòng chọn sự kiện hợp lệ.'),
  rating: z.coerce
    .number({
      invalid_type_error: 'Vui lòng chọn số sao đánh giá.',
    })
    .int('Số sao đánh giá không hợp lệ.')
    .min(1, 'Vui lòng chọn số sao đánh giá.')
    .max(5, 'Số sao đánh giá tối đa là 5.'),
  content: z
    .string({
      required_error: 'Vui lòng nhập nội dung phản hồi.',
      invalid_type_error: 'Nội dung phản hồi không hợp lệ.',
    })
    .trim()
    .min(10, 'Nội dung phản hồi cần có ít nhất 10 ký tự.')
    .max(2000, 'Nội dung phản hồi tối đa 2.000 ký tự.'),
});

module.exports = {
  eventIdParamSchema,
  submitFeedbackSchema,
};
