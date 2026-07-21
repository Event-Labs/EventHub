const nodemailer = require('nodemailer');
const logger = require('../../core/logger');

function maskEmail(value) {
    const [name = '', domain = ''] = String(value || '').split('@');
    if (!domain) return 'missing';
    return `${name.slice(0, 2)}***@${domain}`;
}

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,                                                                                                                                                                                                                                                                                                                                                                                                                                                      
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,                                                                       
    },
});

const sendEmail = async (options) => {
    const mailOptions = {                         
        from: process.env.EMAIL_FROM,
        to: options.email,
        subject: options.subject,
        text: options.message,                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             
        html: options.html,
    };

    try {
        logger.info(`[SMTP] send started recipient=${maskEmail(options.email)} host=${process.env.SMTP_HOST || 'missing'} port=${process.env.SMTP_PORT || 'missing'} secure=${process.env.SMTP_PORT === '465'} from=${process.env.EMAIL_FROM || 'missing'} subject=${JSON.stringify(options.subject || '')} attachments=${options.attachments?.length || 0}`);
        const info = await transporter.sendMail(mailOptions);
        logger.info(`[SMTP] send completed recipient=${maskEmail(options.email)} messageId=${info.messageId || 'missing'} accepted=${JSON.stringify(info.accepted || [])} rejected=${JSON.stringify(info.rejected || [])} response=${JSON.stringify(info.response || '')}`);
        return info;
    } catch (error) {
        logger.error(`[SMTP] send failed recipient=${maskEmail(options.email)} code=${error.code || 'unknown'} command=${error.command || 'unknown'} responseCode=${error.responseCode || 'unknown'} message=${JSON.stringify(error.message || '')} stack=${JSON.stringify(error.stack || '')}`);
        throw error;
    }
};

module.exports = { sendEmail };
