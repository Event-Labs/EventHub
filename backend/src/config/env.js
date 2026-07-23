const { z } = require('zod');
const dotenv = require('dotenv');

dotenv.config();

const cleanEnvValue = (value) => {
    const text = String(value ?? '').trim();
    if (
        text.length >= 2
        && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
    ) {
        return text.slice(1, -1).trim();
    }
    return text;
};

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

    SMTP_HOST: z.string().transform(cleanEnvValue),
    SMTP_PORT: z.string().transform(cleanEnvValue).transform(Number),
    SMTP_USER: z.string().transform(cleanEnvValue),
    SMTP_PASS: z.string().transform(cleanEnvValue),
    EMAIL_FROM: z.preprocess(cleanEnvValue, z.string().email()),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    GOOGLE_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().optional(),
    FINANCIAL_AI_URL: z.string().url().optional(),
    FINANCIAL_AI_PROVIDER: z.enum(['auto', 'fastapi', 'gradio']).default('auto'),

    PLATFORM_PAYOS_CLIENT_ID: z.string().optional(),
    PLATFORM_PAYOS_API_KEY: z.string().optional(),
    PLATFORM_PAYOS_CHECKSUM_KEY: z.string().optional(),

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
