const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));
jest.mock('../../config/env', () => ({
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: 465,
  SMTP_USER: 'mailer@example.com',
  SMTP_PASS: 'secret',
  EMAIL_FROM: 'mailer@example.com',
}));
jest.mock('../../core/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const { sendEmail } = require('./email.service');

describe('email.service', () => {
  beforeEach(() => {
    mockSendMail.mockReset();
  });

  it('passes attachments through and returns accepted delivery details', async () => {
    mockSendMail.mockResolvedValue({
      messageId: 'message-1',
      accepted: ['customer@example.com'],
      rejected: [],
    });
    const attachments = [{ filename: 'ticket.pdf', content: 'ticket' }];

    const info = await sendEmail({
      email: 'customer@example.com',
      subject: 'Your ticket',
      message: 'Attached',
      attachments,
    });

    expect(info.messageId).toBe('message-1');
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'mailer@example.com',
      to: 'customer@example.com',
      attachments,
    }));
  });

  it('rejects a delivery when SMTP accepts no recipient', async () => {
    mockSendMail.mockResolvedValue({
      accepted: [],
      rejected: ['customer@example.com'],
    });

    await expect(sendEmail({
      email: 'customer@example.com',
      subject: 'Your ticket',
      message: 'Attached',
    })).rejects.toMatchObject({ code: 'SMTP_RECIPIENT_REJECTED' });
  });

  it('retries the alternate SMTP port when the primary connection times out', async () => {
    mockSendMail
      .mockRejectedValueOnce(Object.assign(new Error('Greeting never received'), { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce({
        messageId: 'message-fallback',
        accepted: ['customer@example.com'],
        rejected: [],
      });

    const info = await sendEmail({
      email: 'customer@example.com',
      subject: 'Fallback',
      message: 'Retry',
    });

    expect(info.messageId).toBe('message-fallback');
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });
});
