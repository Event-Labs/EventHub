const authRepository = require('../auth/auth.repository');

class AdminProfileRepository {
  async findAdminById(userId) {
    const user = await authRepository.findUserById(userId);
    if (!user) return null;

    const roles = await authRepository.findUserRoles(userId);
    return { ...user, roles };
  }

  async hasUserColumn(columnName) {
    return authRepository.userColumnExists(columnName);
  }

  async updateSecurityCheckSnapshot(userId, checkedAt, result) {
    return authRepository.updateUserIfColumnsExist(userId, {
      last_security_check_at: checkedAt,
      security_check_result: result,
    });
  }

  async listUserSessions(userId) {
    return authRepository.listUserSessions(userId);
  }
}

module.exports = new AdminProfileRepository();
