const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const authRepository = require('./auth.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const logger = require('../../core/logger');
const { sendEmail } = require('../../infrastructure/email/email.service');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function cleanHeaderValue(value) {
    return String(value || '').replace(/^"|"$/g, '').trim();
}

function getDeviceName(deviceInfo) {
    const ua = String(deviceInfo?.userAgent || deviceInfo || '');
    const platformHint = cleanHeaderValue(deviceInfo?.platform);
    const browserHints = String(deviceInfo?.browserHints || '');
    if (!ua && !platformHint && !browserHints) return 'Thiết bị không xác định';

    const os = /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua)
            ? 'macOS'
            : /Android/i.test(ua)
                ? 'Android'
                : /iPhone|iPad|iPod/i.test(ua)
                    ? 'iOS'
                    : /Linux/i.test(ua)
                        ? 'Linux'
                        : platformHint || 'Hệ điều hành không xác định';

    let browser = 'Trình duyệt không xác định';
    if (/Edg\//i.test(ua) || /Microsoft Edge|Edge/i.test(browserHints)) {
        browser = 'Microsoft Edge';
    } else if (/OPR\//i.test(ua)) {
        browser = 'Opera';
    } else if (/Chrome\//i.test(ua) || /Chromium|Google Chrome/i.test(browserHints)) {
        browser = 'Chrome';
    } else if (/Firefox\//i.test(ua)) {
        browser = 'Firefox';
    } else if (/Safari\//i.test(ua)) {
        browser = 'Safari';
    }

    return `${browser} trên ${os}`;
}

class AuthService {
    async resolveEffectiveRoles(user, roles) {
        if (!roles.includes('STAFF')) {
            return { roles, staffEventIds: [] };
        }

        const operationsRepository = require('../operations/operations.repository');
        const staffEventIds = await operationsRepository.getStaffEventIds(user.id);
        if (staffEventIds.length > 0) {
            return { roles, staffEventIds };
        }

        return {
            roles: roles.filter((role) => role !== 'STAFF'),
            staffEventIds,
        };
    }

    serializeAuthUser(user, roles) {
        return {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            roles,
        };
    }

