const nodemailer = require('nodemailer');
const logger = require('../../core/logger');

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
        await transporter.sendMail(mailOptions);
        logger.info(`Email sent to ${options.email}`);
    } catch (error) {
        logger.error(`Error sending email to ${options.email}:`, error);
        throw error;
    }
};

module.exports = { sendEmail };
