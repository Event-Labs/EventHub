const complaintsService = require('./complaints.service');

class ComplaintsController {
  async submitComplaint(req, res, next) {
    try {
      const userId = req.user.sub;
      const complaint = await complaintsService.createComplaint(userId, req.body);
      return res.status(201).json({
        success: true,
        message: 'Gửi khiếu nại thành công. Quản trị viên sẽ xem xét và phản hồi sớm nhất.',
        data: complaint,
      });
    } catch (err) {
      next(err);
    }
  }

  async getMyComplaints(req, res, next) {
    try {
      const userId = req.user.sub;
      const list = await complaintsService.getMyComplaints(userId);
      return res.status(200).json({
        success: true,
        data: list,
      });
    } catch (err) {
      next(err);
    }
  }

  async getAdminComplaints(req, res, next) {
    try {
      const { status, category, search, page, limit } = req.query;
      const result = await complaintsService.getAdminComplaints({
        status,
        category,
        search,
        page,
        limit,
      });
      return res.status(200).json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getComplaintDetail(req, res, next) {
    try {
      const { id } = req.params;
      const complaint = await complaintsService.getComplaintById(id);
      return res.status(200).json({
        success: true,
        data: complaint,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateComplaintStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, admin_note } = req.body;
      const adminUserId = req.user.sub;
      const updated = await complaintsService.updateComplaintStatus(id, {
        status,
        adminNote: admin_note,
        adminUserId,
      });
      return res.status(200).json({
        success: true,
        message: 'Cập nhật trạng thái khiếu nại thành công.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async getComplaintStats(req, res, next) {
    try {
      const stats = await complaintsService.getComplaintStats();
      return res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ComplaintsController();