    // --- HELPERS ---
    async hashPassword(password) {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS || '12'));
        return bcrypt.hash(password, salt);
    }

    hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    async generateAccessToken(user, roles) {
        const effective = await this.resolveEffectiveRoles(user, roles);
        const payload = { sub: user.id, roles: effective.roles };

        if (effective.roles.includes('STAFF')) {
            payload.staff_event_ids = effective.staffEventIds;
        }

        return jwt.sign(
            payload,
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
            throw new AppError('Email này đã được sử dụng', 400, ErrorCodes.AUTH_EMAIL_ALREADY_EXISTS);
        }

        const password_hash = await this.hashPassword(userData.password);

        // Create verification token
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date(Date.now() + (parseInt(process.env.EMAIL_VERIFY_EXPIRES_IN) * 1000));
        logger.info(`[DEBUG] CREATED Verify Token: ${rawToken} -> Hash: ${tokenHash}`);

        // Save pending user configuration to Redis
        await authRepository.savePendingUser(tokenHash, {
            ...userData,
            password_hash
        }, expiresAt);

        // Send email
        const verifyUrl = `${process.env.CLIENT_URL}/verify-email?token=${rawToken}`;
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
            throw new AppError('Email hoặc mật khẩu không chính xác', 401, ErrorCodes.AUTH_INVALID_CREDENTIALS);
        }

        if (user.status === 'LOCKED') {
            // Check for auto-unblock
            if (user.locked_until && new Date(user.locked_until) < new Date()) {
                await authRepository.updateUser(user.id, {
                    status: 'ACTIVE',
                    lock_reason: null,
                    locked_at: null,
                    locked_until: null,
                    locked_by: null
                });
            } else {
                throw new AppError('Tài khoản của bạn đã bị khóa', 403, ErrorCodes.ACCOUNT_LOCKED, {
                    lockReason: user.lock_reason,
                    lockedAt: user.locked_at ? new Date(user.locked_at).toISOString() : null,
                    lockedUntil: user.locked_until ? new Date(user.locked_until).toISOString() : null,
                    isPermanentLock: user.locked_until === null
                });
            }
        }

        if (!user.email_verified) {
            throw new AppError('Tài khoản email chưa được xác thực', 403, ErrorCodes.AUTH_EMAIL_NOT_VERIFIED);
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            // Brute force protection should be handled in controller/middleware with Redis
            throw new AppError('Email hoặc mật khẩu không chính xác', 401, ErrorCodes.AUTH_INVALID_CREDENTIALS);
        }

        const roles = await authRepository.findUserRoles(user.id);
        const effective = await this.resolveEffectiveRoles(user, roles);
        const accessToken = await this.generateAccessToken(user, effective.roles);
        const refreshToken = this.generateRefreshToken();
        const refreshTokenHash = this.hashToken(refreshToken);

        const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days
        const deviceName = getDeviceName(deviceInfo);
        await authRepository.createSession({
            user_id: user.id,
            refresh_token_hash: refreshTokenHash,
            user_agent: deviceInfo.userAgent,
            ip_address: deviceInfo.ip,
            device_name: deviceName,
            expires_at: expiresAt,
        });

        await authRepository.updateUserIfColumnsExist(user.id, {
            last_login_at: new Date(),
            last_login_ip: deviceInfo.ip || null,
            last_login_user_agent: deviceInfo.userAgent || null,
            last_login_device: deviceName,
        });

        return { user: this.serializeAuthUser(user, effective.roles), accessToken, refreshToken };
    }

    async googleLogin(credential, deviceInfo) {
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken: credential,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();

            if (!payload) {
                throw new AppError('Xác thực tài khoản Google không hợp lệ', 401, ErrorCodes.AUTH_INVALID_TOKEN);
            }

            const { email, name, sub: google_id, email_verified, picture } = payload;

            let user = await authRepository.findUserByEmail(email);

            if (!user) {
                // Register if not found
                user = await authRepository.createUser({
                    email,
                    full_name: name,
                    password_hash: '*', // No password needed for OAuth
                    phone: null,
                    google_id,
                    email_verified: email_verified || false,
                    avatar_url: picture || null,
                });
                await authRepository.assignRole(user.id, 'CUSTOMER');
            } else {
                if (user.status === 'LOCKED') {
                    if (user.locked_until && new Date(user.locked_until) < new Date()) {
                        await authRepository.updateUser(user.id, {
                            status: 'ACTIVE',
                            lock_reason: null,
                            locked_at: null,
                            locked_until: null,
                            locked_by: null
                        });
                    } else {
                        throw new AppError('Tài khoản của bạn đã bị khóa', 403, ErrorCodes.ACCOUNT_LOCKED, {
                            lockReason: user.lock_reason,
                            lockedAt: user.locked_at ? new Date(user.locked_at).toISOString() : null,
                            lockedUntil: user.locked_until ? new Date(user.locked_until).toISOString() : null,
                            isPermanentLock: user.locked_until === null
                        });
                    }
                }
                // Update google_id if it's the first time linking
                if (!user.google_id) {
                    user = await authRepository.updateUser(user.id, { google_id });
                }

                if (!user.avatar_url && picture) {
                    user = await authRepository.updateUser(user.id, { avatar_url: picture });
                }
            }

            // Now proceed with normal login flow token generation
            const roles = await authRepository.findUserRoles(user.id);
            const effective = await this.resolveEffectiveRoles(user, roles);
            const accessToken = await this.generateAccessToken(user, effective.roles);
            const refreshToken = this.generateRefreshToken();
            const refreshTokenHash = this.hashToken(refreshToken);

            const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
            const deviceName = getDeviceName(deviceInfo);
            await authRepository.createSession({
                user_id: user.id,
                refresh_token_hash: refreshTokenHash,
                user_agent: deviceInfo.userAgent,
                ip_address: deviceInfo.ip,
                device_name: deviceName,
                expires_at: expiresAt,
            });

            await authRepository.updateUserIfColumnsExist(user.id, {
                last_login_at: new Date(),
                last_login_ip: deviceInfo.ip || null,
                last_login_user_agent: deviceInfo.userAgent || null,
                last_login_device: deviceName,
            });

            return { user: this.serializeAuthUser(user, effective.roles), accessToken, refreshToken };

        } catch (error) {
            // Re-throw AppErrors (e.g., ACCOUNT_LOCKED) trực tiếp,
            // không bọc lại thành lỗi generic.
            if (error instanceof AppError) {
                throw error;
            }
            logger.error('Google OAuth error', error);
            throw new AppError('Đăng nhập Google thất bại', 401, ErrorCodes.AUTH_INVALID_CREDENTIALS);
        }
    }

    async refresh(token, deviceInfo) {
        const hash = this.hashToken(token);
        const session = await authRepository.findSessionByHash(hash);

        if (!session) {
            throw new AppError('Phiên đăng nhập không hợp lệ hoặc đã hết hạn', 401, ErrorCodes.AUTH_INVALID_TOKEN);
        }

        const user = await authRepository.findUserById(session.user_id);
        if (!user) {
            throw new AppError('Không tìm thấy thông tin tài khoản', 401, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        if (user.status === 'LOCKED') {
            if (user.locked_until && new Date(user.locked_until) < new Date()) {
                await authRepository.updateUser(user.id, {
                    status: 'ACTIVE',
                    lock_reason: null,
                    locked_at: null,
                    locked_until: null,
                    locked_by: null
                });
            } else {
                throw new AppError('Tài khoản của bạn đã bị khóa', 403, ErrorCodes.ACCOUNT_LOCKED, {
                    lockReason: user.lock_reason,
                    lockedAt: user.locked_at ? new Date(user.locked_at).toISOString() : null,
                    lockedUntil: user.locked_until ? new Date(user.locked_until).toISOString() : null,
                    isPermanentLock: user.locked_until === null
                });
            }
        }

        const roles = await authRepository.findUserRoles(user.id);
        const effective = await this.resolveEffectiveRoles(user, roles);

        // Rotate token — revoke old session by its hash
        await authRepository.revokeSessionByHash(hash);

        const newAccessToken = await this.generateAccessToken(user, effective.roles);
        const newRefreshToken = this.generateRefreshToken();
        const newHash = this.hashToken(newRefreshToken);

        await authRepository.createSession({
            user_id: user.id,
            refresh_token_hash: newHash,
            user_agent: deviceInfo.userAgent,
            ip_address: deviceInfo.ip,
            device_name: getDeviceName(deviceInfo),
            expires_at: session.expires_at,
        });

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }

    async logout(token) {
        const hash = this.hashToken(token);
        const session = await authRepository.findSessionByHash(hash);
        if (session) {
            await authRepository.revokeSessionByHash(hash);
        }
    }

    async forgotPassword(email) {
        const user = await authRepository.findUserByEmail(email);
        if (!user) return; // Anti-enumeration: always return success

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date(Date.now() + (parseInt(process.env.PASSWORD_RESET_EXPIRES_IN || '3600') * 1000));
        logger.info(`[DEBUG] CREATED Reset Token: ${rawToken} -> Hash: ${tokenHash}`);

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
        logger.info(`[DEBUG] VALIDATING Reset Token: ${token} -> Hash: ${hash}`);
        const resetRecord = await authRepository.findPasswordResetToken(hash);

        if (!resetRecord) {
            logger.warn(`[DEBUG] Reset Record not found in Redis for hash: ${hash}`);
            throw new AppError('Yêu cầu đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 400, ErrorCodes.AUTH_INVALID_TOKEN);
        }

        const password_hash = await this.hashPassword(newPassword);
        await authRepository.updateUserIfColumnsExist(resetRecord.user_id, {
            password_hash,
            password_changed_at: new Date(),
        });
        await authRepository.usePasswordResetToken(resetRecord.id); // deletes key

        // Revoke all sessions after password reset
        await authRepository.revokeAllUserSessions(resetRecord.user_id);
    }

    async verifyEmail(token) {
        const hash = this.hashToken(token);
        logger.info(`[DEBUG] VALIDATING Verify Token: ${token} -> Hash: ${hash}`);

        // Fetch from Redis
        const pendingUser = await authRepository.getPendingUser(hash);
        if (!pendingUser) {
            logger.warn(`[DEBUG] Pending user not found in Redis for hash: ${hash}`);
            throw new AppError('Yêu cầu xác thực tài khoản không hợp lệ hoặc đã hết hạn', 400, ErrorCodes.AUTH_INVALID_TOKEN);
        }

        // Insert user into PostgreSQL
        const user = await authRepository.createUser({
            ...pendingUser,
            email_verified: true,
        });
        await authRepository.updateUserIfColumnsExist(user.id, {
            password_changed_at: new Date(),
        });

        // Assign the default role
        await authRepository.assignRole(user.id, 'CUSTOMER');

        // Clean up Redis
        await authRepository.deletePendingUser(hash);
    }
}

module.exports = new AuthService();
