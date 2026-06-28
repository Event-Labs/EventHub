const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const organizerOrdersRepository = require('./organizerOrders.repository');
const organizerEventsRepository = require('./organizerEvents.repository');

const FINANCIAL_AI_URL = process.env.FINANCIAL_AI_URL || 'http://127.0.0.1:8001';

function toNumber(value) {
  return Number(value || 0);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function pickBestTicketType(ticketTypes = []) {
  return [...ticketTypes].sort((a, b) => {
    const revenueDiff = toNumber(b.revenue) - toNumber(a.revenue);
    if (revenueDiff !== 0) return revenueDiff;
    return toNumber(b.sold_quantity) - toNumber(a.sold_quantity);
  })[0];
}

function pickBestSalesDay(dailySales = []) {
  return [...dailySales].sort((a, b) => {
    const revenueDiff = toNumber(b.revenue) - toNumber(a.revenue);
    if (revenueDiff !== 0) return revenueDiff;
    return toNumber(b.tickets_sold) - toNumber(a.tickets_sold);
  })[0];
}

function buildOccupancyInsight(rate) {
  const occupancyRate = toNumber(rate);
  if (occupancyRate >= 85) {
    return `Tỷ lệ lấp đầy ${occupancyRate}% rất tích cực, cho thấy nhu cầu tham gia cao.`;
  }
  if (occupancyRate >= 60) {
    return `Tỷ lệ lấp đầy ${occupancyRate}% ở mức khá, sự kiện vẫn còn dư địa tăng thêm doanh thu.`;
  }
  if (occupancyRate >= 35) {
    return `Tỷ lệ lấp đầy ${occupancyRate}% cho thấy sự kiện còn dư địa tăng trưởng và cần tiếp tục đẩy mạnh truyền thông.`;
  }
  return `Tỷ lệ lấp đầy ${occupancyRate}% còn thấp, nhà tổ chức nên ưu tiên tăng truyền thông và ưu đãi bán vé.`;
}

function buildFallbackFinancialSummary(payload) {
  const occupancy = buildOccupancyInsight(payload.occupancy_rate);
  const recommendation =
    payload.occupancy_rate >= 60
      ? `Khuyến nghị: tiếp tục khai thác hạng vé ${payload.best_ticket_type || 'bán tốt nhất'} và tối ưu vận hành sự kiện.`
      : `Khuyến nghị: dùng hạng vé ${payload.best_ticket_type || 'bán tốt nhất'} làm điểm nhấn truyền thông và triển khai mã khuyến mãi ngắn hạn.`;

  return {
    summary:
      `Báo cáo tài chính cho sự kiện ${payload.event_title} ghi nhận doanh thu gộp ${formatMoney(payload.gross_revenue)}, ` +
      `doanh thu ròng ${formatMoney(payload.net_revenue)} sau khi trừ phí nền tảng ${formatMoney(payload.platform_fee)}. ` +
      `Sự kiện đã bán ${payload.tickets_sold} vé qua ${payload.total_orders} đơn hàng. ${occupancy} ${recommendation}`,
    insights: {
      occupancy,
      recommendation,
    },
    model: 'RULE_BASED_FALLBACK',
    adapter: null,
  };
}

function calculateSalesMomentum(dailySales = []) {
  const rows = dailySales.filter((item) => toNumber(item.tickets_sold) > 0 || toNumber(item.revenue) > 0);
  if (rows.length < 4) {
    return {
      status: 'INSUFFICIENT_DATA',
      percent_change: 0,
      label: 'Chưa đủ dữ liệu xu hướng bán vé',
    };
  }

  const midpoint = Math.floor(rows.length / 2);
  const firstHalf = rows.slice(0, midpoint);
  const secondHalf = rows.slice(midpoint);
  const firstAvg = firstHalf.reduce((sum, item) => sum + toNumber(item.revenue), 0) / Math.max(firstHalf.length, 1);
  const secondAvg = secondHalf.reduce((sum, item) => sum + toNumber(item.revenue), 0) / Math.max(secondHalf.length, 1);
  const percentChange = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

  if (percentChange >= 25) {
    return {
      status: 'ACCELERATING',
      percent_change: round(percentChange, 1),
      label: 'Doanh thu đang tăng tốc',
    };
  }
  if (percentChange <= -25) {
    return {
      status: 'SLOWING',
      percent_change: round(percentChange, 1),
      label: 'Doanh thu đang chậm lại',
    };
  }
  return {
    status: 'STABLE',
    percent_change: round(percentChange, 1),
    label: 'Doanh thu đang ổn định',
  };
}

function getRiskLevel(score) {
  if (score >= 80) return 'LOW';
  if (score >= 55) return 'MEDIUM';
  return 'HIGH';
}

function getRiskLabel(level) {
  if (level === 'LOW') return 'rủi ro thấp';
  if (level === 'MEDIUM') return 'rủi ro vừa';
  if (level === 'HIGH') return 'rủi ro cao';
  return 'chưa xác định';
}

function buildFinancialIntelligence({ payload, ticketSales, eventSales }) {
  const occupancyRate = toNumber(payload.occupancy_rate);
  const grossRevenue = toNumber(payload.gross_revenue);
  const netRevenue = toNumber(payload.net_revenue);
  const platformFee = toNumber(payload.platform_fee);
  const ticketsSold = toNumber(payload.tickets_sold);
  const totalOrders = toNumber(payload.total_orders);
  const totalCapacity = toNumber(eventSales.total_capacity);
  const avgTicketPrice = ticketsSold > 0 ? grossRevenue / ticketsSold : 0;
  const avgOrderValue = totalOrders > 0 ? grossRevenue / totalOrders : 0;
  const netMarginRate = grossRevenue > 0 ? (netRevenue / grossRevenue) * 100 : 0;
  const platformFeeRate = grossRevenue > 0 ? (platformFee / grossRevenue) * 100 : 0;
  const remainingTickets = Math.max(totalCapacity - ticketsSold, 0);
  const momentum = calculateSalesMomentum(ticketSales.daily_sales || []);

  const occupancyScore = clamp((occupancyRate / 90) * 35, 0, 35);
  const marginScore = clamp((netMarginRate / 95) * 20, 0, 20);
  const momentumScore =
    momentum.status === 'ACCELERATING'
      ? 20
      : momentum.status === 'STABLE'
        ? 14
        : momentum.status === 'SLOWING'
          ? 7
          : 10;
  const orderScore = clamp((totalOrders / 100) * 10, 0, 10);
  const ticketMixScore = payload.best_ticket_type ? 15 : 8;
  const healthScore = Math.round(occupancyScore + marginScore + momentumScore + orderScore + ticketMixScore);
  const riskLevel = getRiskLevel(healthScore);

  const dailyRows = ticketSales.daily_sales || [];
  const avgDailyRevenue = dailyRows.length
    ? dailyRows.reduce((sum, item) => sum + toNumber(item.revenue), 0) / dailyRows.length
    : 0;
  const avgDailyTickets = dailyRows.length
    ? dailyRows.reduce((sum, item) => sum + toNumber(item.tickets_sold), 0) / dailyRows.length
    : 0;
  const forecastTickets7d = Math.min(Math.round(avgDailyTickets * 7), remainingTickets || Math.round(avgDailyTickets * 7));
  const forecastRevenue7d = Math.round(avgDailyRevenue * 7);
  const whatIfTickets = Math.min(Math.max(Math.ceil(ticketsSold * 0.1), 10), remainingTickets || Math.max(Math.ceil(ticketsSold * 0.1), 10));
  const whatIfRevenue = Math.round(whatIfTickets * avgTicketPrice);

  const keyInsights = [
    `Financial Health Score đạt ${healthScore}/100, tương ứng ${getRiskLabel(riskLevel)}.`,
    `Doanh thu ròng chiếm ${round(netMarginRate, 1)}% doanh thu gộp; phí nền tảng chiếm ${round(platformFeeRate, 1)}%.`,
    momentum.label,
  ];
  if (payload.best_ticket_type) {
    keyInsights.push(`Hạng vé ${payload.best_ticket_type} đang là điểm nhấn doanh thu chính.`);
  }

  const risks = [];
  if (occupancyRate < 50) {
    risks.push('Tỷ lệ lấp đầy còn thấp, có rủi ro không khai thác hết sức chứa sự kiện.');
  }
  if (momentum.status === 'SLOWING') {
    risks.push('Tốc độ doanh thu đang chậm lại, cần can thiệp truyền thông hoặc ưu đãi sớm.');
  }
  if (grossRevenue === 0 || ticketsSold === 0) {
    risks.push('Chưa có doanh thu hoặc vé bán, cần ưu tiên kích hoạt chiến dịch bán vé.');
  }
  if (risks.length === 0) {
    risks.push('Chưa phát hiện rủi ro tài chính nghiêm trọng trong khoảng thời gian này.');
  }

  const recommendations = [];
  if (occupancyRate < 50) {
    recommendations.push(`Dùng hạng vé ${payload.best_ticket_type || 'bán tốt nhất'} làm thông điệp chính và chạy ưu đãi ngắn hạn để tăng tỷ lệ lấp đầy.`);
  } else if (occupancyRate < 80) {
    recommendations.push('Tối ưu thông điệp giá trị và mở ưu đãi nhẹ cho các hạng vé còn tồn.');
  } else {
    recommendations.push('Tập trung vận hành, check-in và trải nghiệm khách tham dự vì nhu cầu đang cao.');
  }
  if (momentum.status === 'SLOWING') {
    recommendations.push('Tạo chiến dịch remarketing trong 48-72 giờ tới để kéo lại đà bán.');
  }
  if (remainingTickets > 0 && avgTicketPrice > 0) {
    recommendations.push(`Nếu bán thêm ${whatIfTickets} vé với giá trung bình hiện tại, doanh thu gộp có thể tăng khoảng ${formatMoney(whatIfRevenue)}.`);
  }

  return {
    health_score: healthScore,
    risk_level: riskLevel,
    key_insights: keyInsights,
    risks,
    recommendations,
    momentum,
    forecast: {
      next_7_days_revenue: forecastRevenue7d,
      next_7_days_tickets: forecastTickets7d,
      confidence: dailyRows.length >= 7 ? 'MEDIUM' : 'LOW',
    },
    what_if: {
      additional_tickets: whatIfTickets,
      estimated_gross_revenue: whatIfRevenue,
      avg_ticket_price: round(avgTicketPrice, 2),
    },
    metrics: {
      avg_ticket_price: round(avgTicketPrice, 2),
      avg_order_value: round(avgOrderValue, 2),
      net_margin_rate: round(netMarginRate, 1),
      platform_fee_rate: round(platformFeeRate, 1),
      remaining_tickets: remainingTickets,
      total_capacity: totalCapacity,
    },
  };
}

class OrganizerOrdersService {
  async _resolveOrganizerId(userId) {
    const organizer = await organizerEventsRepository.findOrganizerByUserId(userId);
    if (!organizer) {
      throw new AppError('Organizer profile not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return organizer.id;
  }

  async _assertOwnsEvent(organizerId, eventId) {
    const event = await organizerEventsRepository.findEventById(eventId, organizerId);
    if (!event) {
      throw new AppError('Event not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }
    return event;
  }

  async listOrders(userId, filters) {
    const organizerId = await this._resolveOrganizerId(userId);
    if (filters.eventId) {
      await this._assertOwnsEvent(organizerId, filters.eventId);
    }
    const { items, total } = await organizerOrdersRepository.findOrdersByOrganizer(
      organizerId,
      filters,
    );
    return { items, total };
  }

  async getOrderDetail(userId, orderId) {
    const organizerId = await this._resolveOrganizerId(userId);
    const result = await organizerOrdersRepository.findOrderDetailByOrganizer(
      organizerId,
      orderId,
    );
    if (!result) {
      throw new AppError('Order not found', 404, ErrorCodes.ORDER_NOT_FOUND);
    }
    return result;
  }

  async listAttendees(userId, eventId, filters) {
    const organizerId = await this._resolveOrganizerId(userId);
    await this._assertOwnsEvent(organizerId, eventId);
    const { items, total } = await organizerOrdersRepository.findAttendeesByEvent(
      organizerId,
      eventId,
      filters,
    );
    return { items, total };
  }

  async getCheckinStats(userId, eventId) {
    const organizerId = await this._resolveOrganizerId(userId);
    await this._assertOwnsEvent(organizerId, eventId);
    return organizerOrdersRepository.getCheckinStats(organizerId, eventId);
  }

  async getRevenueStats(userId, filters = {}) {
    const organizerId = await this._resolveOrganizerId(userId);
    if (filters.eventId) {
      await this._assertOwnsEvent(organizerId, filters.eventId);
    }
    return organizerOrdersRepository.getRevenueStats(organizerId, filters);
  }

  async getTicketSalesAnalytics(userId, filters = {}) {
    const organizerId = await this._resolveOrganizerId(userId);
    if (filters.eventId) {
      await this._assertOwnsEvent(organizerId, filters.eventId);
    }
    return organizerOrdersRepository.getTicketSalesAnalytics(organizerId, filters);
  }

  async generateFinancialSummary(userId, filters = {}) {
    const organizerId = await this._resolveOrganizerId(userId);
    const event = await this._assertOwnsEvent(organizerId, filters.eventId);
    const queryFilters = {
      eventId: filters.eventId,
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null,
    };

    const [revenueStats, ticketSales] = await Promise.all([
      organizerOrdersRepository.getRevenueStats(organizerId, queryFilters),
      organizerOrdersRepository.getTicketSalesAnalytics(organizerId, queryFilters),
    ]);

    const eventRevenue = revenueStats.by_event?.[0] || {};
    const eventSales = ticketSales.by_event?.[0] || {};
    const bestTicketType = pickBestTicketType(ticketSales.by_ticket_type || []);
    const bestSalesDay = pickBestSalesDay(ticketSales.daily_sales || []);
    const payload = {
      event_title: event.title || eventRevenue.event_title || eventSales.event_title || 'Sự kiện',
      gross_revenue: toNumber(eventRevenue.gross_revenue || revenueStats.overall?.gross_revenue),
      net_revenue: toNumber(eventRevenue.net_revenue || revenueStats.overall?.net_revenue),
      platform_fee: toNumber(eventRevenue.platform_fee || revenueStats.overall?.total_platform_fee),
      tickets_sold: toNumber(ticketSales.overall?.total_tickets_sold),
      total_orders: toNumber(eventRevenue.total_orders || ticketSales.overall?.total_orders),
      occupancy_rate: toNumber(eventSales.occupancy_rate),
      best_ticket_type: bestTicketType?.ticket_type_name || '',
      best_sales_day: bestSalesDay?.day || '',
    };
    const intelligence = buildFinancialIntelligence({ payload, ticketSales, eventSales });

    let timeout = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 120000);
      const response = await fetch(`${FINANCIAL_AI_URL}/generate-financial-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Financial AI service returned ${response.status}`);
      }

      const aiResult = await response.json();
      return {
        ...aiResult,
        intelligence,
        source: 'LOCAL_AI_SERVICE',
        metrics: payload,
      };
    } catch (error) {
      const fallback = buildFallbackFinancialSummary(payload);
      return {
        ...fallback,
        intelligence,
        source: 'RULE_BASED_FALLBACK',
        warning: `Financial AI service unavailable: ${error.message}`,
        metrics: payload,
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

module.exports = new OrganizerOrdersService();
