const adminProfileRepository = require('./profile.repository');
const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');

const PASSWORD_RECENT_DAYS = 90;

function isUnknownDeviceName(value) {
  const text = String(value || '').toLowerCase();
  return !text || text.includes('không xác định');
}

function getDeviceName(userAgent) {
  const ua = String(userAgent || '');
  if (!ua) return 'Thiết bị không xác định';

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
            : 'Hệ điều hành không xác định';

  const browser = /Edg\//i.test(ua)
    ? 'Microsoft Edge'
    : /OPR\//i.test(ua)
      ? 'Opera'
      : /Chrome\//i.test(ua)
        ? 'Chrome'
        : /Firefox\//i.test(ua)
          ? 'Firefox'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : 'Trình duyệt không xác định';

  return `${browser} trên ${os}`;
}

function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

function isAdminRole(role) {
  return ['ADMIN', 'SUPER_ADMIN'].includes(normalizeRole(role));
}

function buildLevel(score, total) {
  const ratio = total > 0 ? score / total : 0;

  if (ratio >= 0.8) {
    return { level: 'good', levelText: 'Tốt' };
  }

  if (ratio >= 0.5) {
    return { level: 'medium', levelText: 'Trung bình' };
  }

  return { level: 'weak', levelText: 'Yếu' };
}

function isPasswordRecent(passwordChangedAt) {
  if (!passwordChangedAt) return false;

  const changedAt = new Date(passwordChangedAt);
  if (Number.isNaN(changedAt.getTime())) return false;

  const ageMs = Date.now() - changedAt.getTime();
  const maxAgeMs = PASSWORD_RECENT_DAYS * 24 * 60 * 60 * 1000;
  return ageMs <= maxAgeMs;
}

function getPasswordAgeDays(passwordChangedAt) {
  if (!passwordChangedAt) return null;

  const changedAt = new Date(passwordChangedAt);
  if (Number.isNaN(changedAt.getTime())) return null;

  const ageMs = Math.max(Date.now() - changedAt.getTime(), 0);
  return Math.floor(ageMs / (24 * 60 * 60 * 1000));
}

function getLatestSession(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;
  return sessions[0] || null;
}

function isAccountActive(user) {
  const status = String(user.status || '').toUpperCase();
  if (status) {
    return !['LOCKED', 'INACTIVE', 'BLOCKED', 'SUSPENDED', 'DISABLED'].includes(status);
  }

  if ('is_active' in user) return user.is_active !== false;
  if ('is_blocked' in user) return user.is_blocked !== true;
  return true;
}

