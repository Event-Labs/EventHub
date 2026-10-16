const mockAuthRepository = {
  findUserByEmail: jest.fn(),
  savePendingUser: jest.fn(),
  createSession: jest.fn(),
  updateUserIfColumnsExist: jest.fn(),
  findUserRoles: jest.fn(),
};

const mockSendEmail = jest.fn();

jest.mock('./auth.repository', () => mockAuthRepository);
jest.mock('../../infrastructure/email/email.service', () => ({
  sendEmail: mockSendEmail,
}));
jest.mock('../../core/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const authService = require('./auth.service');
const { registerSchema } = require('./auth.validation');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

describe('Unit Test: Register Functionality (AU-TC01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_VERIFY_EXPIRES_IN = '86400';
    process.env.CLIENT_URL = 'http://localhost:5173';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==========================================
  // NORMAL CASES (N)
  // ==========================================
  describe('Normal Cases (N)', () => {
    it('UTCID01 (N): Registers user successfully with full valid information', async () => {
      const validData = {
        email: 'newuser@example.com',
        full_name: 'Nguyen Van A',
        password: 'Password@123',
        phone: '0912345678',
      };

      // 1. Validation check
      const parsedData = registerSchema.parse(validData);
      expect(parsedData).toEqual(validData);

      // 2. Service logic check
      mockAuthRepository.findUserByEmail.mockResolvedValue(null);
      mockAuthRepository.savePendingUser.mockResolvedValue();
      mockSendEmail.mockResolvedValue({ messageId: 'msg-01', accepted: [validData.email] });

      const result = await authService.register(parsedData);

      expect(result).toEqual({ email: validData.email });
      expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(validData.email);
      expect(mockAuthRepository.savePendingUser).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          email: validData.email,
          full_name: validData.full_name,
          phone: validData.phone,
          password_hash: expect.any(String),
        }),
        expect.any(Date)
      );
      expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
        email: validData.email,
        subject: 'Xác thực tài khoản EventHub',
      }));
    });

    it('UTCID02 (N): Registers user successfully when phone is null or omitted', async () => {
      const validDataWithoutPhone = {
        email: 'user.nophone@example.com',
        full_name: 'Tran Thi B',
        password: 'Password@123',
      };

      const parsedData = registerSchema.parse(validDataWithoutPhone);
      expect(parsedData.phone).toBeUndefined();

      mockAuthRepository.findUserByEmail.mockResolvedValue(null);
      mockAuthRepository.savePendingUser.mockResolvedValue();
      mockSendEmail.mockResolvedValue({ messageId: 'msg-02', accepted: [validDataWithoutPhone.email] });

      const result = await authService.register(parsedData);

      expect(result).toEqual({ email: validDataWithoutPhone.email });
      expect(mockAuthRepository.savePendingUser).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          email: validDataWithoutPhone.email,
          full_name: validDataWithoutPhone.full_name,
        }),
        expect.any(Date)
      );
    });
  });

  // ==========================================
  // BOUNDARY CASES (B)
  // ==========================================
  describe('Boundary Cases (B)', () => {
    it('UTCID03 (B): Registers successfully with password exactly at minimum boundary (8 chars)', async () => {
      const boundaryData = {
        email: 'boundary.pwd@example.com',
        full_name: 'Le Van C',
        password: 'Pass@123', // exactly 8 chars
        phone: '0987654321',
      };

      const parsedData = registerSchema.parse(boundaryData);
      expect(parsedData.password.length).toBe(8);

      mockAuthRepository.findUserByEmail.mockResolvedValue(null);
      mockAuthRepository.savePendingUser.mockResolvedValue();
      mockSendEmail.mockResolvedValue({ messageId: 'msg-03' });

      const result = await authService.register(parsedData);
      expect(result).toEqual({ email: boundaryData.email });
    });

    it('UTCID04 (B): Registers successfully with full_name at minimum boundary (1 char)', async () => {
      const boundaryData = {
        email: 'boundary.minname@example.com',
        full_name: 'A', // exactly 1 char
        password: 'Password@123',
      };

      const parsedData = registerSchema.parse(boundaryData);
      expect(parsedData.full_name).toBe('A');

      mockAuthRepository.findUserByEmail.mockResolvedValue(null);
      mockAuthRepository.savePendingUser.mockResolvedValue();
      mockSendEmail.mockResolvedValue({ messageId: 'msg-04' });

      const result = await authService.register(parsedData);
      expect(result).toEqual({ email: boundaryData.email });
    });

    it('UTCID05 (B): Registers successfully with full_name at maximum boundary (150 chars)', async () => {
      const longName = 'A'.repeat(150);
      const boundaryData = {
        email: 'boundary.maxname@example.com',
        full_name: longName, // exactly 150 chars
        password: 'Password@123',
      };

      const parsedData = registerSchema.parse(boundaryData);
      expect(parsedData.full_name.length).toBe(150);

      mockAuthRepository.findUserByEmail.mockResolvedValue(null);
      mockAuthRepository.savePendingUser.mockResolvedValue();
      mockSendEmail.mockResolvedValue({ messageId: 'msg-05' });

      const result = await authService.register(parsedData);
      expect(result).toEqual({ email: boundaryData.email });
    });

    it('UTCID06 (B): Registers successfully with phone at maximum boundary (20 chars)', async () => {
      const boundaryPhone = '+84' + '12345678901234567'; // 20 chars
      const boundaryData = {
        email: 'boundary.phone@example.com',
        full_name: 'Hoang Van D',
        password: 'Password@123',
        phone: boundaryPhone,
      };

      const parsedData = registerSchema.parse(boundaryData);
      expect(parsedData.phone.length).toBe(20);

      mockAuthRepository.findUserByEmail.mockResolvedValue(null);
      mockAuthRepository.savePendingUser.mockResolvedValue();
      mockSendEmail.mockResolvedValue({ messageId: 'msg-06' });

      const result = await authService.register(parsedData);
      expect(result).toEqual({ email: boundaryData.email });
    });

    it('UTCID11 (B): Rejects registration when password length is below minimum boundary (7 chars)', () => {
      const belowBoundaryData = {
        email: 'invalid.pwd7@example.com',
        full_name: 'Nguyen Van E',
        password: 'Pass@12', // 7 chars (< 8)
      };

      expect(() => registerSchema.parse(belowBoundaryData)).toThrow(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ message: 'Mật khẩu phải có ít nhất 8 ký tự' }),
          ]),
        })
      );
    });
  });

  // ==========================================
  // ABNORMAL CASES (A)
  // ==========================================
  describe('Abnormal Cases (A)', () => {
    it('UTCID07 (A): Throws AppError 400 when email already exists in system', async () => {
      const duplicateUserData = {
        email: 'existing@example.com',
        full_name: 'Nguyen Van F',
        password: 'Password@123',
      };

      mockAuthRepository.findUserByEmail.mockResolvedValue({
        id: 'existing-id-123',
        email: 'existing@example.com',
      });

      await expect(authService.register(duplicateUserData)).rejects.toMatchObject({
        statusCode: 400,
        errorCode: ErrorCodes.AUTH_EMAIL_ALREADY_EXISTS,
        message: 'Email này đã được sử dụng',
      });

      expect(mockAuthRepository.savePendingUser).not.toHaveBeenCalled();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('UTCID08 (A): Rejects invalid email format', () => {
      const invalidEmailData = {
        email: 'invalid-email-format',
        full_name: 'Nguyen Van G',
        password: 'Password@123',
      };

      expect(() => registerSchema.parse(invalidEmailData)).toThrow(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ message: 'Địa chỉ email không hợp lệ' }),
          ]),
        })
      );
    });

    it('UTCID09 (A): Rejects empty or missing email', () => {
      const emptyEmailData = {
        email: '',
        full_name: 'Nguyen Van H',
        password: 'Password@123',
      };

      expect(() => registerSchema.parse(emptyEmailData)).toThrow(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ message: 'Địa chỉ email không hợp lệ' }),
          ]),
        })
      );
    });

    it('UTCID10 (A): Rejects empty full_name', () => {
      const emptyNameData = {
        email: 'user.noname@example.com',
        full_name: '',
        password: 'Password@123',
      };

      expect(() => registerSchema.parse(emptyNameData)).toThrow(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ message: 'Họ và tên là bắt buộc' }),
          ]),
        })
      );
    });

    it('UTCID12 (A): Rejects password missing uppercase character', () => {
      const noUpperData = {
        email: 'user.noupper@example.com',
        full_name: 'Nguyen Van I',
        password: 'password@123', // lacks uppercase
      };

      expect(() => registerSchema.parse(noUpperData)).toThrow(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ message: 'Mật khẩu phải chứa ít nhất 1 chữ hoa' }),
          ]),
        })
      );
    });

    it('UTCID13 (A): Rejects password missing special character', () => {
      const noSpecialData = {
        email: 'user.nospecial@example.com',
        full_name: 'Nguyen Van K',
        password: 'Password123', // lacks special char
      };

      expect(() => registerSchema.parse(noSpecialData)).toThrow(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ message: 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt' }),
          ]),
        })
      );
    });

    it('UTCID14 (A): Rejects password missing digit number', () => {
      const noDigitData = {
        email: 'user.nodigit@example.com',
        full_name: 'Nguyen Van L',
        password: 'Password@Abc', // lacks number
      };

      expect(() => registerSchema.parse(noDigitData)).toThrow(
        expect.objectContaining({
          issues: expect.arrayContaining([
            expect.objectContaining({ message: 'Mật khẩu phải chứa ít nhất 1 chữ số' }),
          ]),
        })
      );
    });

    it('UTCID15 (A): Propagates error when email service fails to send verification email', async () => {
      const validUserData = {
        email: 'user.smtpfail@example.com',
        full_name: 'Nguyen Van M',
        password: 'Password@123',
      };

      mockAuthRepository.findUserByEmail.mockResolvedValue(null);
      mockAuthRepository.savePendingUser.mockResolvedValue();
      mockSendEmail.mockRejectedValue(new Error('SMTP Connection timeout'));

      await expect(authService.register(validUserData)).rejects.toThrow('SMTP Connection timeout');
      expect(mockAuthRepository.savePendingUser).toHaveBeenCalled();
    });
  });
});
