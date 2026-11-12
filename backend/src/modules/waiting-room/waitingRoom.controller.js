const ApiResponse = require('../../core/response/ApiResponse');
const waitingRoomService = require('./waitingRoom.service');
const logger = require('../../core/logger');

class WaitingRoomController {
  join = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const existingSessionId =
        req.body?.session_id ||
        req.query?.session_id ||
        req.headers['x-queue-session-id'] ||
        null;

      const ip = req.ip || req.headers['x-forwarded-for'] || null;
      const userAgent = req.headers['user-agent'] || null;

      const result = await waitingRoomService.joinQueue({
        eventId,
        userId: req.user?.sub || null,
        existingSessionId,
        ip,
        userAgent,
      });

      const message =
        result.status === 'ACTIVE'
          ? 'Đã được cấp quyền vào phòng mua vé thành công.'
          : result.status === 'WAITING'
          ? 'Đã vào phòng chờ thành công.'
          : result.message || 'Xử lý thành công.';

      res.status(200).json(ApiResponse.success(result, message));
    } catch (err) {
      next(err);
    }
  };

  status = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const sessionId =
        req.query?.sessionId ||
        req.query?.session_id ||
        req.headers['x-queue-session-id'] ||
        null;

      const result = await waitingRoomService.getQueueStatus({
        eventId,
        sessionId,
      });

      res.status(200).json(ApiResponse.success(result, 'Cập nhật trạng thái phòng chờ thành công.'));
    } catch (err) {
      next(err);
    }
  };

  leave = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const sessionId =
        req.body?.session_id ||
        req.query?.session_id ||
        req.headers['x-queue-session-id'] ||
        null;

      const result = await waitingRoomService.leaveQueue({
        eventId,
        sessionId,
      });

      res.status(200).json(ApiResponse.success(result, 'Đã rời phòng chờ.'));
    } catch (err) {
      next(err);
    }
  };

  admission = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const sessionId =
        req.query?.sessionId ||
        req.query?.session_id ||
        req.headers['x-queue-session-id'] ||
        null;

      const result = await waitingRoomService.getQueueStatus({
        eventId,
        sessionId,
      });

      res.status(200).json(ApiResponse.success(result, 'Kiểm tra quyền mua vé thành công.'));
    } catch (err) {
      next(err);
    }
  };

  stream = (req, res) => {
    const { eventId } = req.params;
    const sessionId =
      req.query?.sessionId ||
      req.query?.session_id ||
      req.headers['x-queue-session-id'] ||
      null;

    if (!sessionId) {
      res.status(400).json(ApiResponse.error('Session ID is required for stream'));
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    if (!waitingRoomService.sseClients.has(eventId)) {
      waitingRoomService.sseClients.set(eventId, new Map());
    }
    const eventClients = waitingRoomService.sseClients.get(eventId);
    eventClients.set(sessionId, res);

    // Initial ping
    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ sessionId, eventId, connectedAt: Date.now() })}\n\n`);

    // Keepalive ping interval
    const keepAliveTimer = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAliveTimer);
      eventClients.delete(sessionId);
      if (eventClients.size === 0) {
        waitingRoomService.sseClients.delete(eventId);
      }
    });
  };

  // Admin APIs
  updateConfig = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const result = await waitingRoomService.updateConfig(eventId, req.body);
      res.status(200).json(ApiResponse.success(result, 'Cập nhật cấu hình phòng chờ thành công.'));
    } catch (err) {
      next(err);
    }
  };

  getAdminStats = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const result = await waitingRoomService.getAdminStats(eventId);
      res.status(200).json(ApiResponse.success(result, 'Lấy thống kê phòng chờ thành công.'));
    } catch (err) {
      next(err);
    }
  };

  pauseQueue = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const result = await waitingRoomService.updateConfig(eventId, { is_paused: true });
      res.status(200).json(ApiResponse.success(result, 'Đã tạm dừng phòng chờ.'));
    } catch (err) {
      next(err);
    }
  };

  resumeQueue = async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const result = await waitingRoomService.updateConfig(eventId, { is_paused: false });
      res.status(200).json(ApiResponse.success(result, 'Đã mở lại phòng chờ.'));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = new WaitingRoomController();