class AdminProfileService {
  async securityCheck(adminId) {
    const user = await adminProfileRepository.findAdminById(adminId);
    if (!user) {
      throw new AppError('Admin not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!roles.some(isAdminRole)) {
      throw new AppError('You do not have permission to perform this action', 403, ErrorCodes.AUTH_FORBIDDEN);
    }

    const [
      hasEmailVerified,
      hasTwoFactorEnabled,
      hasPasswordChangedAt,
      hasLastLoginAt,
      hasLastLoginIp,
      hasLastLoginDevice,
      hasLastLoginUserAgent,
      hasLastSecurityCheckAt,
    ] = await Promise.all([
      adminProfileRepository.hasUserColumn('email_verified'),
      adminProfileRepository.hasUserColumn('two_factor_enabled'),
      adminProfileRepository.hasUserColumn('password_changed_at'),
      adminProfileRepository.hasUserColumn('last_login_at'),
      adminProfileRepository.hasUserColumn('last_login_ip'),
      adminProfileRepository.hasUserColumn('last_login_device'),
      adminProfileRepository.hasUserColumn('last_login_user_agent'),
      adminProfileRepository.hasUserColumn('last_security_check_at'),
    ]);

    const sessions = await adminProfileRepository.listUserSessions(adminId);
    const latestSession = getLatestSession(sessions);

    const items = [];

    if (hasEmailVerified) {
      items.push({
        key: 'email_verified',
        label: 'Email đã xác minh',
        status: user.email_verified ? 'passed' : 'warning',
        message: user.email_verified
          ? 'Email của bạn đã được xác minh.'
          : 'Email của bạn chưa được xác minh.',
      });
    } else {
      items.push({
        key: 'email_verified',
        label: 'Email đã xác minh',
        status: 'warning',
        message: 'Chưa có thông tin xác minh email.',
      });
    }

    items.push({
      key: 'phone_exists',
      label: 'Số điện thoại',
      status: user.phone ? 'passed' : 'warning',
      message: user.phone
        ? 'Tài khoản đã có số điện thoại.'
        : 'Bạn nên cập nhật số điện thoại cho tài khoản.',
    });

    if (hasPasswordChangedAt) {
      const recent = isPasswordRecent(user.password_changed_at);
      items.push({
        key: 'password_recent',
        label: 'Mật khẩu',
        status: recent ? 'passed' : 'warning',
        message: recent
          ? 'Mật khẩu đã được đổi trong 90 ngày gần đây.'
          : 'Bạn nên đổi mật khẩu nếu đã quá 90 ngày.',
      });
    } else {
      items.push({
        key: 'password_recent',
        label: 'Mật khẩu',
        status: 'warning',
        message: 'Chưa có thông tin lần đổi mật khẩu gần nhất',
      });
    }

    if (hasTwoFactorEnabled) {
      items.push({
        key: 'two_factor',
        label: 'Xác thực 2 lớp',
        status: user.two_factor_enabled ? 'passed' : 'warning',
        message: user.two_factor_enabled
          ? 'Bạn đã bật xác thực 2 lớp.'
          : 'Bạn chưa bật xác thực 2 lớp.',
      });
    } else {
      items.push({
        key: 'two_factor',
        label: 'Xác thực 2 lớp',
        status: 'disabled',
        message: 'Tính năng xác thực 2 lớp chưa được hỗ trợ.',
      });
    }

    if (hasLastLoginAt) {
      items.push({
        key: 'last_login',
        label: 'Phiên đăng nhập gần nhất',
        status: user.last_login_at || latestSession ? 'passed' : 'warning',
        message: user.last_login_at || latestSession
          ? 'Tài khoản có ghi nhận phiên đăng nhập gần nhất.'
          : 'Chưa có thông tin phiên đăng nhập gần nhất.',
      });
    } else {
      items.push({
        key: 'last_login',
        label: 'Phiên đăng nhập gần nhất',
        status: 'warning',
        message: 'Chưa có thông tin phiên đăng nhập gần nhất.',
      });
    }

    const active = isAccountActive(user);
    items.push({
      key: 'account_status',
      label: 'Trạng thái tài khoản',
      status: active ? 'passed' : 'danger',
      message: active
        ? 'Tài khoản đang hoạt động bình thường.'
        : 'Tài khoản đang bị khóa hoặc không hoạt động.',
    });

    const passwordAgeDays = getPasswordAgeDays(user.password_changed_at);
    const userDeviceName = hasLastLoginDevice && user.last_login_device
      ? user.last_login_device
      : getDeviceName(hasLastLoginUserAgent ? user.last_login_user_agent : null);
    const sessionDeviceName = latestSession?.device_name || getDeviceName(latestSession?.user_agent);
    const lastLoginDevice = isUnknownDeviceName(userDeviceName) && !isUnknownDeviceName(sessionDeviceName)
      ? sessionDeviceName
      : userDeviceName;
    const lastLoginIp = (hasLastLoginIp && user.last_login_ip) || latestSession?.ip_address || null;

    items.forEach((item) => {
      if (item.key === 'password_recent' && hasPasswordChangedAt) {
        item.message = passwordAgeDays === null
          ? 'Chưa có thông tin lần đổi mật khẩu gần nhất.'
          : `Bạn đã đổi mật khẩu cách đây ${passwordAgeDays} ngày.`;
      }

      if (item.key === 'last_login' && (user.last_login_at || latestSession)) {
        item.status = 'passed';
        item.message = `Phiên đăng nhập gần nhất từ ${lastLoginDevice}.${lastLoginIp ? ` IP: ${lastLoginIp}.` : ''}`;
      }
    });

    const score = items.filter((item) => item.status === 'passed').length;
    const total = items.length;
    const level = buildLevel(score, total);

    const checkedAt = new Date();
    const result = {
      score,
      total,
      ...level,
      lastCheckedAt: checkedAt.toISOString(),
      items,
    };

    if (hasLastSecurityCheckAt || await adminProfileRepository.hasUserColumn('security_check_result')) {
      await adminProfileRepository.updateSecurityCheckSnapshot(adminId, checkedAt, result);
    }

    return result;
  }

  async getSecurityStatus(adminId) {
    const user = await adminProfileRepository.findAdminById(adminId);
    if (!user) {
      throw new AppError('Admin not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!roles.some(isAdminRole)) {
      throw new AppError('You do not have permission to perform this action', 403, ErrorCodes.AUTH_FORBIDDEN);
    }

    const hasSecurityCheckResult = await adminProfileRepository.hasUserColumn('security_check_result');
    if (!hasSecurityCheckResult || !user.security_check_result) {
      return {
        score: 0,
        total: 0,
        level: '',
        levelText: 'Chưa kiểm tra',
        lastCheckedAt: user.last_security_check_at ? new Date(user.last_security_check_at).toISOString() : null,
        items: [],
      };
    }

    return {
      ...user.security_check_result,
      lastCheckedAt: user.security_check_result.lastCheckedAt
        || (user.last_security_check_at ? new Date(user.last_security_check_at).toISOString() : null),
    };
  }

  async listSessions(adminId) {
    const user = await adminProfileRepository.findAdminById(adminId);
    if (!user) {
      throw new AppError('Admin not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!roles.some(isAdminRole)) {
      throw new AppError('You do not have permission to perform this action', 403, ErrorCodes.AUTH_FORBIDDEN);
    }

    const sessions = await adminProfileRepository.listUserSessions(adminId);
    return sessions.map((session) => {
      const parsedDeviceName = getDeviceName(session.user_agent);
      return {
        id: session.id,
        device_name: isUnknownDeviceName(session.device_name) ? parsedDeviceName : session.device_name,
        ip_address: session.ip_address || null,
        created_at: session.created_at || null,
        expires_at: session.expires_at || null,
      };
    });
  }
}

module.exports = new AdminProfileService();
