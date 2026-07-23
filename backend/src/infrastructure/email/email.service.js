const nodemailer = require('nodemailer');
const logger = require('../../core/logger');
const env = require('../../config/env');

function maskEmail(value) {
    const [name = '', domain = ''] = String(value || '').split('@');
    if (!domain) return 'missing';
    return `${name.slice(0, 2)}***@${domain}`;
}

const transporters = new Map();

function getTransporter(port) {
    if (!transporters.has(port)) {
        transporters.set(port, nodemailer.createTransport({
            host: env.SMTP_HOST,
            port,
            secure: port === 465,
            auth: {
                user: env.SMTP_USER,
                pass: env.SMTP_PASS,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 30000,
        }));
    }
    return transporters.get(port);
}

function isConnectionError(error) {
    return ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ESOCKET', 'EHOSTUNREACH'].includes(error?.code);
}

async function sendWithPort(mailOptions, port) {
    const transporter = getTransporter(port);
    return transporter.sendMail(mailOptions);
}

const sendEmail = async (options) => {
    const mailOptions = {
        from: env.EMAIL_FROM,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html,
        attachments: options.attachments,
    };

    try {
        logger.info(`[SMTP] send started recipient=${maskEmail(options.email)} host=${env.SMTP_HOST} port=${env.SMTP_PORT} secure=${env.SMTP_PORT === 465} from=${env.EMAIL_FROM} subject=${JSON.stringify(options.subject || '')} attachments=${options.attachments?.length || 0}`);
        let port = env.SMTP_PORT;
        let info;
        try {
            info = await sendWithPort(mailOptions, port);
        } catch (error) {
            const fallbackPort = port === 465 ? 587 : 465;
            if (!isConnectionError(error)) throw error;
            logger.warn(`[SMTP] primary connection failed port=${port} code=${error.code || 'unknown'}; retrying fallback port=${fallbackPort}`);
            port = fallbackPort;
            info = await sendWithPort(mailOptions, port);
        }
        const accepted = Array.isArray(info.accepted) ? info.accepted : [];
        const rejected = Array.isArray(info.rejected) ? info.rejected : [];
        if (accepted.length === 0 || rejected.length > 0) {
            const error = new Error(`SMTP did not accept every recipient (accepted=${accepted.length}, rejected=${rejected.length})`);
            error.code = 'SMTP_RECIPIENT_REJECTED';
            error.rejected = rejected;
            throw error;
        }
        logger.info(`[SMTP] send completed recipient=${maskEmail(options.email)} port=${port} messageId=${info.messageId || 'missing'} accepted=${JSON.stringify(info.accepted || [])} rejected=${JSON.stringify(info.rejected || [])} response=${JSON.stringify(info.response || '')}`);
        return info;
    } catch (error) {
        logger.error(`[SMTP] send failed recipient=${maskEmail(options.email)} code=${error.code || 'unknown'} command=${error.command || 'unknown'} responseCode=${error.responseCode || 'unknown'} message=${JSON.stringify(error.message || '')} stack=${JSON.stringify(error.stack || '')}`);
        throw error;
    }
};

module.exports = { sendEmail };
