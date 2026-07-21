const bcrypt = require('bcryptjs');
const authRepository = require('../auth/auth.repository');
const authService = require('../auth/auth.service');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

const PASSWORD_RECENT_DAYS = 90;
const USER_2FA_OTP_KEY = 'user_2fa_otp';

function normalizeRole(role) {
    return String(role || '').toUpperCase();
}

function isPasswordRecent(passwordChangedAt) {
    if (!passwordChangedAt) return false;
    const changedAt = new Date(passwordChangedAt);
    if (Number.isNaN(changedAt.getTime())) return false;
    return Date.now() - changedAt.getTime() <= PASSWORD_RECENT_DAYS * 24 * 60 * 60 * 1000;
}

function getPasswordAgeDays(passwordChangedAt) {
    if (!passwordChangedAt) return null;
    const changedAt = new Date(passwordChangedAt);
    if (Number.isNaN(changedAt.getTime())) return null;
    return Math.floor(Math.max(Date.now() - changedAt.getTime(), 0) / (24 * 60 * 60 * 1000));
}

function isAccountActive(user) {
    const status = String(user.status || '').toUpperCase();
    return !['LOCKED', 'INACTIVE', 'BLOCKED', 'SUSPENDED', 'DISABLED'].includes(status);
}

class UserService {
    async hashPassword(password) {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS || '12'));
        return bcrypt.hash(password, salt);
    }

    validateVietnamesePhone(phone) {
        if (!phone) return true; // Phone is optional in some cases, but if provided it must be valid
        const regex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;
        return regex.test(phone);
    }

    normalizePhone(phone) {
        if (!phone) return phone;
        if (phone.startsWith('+84')) {
            return '0' + phone.slice(3);
        }
        return phone;
    }

    async getProfile(userId) {
        const user = await authRepository.findUserById(userId);
        if (!user) {
            throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        const { password_hash, deleted_at, ...profile } = user;
        const roles = await authRepository.findUserRoles(userId);
        
        // hasPassword is true if the user has a real password hash (not null, empty, or '*')
        const hasPassword = !!(password_hash && password_hash !== '*');
        
        return { ...profile, roles, hasPassword };
    }

    async updateProfile(userId, updateData) {
        // Only allow certain fields to be updated
        const allowedFields = ['full_name', 'phone', 'address', 'dob', 'city', 'avatar_url', 'bio'];
        const updates = {};

        if ('full_name' in updateData) {
            const fullName = String(updateData.full_name || '').trim();
            if (!fullName) {
                throw new AppError('Vui lòng nhập họ và tên.', 400, ErrorCodes.BAD_REQUEST);
            }
            updateData.full_name = fullName;
        }
        
        if ('phone' in updateData) {
            const phone = String(updateData.phone || '').trim();
            if (!phone) {
                updateData.phone = null;
            } else if (!this.validateVietnamesePhone(phone)) {
                throw new AppError('Số điện thoại không đúng định dạng Việt Nam. Vui lòng nhập theo dạng 09xxxxxxxx hoặc +849xxxxxxxx.', 400, ErrorCodes.BAD_REQUEST);
            } else {
                updateData.phone = this.normalizePhone(phone);
            }
        }

        ['address', 'dob', 'city', 'avatar_url', 'bio'].forEach((field) => {
            if (field in updateData && typeof updateData[field] === 'string' && !updateData[field].trim()) {
                updateData[field] = null;
            }
        });

        Object.keys(updateData).forEach(key => {
            if (allowedFields.includes(key)) {
                updates[key] = updateData[key];
            }
        });

        if (Object.keys(updates).length === 0) {
            throw new AppError('No valid fields to update', 400, ErrorCodes.BAD_REQUEST);
        }

        const updatedUser = await authRepository.updateUser(userId, updates);
        
        const { password_hash, deleted_at, ...profile } = updatedUser;
        const roles = await authRepository.findUserRoles(userId);
        const hasPassword = !!(password_hash && password_hash !== '*');
        
        return { ...profile, roles, hasPassword };
    }

    async changePassword(userId, currentPassword, newPassword) {
        const user = await authRepository.findUserById(userId);
        if (!user) {
            throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        const hasPassword = !!(user.password_hash && user.password_hash !== '*');

        if (hasPassword) {
            if (!currentPassword) {
                throw new AppError('Bắt buộc nhập mật khẩu hiện tại', 400, ErrorCodes.BAD_REQUEST);
            }
            const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isMatch) {
                throw new AppError('Mật khẩu hiện tại không chính xác', 400, ErrorCodes.AUTH_INVALID_CREDENTIALS);
            }

            // Check if new password is same as old
            const isSame = await bcrypt.compare(newPassword, user.password_hash);
            if (isSame) {
                throw new AppError('Mật khẩu mới không được trùng với mật khẩu cũ', 400, ErrorCodes.BAD_REQUEST);
            }
        }

        // Validate password strength
        if (newPassword.length < 6) {
            throw new AppError('Mật khẩu mới phải có ít nhất 6 ký tự', 400, ErrorCodes.BAD_REQUEST);
        }

        const password_hash = await this.hashPassword(newPassword);
        await authRepository.updateUserIfColumnsExist(userId, {
            password_hash,
            password_changed_at: new Date(),
        });
        
        // Revoke all sessions after password change for security
        await authRepository.revokeAllUserSessions(userId);
    }

    async buildSecuritySnapshot(userId, saveSnapshot = false) {
        const user = await authRepository.findUserById(userId);
        if (!user) {
            throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        const roles = (await authRepository.findUserRoles(userId)).map(normalizeRole);
        const [
            hasEmailVerified,
            hasTwoFactorEnabled,
            hasPasswordChangedAt,
            hasLastLoginAt,
            hasLastSecurityCheckAt,
            hasSecurityCheckResult,
        ] = await Promise.all([
            authRepository.userColumnExists('email_verified'),
            authRepository.userColumnExists('two_factor_enabled'),
            authRepository.userColumnExists('password_changed_at'),
            authRepository.userColumnExists('last_login_at'),
            authRepository.userColumnExists('last_security_check_at'),
            authRepository.userColumnExists('security_check_result'),
        ]);

        let passwordChangedAt = hasPasswordChangedAt ? user.password_changed_at : null;
        const hasRealPassword = Boolean(user.password_hash && user.password_hash !== '*');
        if (hasPasswordChangedAt && !passwordChangedAt && hasRealPassword) {
            const updatedUser = await authRepository.updateUserIfColumnsExist(userId, {
                password_changed_at: user.created_at || new Date(),
            });
            passwordChangedAt = updatedUser?.password_changed_at || user.created_at || null;
        }

        const passwordAgeDays = getPasswordAgeDays(passwordChangedAt);
        const items = [];

        items.push({
            key: 'email_verified',
            label: 'Email đã xác minh',
            status: hasEmailVerified && user.email_verified ? 'passed' : 'warning',
            message: hasEmailVerified && user.email_verified
                ? 'Email của bạn đã được xác minh.'
                : 'Email của bạn chưa được xác minh.',
        });

        items.push({
            key: 'phone_exists',
            label: 'Số điện thoại',
            status: user.phone ? 'passed' : 'warning',
            message: user.phone
                ? 'Tài khoản đã có số điện thoại.'
                : 'Bạn nên cập nhật số điện thoại cho tài khoản.',
        });

        items.push({
            key: 'password_recent',
            label: 'Mật khẩu',
            status: hasPasswordChangedAt && isPasswordRecent(passwordChangedAt) ? 'passed' : 'warning',
            message: passwordAgeDays === null
                ? 'Chưa có thông tin lần đổi mật khẩu gần nhất.'
                : `Bạn đã đổi mật khẩu cách đây ${passwordAgeDays} ngày.`,
        });

        items.push({
            key: 'two_factor',
            label: 'Xác thực 2 lớp',
            status: hasTwoFactorEnabled && user.two_factor_enabled ? 'passed' : 'warning',
            message: hasTwoFactorEnabled && user.two_factor_enabled
                ? 'Tài khoản đã bật xác thực 2 lớp qua OTP email.'
                : 'Bạn chưa bật xác thực 2 lớp.',
        });

        items.push({
            key: 'last_login',
            label: 'Phiên đăng nhập gần nhất',
            status: hasLastLoginAt && user.last_login_at ? 'passed' : 'warning',
            message: hasLastLoginAt && user.last_login_at
                ? 'Tài khoản có ghi nhận phiên đăng nhập gần nhất.'
                : 'Chưa có thông tin phiên đăng nhập gần nhất.',
        });

        items.push({
            key: 'account_status',
            label: 'Trạng thái tài khoản',
            status: isAccountActive(user) ? 'passed' : 'danger',
            message: isAccountActive(user)
                ? 'Tài khoản đang hoạt động bình thường.'
                : 'Tài khoản đang bị khóa hoặc không hoạt động.',
        });

        const score = items.filter((item) => item.status === 'passed').length;
        const total = items.length;
        const ratio = total > 0 ? score / total : 0;
        const level = ratio >= 0.8
            ? { level: 'good', levelText: 'Tốt' }
            : ratio >= 0.5
                ? { level: 'medium', levelText: 'Trung bình' }
                : { level: 'weak', levelText: 'Yếu' };

        const checkedAt = new Date();
        const result = {
            score,
            total,
            ...level,
            roles,
            lastCheckedAt: checkedAt.toISOString(),
            items,
        };

        if (saveSnapshot && (hasLastSecurityCheckAt || hasSecurityCheckResult)) {
            await authRepository.updateUserIfColumnsExist(userId, {
                last_security_check_at: checkedAt,
                security_check_result: result,
            });
        }

        return result;
    }

    async getSecurityStatus(userId) {
        const user = await authRepository.findUserById(userId);
        if (!user) {
            throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        if (await authRepository.userColumnExists('security_check_result') && user.security_check_result) {
            return {
                ...user.security_check_result,
                lastCheckedAt: user.security_check_result.lastCheckedAt
                    || (user.last_security_check_at ? new Date(user.last_security_check_at).toISOString() : null),
            };
        }

        return this.buildSecuritySnapshot(userId, false);
    }

    async checkSecurity(userId) {
        return this.buildSecuritySnapshot(userId, true);
    }

    async startTwoFactorSetup(userId, enabled) {
        const user = await authRepository.findUserById(userId);
        if (!user) {
            throw new AppError('User not found', 404, ErrorCodes.AUTH_USER_NOT_FOUND);
        }

        if (!await authRepository.userColumnExists('two_factor_enabled')) {
            throw new AppError('Two-factor authentication is not supported', 400, ErrorCodes.INVALID_INPUT);
        }

        if (!user.email_verified) {
            throw new AppError('Email must be verified before enabling two-factor authentication', 400, ErrorCodes.AUTH_EMAIL_NOT_VERIFIED);
        }

        const targetEnabled = Boolean(enabled);
        if (Boolean(user.two_factor_enabled) === targetEnabled) {
            return { alreadyEnabled: targetEnabled, enabled: targetEnabled };
        }

        return authService.createOtpChallenge(USER_2FA_OTP_KEY, {
            userId: user.id,
            email: user.email,
            enabled: targetEnabled,
            subject: targetEnabled
                ? 'Ma OTP bat xac thuc 2 lop EventHub'
                : 'Ma OTP tat xac thuc 2 lop EventHub',
        });
    }

    async verifyTwoFactorSetup(userId, challengeId, otp) {
        const challenge = await authService.consumeOtpChallenge(USER_2FA_OTP_KEY, challengeId, otp);
        if (challenge.userId !== userId) {
            throw new AppError('Ma OTP khong hop le', 403, ErrorCodes.AUTH_FORBIDDEN);
        }

        const updated = await authRepository.updateUserIfColumnsExist(userId, {
            two_factor_enabled: Boolean(challenge.enabled),
        });
        await this.checkSecurity(userId);

        return {
            enabled: Boolean(updated?.two_factor_enabled ?? challenge.enabled),
        };
    }
}

module.exports = new UserService();
