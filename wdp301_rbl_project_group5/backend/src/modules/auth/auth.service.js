const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const authRepository = require('./auth.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const { sendEmail } = require('../../infrastructure/email/email.service');

class AuthService {
    // --- HELPERS ---
    async hashPassword(password) {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS || '12'));
        return bcrypt.hash(password, salt);
    }

    hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    generateAccessToken(user, roles) {
        return jwt.sign(
            { sub: user.id, roles },
            process.env.JWT_ACCESS_SECRET,
            { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN }
        );
    }

    generateRefreshToken() {
        return crypto.randomBytes(40).toString('hex');
    }

    // --- CORE LOGIC ---
    async register(userData) {
        const existingUser = await authRepository.findUserByEmail(userData.email);
        if (existingUser) {
            throw new AppError('Email already exists', 400, ErrorCodes.AUTH_EMAIL_ALREADY_EXISTS);
        }

        const password_hash = await this.hashPassword(userData.password);

        // Create verification token
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date(Date.now() + (parseInt(process.env.EMAIL_VERIFY_EXPIRES_IN) * 1000));

        // Save pending user configuration to Redis
        await authRepository.savePendingUser(tokenHash, {
            ...userData,
            password_hash
        }, expiresAt);

        // Send email
        const verifyUrl = `${process.env.APP_URL}/api/auth/verify-email?token=${rawToken}`;
        await sendEmail({
            email: userData.email,
            subject: 'Email Verification',
            message: `Please verify your email by clicking: ${verifyUrl}`,
        });

        // Return email only because user is not inserted to DB yet (no user.id).
        return { email: userData.email };
    }

    async login(email, password, deviceInfo) {
        const user = await authRepository.findUserByEmail(email);
        if (!user) {
            throw new AppError('Invalid credentials', 401, ErrorCodes.AUTH_INVALID_CREDENTIALS);
        }

        if (user.is_locked) {
            throw new AppError('Account is locked', 403, ErrorCodes.AUTH_ACCOUNT_LOCKED);
        }

        if (!user.email_verified) {
            throw new AppError('Email not verified', 403, ErrorCodes.AUTH_EMAIL_NOT_VERIFIED);
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            // Brute force protection should be handled in controller/middleware with Redis
            throw new AppError('Invalid credentials', 401, ErrorCodes.AUTH_INVALID_CREDENTIALS);
        }

        const roles = await authRepository.findUserRoles(user.id);
        const accessToken = this.generateAccessToken(user, roles);
        const refreshToken = this.generateRefreshToken();
        const refreshTokenHash = this.hashToken(refreshToken);

        const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days
        await authRepository.createSession({
            user_id: user.id,
            refresh_token_hash: refreshTokenHash,
            user_agent: deviceInfo.userAgent,
            ip_address: deviceInfo.ip,
            expires_at: expiresAt,
        });

        await authRepository.updateUser(user.id, { last_login_at: new Date() });

        return { user: { id: user.id, email: user.email, full_name: user.full_name, roles }, accessToken, refreshToken };
    }

    async refresh(token, deviceInfo) {
        const hash = this.hashToken(token);
        const session = await authRepository.findSessionByHash(hash);

        if (!session) {
            // Possible reuse attack
            // If we had a way to identify the user from the expired token, we'd revoke all sessions
            throw new AppError('Invalid refresh token', 401, ErrorCodes.AUTH_INVALID_TOKEN);
        }

        const user = await authRepository.findUserById(session.user_id);
        if (!user || user.is_locked) {
            throw new AppError('User not available', 401, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        const roles = await authRepository.findUserRoles(user.id);

        // Rotate token
        await authRepository.revokeSession(session.id);

        const newAccessToken = this.generateAccessToken(user, roles);
        const newRefreshToken = this.generateRefreshToken();
        const newHash = this.hashToken(newRefreshToken);

        await authRepository.createSession({
            user_id: user.id,
            refresh_token_hash: newHash,
            user_agent: deviceInfo.userAgent,
            ip_address: deviceInfo.ip,
            expires_at: session.expires_at, // Keep original expiry or extend
        });

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }

    async logout(token) {
        const hash = this.hashToken(token);
        const session = await authRepository.findSessionByHash(hash);
        if (session) {
            await authRepository.revokeSession(session.id);
        }
    }

    async forgotPassword(email) {
        const user = await authRepository.findUserByEmail(email);
        // Anti-enumeration: always return success
        if (!user) return;

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date(Date.now() + (parseInt(process.env.PASSWORD_RESET_EXPIRES_IN || '3600') * 1000));

        await authRepository.createPasswordResetToken(user.id, tokenHash, expiresAt);

        const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;
        await sendEmail({
            email: user.email,
            subject: 'Password Reset Request',
            message: `Reset your password by clicking: ${resetUrl}`,
        });
    }

    async resetPassword(token, newPassword) {
        const hash = this.hashToken(token);
        const resetRecord = await authRepository.findPasswordResetToken(hash);

        if (!resetRecord) {
            throw new AppError('Invalid or expired reset token', 400, ErrorCodes.AUTH_INVALID_TOKEN);
        }

        const password_hash = await this.hashPassword(newPassword);
        await authRepository.updateUser(resetRecord.user_id, { password_hash });
        await authRepository.usePasswordResetToken(resetRecord.id);

        // Revoke all sessions after password reset
        await authRepository.revokeAllUserSessions(resetRecord.user_id);
    }

    async verifyEmail(token) {
        const hash = this.hashToken(token);

        // Fetch from Redis
        const pendingUser = await authRepository.getPendingUser(hash);
        if (!pendingUser) {
            throw new AppError('Invalid or expired verification token', 400, ErrorCodes.AUTH_INVALID_TOKEN);
        }

        // Insert user into PostgreSQL
        const user = await authRepository.createUser({
            ...pendingUser,
            email_verified: true,
        });

        // Assign the default role
        await authRepository.assignRole(user.id, 'customer');

        // Clean up Redis
        await authRepository.deletePendingUser(hash);
    }
}

module.exports = new AuthService();
