const mockAuthRepository = {
  saveOtpChallenge: jest.fn(),
  deleteOtpChallenge: jest.fn(),
};
const mockSendEmail = jest.fn();

jest.mock('./auth.repository', () => mockAuthRepository);
jest.mock('../../infrastructure/email/email.service', () => ({ sendEmail: mockSendEmail }));
jest.mock('../../core/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const authService = require('./auth.service');

describe('auth OTP email delivery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes an unusable challenge when email delivery fails', async () => {
    mockAuthRepository.saveOtpChallenge.mockResolvedValue();
    mockAuthRepository.deleteOtpChallenge.mockResolvedValue();
    mockSendEmail.mockRejectedValue(new Error('SMTP unavailable'));

    await expect(authService.createOtpChallenge('user_2fa', {
      userId: 'user-1',
      email: 'user@example.com',
    })).rejects.toThrow('SMTP unavailable');

    expect(mockAuthRepository.saveOtpChallenge).toHaveBeenCalledTimes(1);
    const challengeId = mockAuthRepository.saveOtpChallenge.mock.calls[0][1];
    expect(mockAuthRepository.deleteOtpChallenge).toHaveBeenCalledWith('user_2fa', challengeId);
  });
});
