import axios from 'axios';
import logger from '../../utils/logger';

/**
 * Send email using SMTP2Go API
 * @param to Array of recipient email addresses
 * @param subject Email subject
 * @param text Plain text body
 * @param html HTML body
 * @returns Promise with email send result
 */
export const sendEmail = async ({ to, subject, text, html }: { to: string[]; subject: string; text: string; html: string }) => {
    try {
        const apiUrl = process.env.SMTP2GO_API_URL || "https://api.smtp2go.com/v3/email/send";
        const apiKey = process.env.SMTP2GO_API_KEY;
        const sender = process.env.SMTP2GO_SENDER;
        const bcc = process.env.SMTP2GO_BCC;
        const cc = process.env.SMTP2GO_CC;
        if (!apiKey) {
            throw new Error('SMTP2GO_API_KEY environment variable is not set');
        }

        if (!sender) {
            throw new Error('SMTP2GO_SENDER environment variable is not set');
        }

        const response = await axios.post(
            apiUrl,
            {
                api_key: apiKey,
                sender: sender,
                subject: subject,
                text_body: text,
                html_body: html,
                to: to,
                bcc: bcc,
                cc: cc,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.data.data?.succeeded) {
            logger.info('Email sent successfully', { to, subject });
            return { message: 'Email sent successfully', success: true };
        } else {
            logger.error('Failed to send email', { response: response.data });
            return { message: 'Failed to send email', data: response.data, success: false };
        }
    } catch (err: any) {
        logger.error('Error sending email', {
            error: err?.message || 'Unknown error',
            stack: err?.stack,
            to,
            subject
        });
        throw err;
    }
};

