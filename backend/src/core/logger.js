const winston = require('winston');

const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

const level = () => {
    const env = process.env.NODE_ENV || 'development';
    const isDevelopment = env === 'development';
    return process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
};

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

const REDACT_KEYS = new Set([
    'api_key',
    'checksum_key',
    'payout_api_key',
    'payout_checksum_key',
    'bank_account_number',
    'authorization',
    'api_key_encrypted',
    'checksum_key_encrypted',
    'payout_api_key_encrypted',
    'payout_checksum_key_encrypted',
]);

function redactValue(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(redactValue);
    const copy = {};
    for (const [k, v] of Object.entries(obj)) {
        if (REDACT_KEYS.has(k.toLowerCase())) {
            copy[k] = '[REDACTED]';
        } else if (typeof v === 'object' && v !== null) {
            copy[k] = redactValue(v);
        } else {
            copy[k] = v;
        }
    }
    return copy;
}

const redactFormat = winston.format((info) => {
    for (const key of Object.keys(info)) {
        if (REDACT_KEYS.has(key.toLowerCase())) {
            info[key] = '[REDACTED]';
        } else if (typeof info[key] === 'object' && info[key] !== null) {
            info[key] = redactValue(info[key]);
        }
    }
    if (typeof info.message === 'string') {
        info.message = info.message.replace(
            /(["']?(?:api_key|checksum_key|payout_api_key|payout_checksum_key|bank_account_number|authorization|api_key_encrypted|checksum_key_encrypted)["']?\s*[:=]\s*)(["']?[^"'\s,;]+["']?)/gi,
            '$1"[REDACTED]"'
        );
    }
    return info;
});

const format = winston.format.combine(
    redactFormat(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
);

const transports = [
    new winston.transports.Console(),
    new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
    }),
    new winston.transports.File({ filename: 'logs/all.log' }),
];

const logger = winston.createLogger({
    level: level(),
    levels,
    format,
    transports,
});

module.exports = logger;
