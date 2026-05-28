const { z } = require('zod');

const registerSchema = z.object({
    email: z.string().email('Invalid email address').max(254),
    full_name: z.string().min(1, 'Full name is required').max(150),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    phone: z.string().max(20).optional().nullable(),
});

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
    email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const verifyEmailSchema = z.object({
    token: z.string().min(1, 'Token is required'),
});

const googleLoginSchema = z.object({
    credential: z.string().min(1, 'Credential is required'),
});

module.exports = {
    registerSchema,
    loginSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    verifyEmailSchema,
    googleLoginSchema,
};
