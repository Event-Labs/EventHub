const nodemailer = require('nodemailer');
const logger = require('../../core/logger');
const env = require('../../config/env');

function maskEmail(value) {
    const [name = '', domain = ''] = String(value || '').split('@');
    if (!domain) return 'missing';
    return `${name.slice(0, 2)}***@${domain}`;
}

const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
});

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
        const info = await transporter.sendMail(mailOptions);
        const accepted = Array.isArray(info.accepted) ? info.accepted : [];
        const rejected = Array.isArray(info.rejected) ? info.rejected : [];
        if (accepted.length === 0 || rejected.length > 0) {
            const error = new Error(`SMTP did not accept every recipient (accepted=${accepted.length}, rejected=${rejected.length})`);
            error.code = 'SMTP_RECIPIENT_REJECTED';
            error.rejected = rejected;
            throw error;
        }
        logger.info(`[SMTP] send completed recipient=${maskEmail(options.email)} messageId=${info.messageId || 'missing'} accepted=${JSON.stringify(info.accepted || [])} rejected=${JSON.stringify(info.rejected || [])} response=${JSON.stringify(info.response || '')}`);
        return info;
    } catch (error) {
        logger.error(`[SMTP] send failed recipient=${maskEmail(options.email)} code=${error.code || 'unknown'} command=${error.command || 'unknown'} responseCode=${error.responseCode || 'unknown'} message=${JSON.stringify(error.message || '')} stack=${JSON.stringify(error.stack || '')}`);
        throw error;
    }
};

module.exports = { sendEmail };
