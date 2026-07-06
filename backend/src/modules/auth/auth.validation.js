const { z } = require('zod');

const registerSchema = z.object({
    email: z.string().email('Địa chỉ email không hợp lệ').max(254),
    full_name: z.string().min(1, 'Họ và tên là bắt buộc').max(150),
    password: z.string()
        .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
        .regex(/[A-Z]/, 'Mật khẩu phải chứa ít nhất 1 chữ hoa')
        .regex(/[a-z]/, 'Mật khẩu phải chứa ít nhất 1 chữ thường')
        .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất 1 chữ số')
        .regex(/[^a-zA-Z0-9]/, 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt'),
    phone: z.string().max(20).optional().nullable(),
});

const loginSchema = z.object({
    email: z.string().email('Địa chỉ email không hợp lệ'),
    password: z.string().min(1, 'Mật khẩu là bắt buộc'),
});

const forgotPasswordSchema = z.object({
    email: z.string().email('Địa chỉ email không hợp lệ'),
});

const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Token đặt lại mật khẩu là bắt buộc'),
    newPassword: z.string()
        .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
        .regex(/[A-Z]/, 'Mật khẩu phải chứa ít nhất 1 chữ hoa')
        .regex(/[a-z]/, 'Mật khẩu phải chứa ít nhất 1 chữ thường')
        .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất 1 chữ số')
        .regex(/[^a-zA-Z0-9]/, 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt'),
});

const verifyEmailSchema = z.object({
    token: z.string().min(1, 'Mã xác thực (Token) là bắt buộc'),
});

const googleLoginSchema = z.object({
    credential: z.string().min(1, 'Thông tin xác thực Google là bắt buộc'),
});

module.exports = {
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    verifyEmailSchema,
    googleLoginSchema,
};
