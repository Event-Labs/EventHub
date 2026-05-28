const { z } = require('zod');
const dotenv = require('dotenv');

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().transform(Number).default('3000'),
    APP_URL: z.string().url(),
    CLIENT_URL: z.string().url(),

    DATABASE_URL: z.string().url(),

    REDIS_URL: z.string().url().optional(),
    REDIS_PASSWORD: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    SMTP_HOST: z.string(),
    SMTP_PORT: z.string().transform(Number),
    SMTP_USER: z.string(),
    SMTP_PASS: z.string(),
    EMAIL_FROM: z.string().email(),

    GOOGLE_CLIENT_ID: z.string().optional(),

    BCRYPT_SALT_ROUNDS: z.string().transform(Number).default('12'),
    EMAIL_VERIFY_EXPIRES_IN: z.string().transform(Number).default('86400'),
    PASSWORD_RESET_EXPIRES_IN: z.string().transform(Number).default('3600'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    process.exit(1);
}

module.exports = result.data;
