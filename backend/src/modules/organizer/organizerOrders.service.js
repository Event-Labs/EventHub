const AppError = require('../../core/errors/AppError');
const ErrorCodes = require('../../core/errors/errorCodes');
const organizerOrdersRepository = require('./organizerOrders.repository');
const organizerEventsRepository = require('./organizerEvents.repository');
const logger = require('../../core/logger');

const aiFinancialService = require('./aiFinancial.service');

async function requestFinancialSummary(payload) {
  const aiResult = await aiFinancialService.generateFinancialSummary(payload);
  return {
    result: {
      summary: aiResult.summary,
      model: aiResult.model_version || 'qwen3-financial-v1',
      adapter: null,
    },
    source: 'LOCAL_AI_SERVICE',
  };
}

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

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function buildCsvRow(values) {
  return values.map(csvCell).join(',');
}

function safeFilenamePart(value) {
  const fallback = 'event';
  const text = String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ');
  return text || fallback;
}

function buildExportFilename(eventTitle) {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `${safeFilenamePart(eventTitle)}-attendee-list-${stamp}.csv`;
}

function formatSeat(row) {
  if (row.row_label && row.seat_number) return `${row.row_label}${row.seat_number}`;
  return 'Không có ghế';
}

function formatTicketStatus(status) {
  const labels = {
    VALID: 'Hợp lệ',
    USED: 'Đã check-in',
    CANCELLED: 'Đã hủy',
  };
  return labels[status] || status || '';
}

function buildAttendeesCsv(rows) {
  const headers = [
    'STT',
    'Tên người đặt',
    'Email người đặt',
    'Mã vé',
    'Trạng thái',
    'Loại vé',
    'Giá vé',
    'Phiên',
    'Bắt đầu',
    'Kết thúc',
    'Địa điểm',
    'Thành phố',
    'Ghế/Khu vực',
    'Mã đơn hàng',
    'Check-in lúc',
    'Ngày tạo vé',
  ];

  const lines = [
    buildCsvRow(headers),
    ...rows.map((row, index) => buildCsvRow([
      index + 1,
      row.buyer_name,
      row.buyer_email,
      row.ticket_code,
      formatTicketStatus(row.status),
      row.ticket_type_name,
      row.ticket_type_price,
      row.session_name,
      formatDateTime(row.session_start_time),
      formatDateTime(row.session_end_time),
      row.venue_name,
      row.venue_city,
      formatSeat(row),
      row.order_code,
      formatDateTime(row.checked_in_at),
      formatDateTime(row.created_at),
    ])),
  ];

  return `\uFEFF${lines.join('\r\n')}`;
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

function buildFallbackFinancialSummary(payload, intelligence) {
  const tiers = Array.isArray(intelligence?.tier_breakdown) ? intelligence.tier_breakdown : [];
  const starTier = tiers.find(t => t.status === 'Đang bán tốt') || tiers[0];
  const laggingTier = tiers.find(t => t.status === 'Chậm tiêu thụ');
  const fmt = (v) => formatMoney(v);

  const summary = `### 🎯 1. ĐÁNH GIÁ HIỆU SUẤT TÀI CHÍNH & TỶ SUẤT LỢI NHUẬN
Sự kiện "${payload.event_title}" ghi nhận tổng doanh thu gộp đạt ${fmt(payload.gross_revenue)}, trong đó doanh thu ròng thực nhận là ${fmt(payload.net_revenue)} sau khi trừ chi phí dịch vụ & nền tảng ${fmt(payload.platform_fee || payload.subscription_cost)}. Biên lợi nhuận ròng đạt ${intelligence?.metrics?.net_margin_rate || 0}%, thể hiện mức độ kiểm soát chi phí ổn định. Doanh thu trên mỗi chỗ ngồi khả dụng (RevPAS) đạt ${fmt(intelligence?.metrics?.revpas || 0)}, tương ứng hiệu suất khai thác ${intelligence?.metrics?.revpas_efficiency || 0}% so với giá vé niêm yết trung bình ${fmt(intelligence?.metrics?.avg_ticket_price || 0)}.

### 📈 2. VẬN TỐC TIÊU THỤ & ĐỘ LỆCH HẠNG VÉ
Tổng số lượng vé tiêu thụ đạt ${payload.tickets_sold} vé qua ${payload.total_orders} đơn hàng thành công, đạt tỷ lệ lấp đầy ${payload.occupancy_rate}%. Vận tốc bán vé gần nhất ghi nhận ở mức ${intelligence?.velocity?.daily_tickets || 0} vé/ngày (bình quân ${fmt(intelligence?.velocity?.daily_revenue || 0)}/ngày), trạng thái đà tăng trưởng: ${intelligence?.momentum?.label || 'Ổn định'}. Về cơ cấu danh mục, hạng vé ${starTier ? `"${starTier.name}"` : (payload.best_ticket_type || 'chủ lực')} là nguồn đóng góp doanh thu lớn nhất với tỷ trọng ${starTier?.revenue_contribution_pct || 0}% tổng doanh thu.

### ⚠️ 3. ĐIỂM NGHẼN TỒN KHO & CẢNH BÁO RỦI RO
Điểm sức khỏe tài chính đạt ${intelligence?.health_score || 0}/100 (${getRiskLabel(intelligence?.risk_level)}). Số lượng vé còn tồn trong kho là ${intelligence?.metrics?.remaining_tickets || 0} vé trên tổng sức chứa ${intelligence?.metrics?.total_capacity || payload.tickets_sold} chỗ. ${intelligence?.inventory_pacing?.days_until_event !== null && intelligence?.inventory_pacing?.days_until_event !== undefined ? `Với thời gian đếm ngược còn ${intelligence.inventory_pacing.days_until_event} ngày đến sự kiện, mức độ rủi ro tồn kho được xếp loại ${intelligence.inventory_pacing.inventory_risk_level === 'CRITICAL' ? 'RẤT CAO' : (intelligence.inventory_pacing.inventory_risk_level === 'HIGH' ? 'CAO' : 'KIỂM SOÁT ĐƯỢC')}, đòi hỏi tốc độ tiêu thụ tối thiểu ${intelligence.inventory_pacing.required_daily_tickets || 0} vé/ngày để giải phóng toàn bộ chỗ ngồi.` : 'Cần tiếp tục theo dõi sát sao tiến độ tiêu thụ theo từng mốc mở bán.'} ${laggingTier ? `Hạng vé "${laggingTier.name}" đang có tỷ lệ lấp đầy thấp (${laggingTier.occupancy_rate}%), là điểm nghẽn tồn đọng cần giải tỏa.` : ''}

### 💡 4. KẾ HOẠCH HÀNH ĐỘNG DOANH THU & ĐỊNH GIÁ ĐỘNG
1. **Tối ưu hóa giá vé & Kích cầu ngắn hạn (48h tới):** ${laggingTier ? `Kích hoạt chương trình Flash Bundle (mua 2 vé tặng kèm quyền lợi ưu đãi) hoặc voucher 10-15% cho hạng vé "${laggingTier.name}" để kích thích quyết định mua sớm.` : `Tập trung mở gói ưu đãi nhóm (Group Ticket) cho các hạng vé còn tồn để cải thiện doanh thu trung bình.`}
2. **Khai thác tệp khách tiềm năng:** Thực hiện chiến dịch tiếp thị lại (Retargeting) hướng đến người dùng đã truy cập xem trang sự kiện nhưng chưa hoàn tất đặt vé.
3. **Mục tiêu doanh thu khả thi:** Ưu tiên đẩy mạnh bán vé cho các ngày cuối tuần để tối ưu hóa tỷ lệ lấp đầy trước giờ diễn ra sự kiện.`;

  return {
    summary,
    insights: {
      occupancy: buildOccupancyInsight(payload.occupancy_rate),
      recommendation: intelligence?.recommendations?.[0] || 'Tối ưu giá vé và chiến dịch truyền thông ngắn hạn.',
    },
    model: 'RULE_BASED_FALLBACK',
    adapter: null,
  };
}

function calculateSalesMomentum(dailySales = []) {
  const rows = dailySales.filter((item) => toNumber(item.tickets_sold) > 0 || toNumber(item.revenue) > 0);
  if (rows.length < 3) {
    return {
      status: 'STABLE',
      percent_change: 0,
      label: 'Đà bán vé đang ổn định',
    };
  }

  const midpoint = Math.floor(rows.length / 2);
  const firstHalf = rows.slice(0, midpoint);
  const secondHalf = rows.slice(midpoint);
  const firstAvg = firstHalf.reduce((sum, item) => sum + toNumber(item.revenue), 0) / Math.max(firstHalf.length, 1);
  const secondAvg = secondHalf.reduce((sum, item) => sum + toNumber(item.revenue), 0) / Math.max(secondHalf.length, 1);
  const percentChange = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

  if (percentChange >= 20) {
    return {
      status: 'ACCELERATING',
      percent_change: round(percentChange, 1),
      label: `Doanh thu đang tăng tốc (+${round(percentChange, 1)}%)`,
    };
  }
  if (percentChange <= -20) {
    return {
      status: 'SLOWING',
      percent_change: round(percentChange, 1),
      label: `Doanh thu đang chậm lại (${round(percentChange, 1)}%)`,
    };
  }
  return {
    status: 'STABLE',
    percent_change: round(percentChange, 1),
    label: 'Doanh thu đang giữ nhịp ổn định',
  };
}

function getRiskLevel(score) {
  if (score >= 75) return 'LOW';
  if (score >= 50) return 'MEDIUM';
  return 'HIGH';
}

function getRiskLabel(level) {
  if (level === 'LOW') return 'RỦI RO THẤP (Sức khỏe tài chính tốt)';
  if (level === 'MEDIUM') return 'RỦI RO VỪA (Cần theo dõi sát)';
  if (level === 'HIGH') return 'RỦI RO CAO (Cần can thiệp ngay)';
  return 'Chưa xác định';
}

function buildFinancialIntelligence({ payload, ticketSales, eventSales, event }) {
  const occupancyRate = toNumber(payload.occupancy_rate);
  const grossRevenue = toNumber(payload.gross_revenue);
  const netRevenue = toNumber(payload.net_revenue);
  const subscriptionCost = toNumber(payload.subscription_cost);
  const platformFee = toNumber(payload.platform_fee || subscriptionCost);
  const ticketsSold = toNumber(payload.tickets_sold);
  const totalOrders = toNumber(payload.total_orders);
  const totalCapacity = toNumber(event?.total_capacity) || toNumber(eventSales?.total_capacity) || toNumber(ticketSales.overall?.total_capacity) || ticketsSold;
  
  // Advanced metrics
  const avgTicketPrice = ticketsSold > 0 ? Math.round(grossRevenue / ticketsSold) : 0;
  const avgOrderValue = totalOrders > 0 ? Math.round(grossRevenue / totalOrders) : 0;
  const netMarginRate = grossRevenue > 0 ? round((netRevenue / grossRevenue) * 100, 1) : 0;
  const feeRate = grossRevenue > 0 ? round((platformFee / grossRevenue) * 100, 1) : 0;
  const remainingTickets = Math.max(totalCapacity - ticketsSold, 0);

  // RevPAS: Revenue Per Available Seat (Chỉ số chuẩn quốc tế ngành sự kiện)
  const revpas = totalCapacity > 0 ? Math.round(grossRevenue / totalCapacity) : 0;
  const revpasEfficiency = avgTicketPrice > 0 ? round((revpas / avgTicketPrice) * 100, 1) : 0;

  // 7-day Velocity & Momentum
  const dailyRows = ticketSales.daily_sales || [];
  const recentDays = dailyRows.slice(-7);
  const prevDays = dailyRows.slice(-14, -7);
  const recentRevenue = recentDays.reduce((s, r) => s + toNumber(r.revenue), 0);
  const recentTickets = recentDays.reduce((s, r) => s + toNumber(r.tickets_sold), 0);
  const velocityDailyTickets = round(recentDays.length > 0 ? recentTickets / recentDays.length : (dailyRows.length > 0 ? ticketsSold / dailyRows.length : 0), 1);
  const velocityDailyRevenue = Math.round(recentDays.length > 0 ? recentRevenue / recentDays.length : (dailyRows.length > 0 ? grossRevenue / dailyRows.length : 0));
  
  let velocityGrowthPct = 0;
  if (prevDays.length > 0) {
    const prevRevenue = prevDays.reduce((s, r) => s + toNumber(r.revenue), 0);
    velocityGrowthPct = prevRevenue > 0 ? round(((recentRevenue - prevRevenue) / prevRevenue) * 100, 1) : (recentRevenue > 0 ? 100 : 0);
  }
  const momentum = calculateSalesMomentum(dailyRows);

  // Days-to-Event and Inventory Pacing
  const eventDateStr = event?.start_time || eventSales?.start_time || null;
  let daysUntilEvent = null;
  if (eventDateStr) {
    const diffMs = new Date(eventDateStr).getTime() - Date.now();
    daysUntilEvent = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }
  const requiredDailyTickets = (daysUntilEvent && daysUntilEvent > 0) ? Math.ceil(remainingTickets / daysUntilEvent) : 0;

  let inventoryRiskLevel = 'LOW';
  if (totalCapacity > 0 && remainingTickets > 0) {
    const unsoldRate = remainingTickets / totalCapacity;
    if (daysUntilEvent !== null) {
      if (daysUntilEvent <= 7 && unsoldRate > 0.35) inventoryRiskLevel = 'CRITICAL';
      else if (daysUntilEvent <= 14 && unsoldRate > 0.5) inventoryRiskLevel = 'HIGH';
      else if (daysUntilEvent <= 30 && unsoldRate > 0.7) inventoryRiskLevel = 'MEDIUM';
      else inventoryRiskLevel = 'LOW';
    } else {
      if (unsoldRate > 0.7) inventoryRiskLevel = 'MEDIUM';
      else inventoryRiskLevel = 'LOW';
    }
  }

  // Tier Breakdown & Pareto Contribution
  const tierBreakdown = (ticketSales.by_ticket_type || []).map((t) => {
    const tierRev = toNumber(t.revenue);
    const tierSold = toNumber(t.sold_quantity);
    const tierCap = toNumber(t.capacity) || tierSold;
    const occPct = tierCap > 0 ? round((tierSold / tierCap) * 100, 1) : 0;
    const revSharePct = grossRevenue > 0 ? round((tierRev / grossRevenue) * 100, 1) : 0;
    let status = 'Đang bán tốt';
    if (occPct >= 100) status = 'Hết vé (Sold Out)';
    else if (occPct < 30) status = 'Chậm tiêu thụ';
    else if (occPct < 70) status = 'Trung bình';
    return {
      id: t.ticket_type_id,
      name: t.ticket_type_name,
      price: toNumber(t.price),
      sold: tierSold,
      capacity: tierCap,
      revenue: tierRev,
      occupancy_rate: occPct,
      revenue_contribution_pct: revSharePct,
      status,
    };
  });

  // Explainable AI (XAI) Health Score Breakdown (100-point scale)
  const occupancyScore = clamp(round((occupancyRate / 90) * 30, 1), 0, 30);
  const marginScore = clamp(round((netMarginRate / 95) * 25, 1), 0, 25);
  const velocityScore = momentum.status === 'ACCELERATING' ? 20 : (momentum.status === 'STABLE' ? 14 : 7);
  const inventoryScore = inventoryRiskLevel === 'LOW' ? 15 : (inventoryRiskLevel === 'MEDIUM' ? 11 : (inventoryRiskLevel === 'HIGH' ? 6 : 2));
  const tierMixScore = tierBreakdown.length >= 3 ? 10 : (tierBreakdown.length >= 2 ? 8 : 5);
  
  const healthScore = Math.min(100, Math.round(occupancyScore + marginScore + velocityScore + inventoryScore + tierMixScore));
  const riskLevel = getRiskLevel(healthScore);

  const xaiBreakdown = {
    occupancy_component: {
      score: occupancyScore,
      max_score: 30,
      weight: '30%',
      metric_value: `${occupancyRate}%`,
      formula: 'Tỷ lệ lấp đầy đạt được so với chuẩn mục tiêu 90%',
    },
    margin_component: {
      score: marginScore,
      max_score: 25,
      weight: '25%',
      metric_value: `${netMarginRate}%`,
      formula: 'Biên lợi nhuận ròng sau phí nền tảng so với chuẩn 95%',
    },
    velocity_component: {
      score: velocityScore,
      max_score: 20,
      weight: '20%',
      metric_value: `${momentum.percent_change >= 0 ? '+' : ''}${momentum.percent_change}%`,
      formula: 'Xung lực tăng trưởng bán vé 7 ngày gần nhất',
    },
    inventory_pacing_component: {
      score: inventoryScore,
      max_score: 15,
      weight: '15%',
      metric_value: daysUntilEvent !== null ? `${daysUntilEvent} ngày còn lại` : inventoryRiskLevel,
      formula: 'Mức độ giải phóng tồn kho theo tiến độ thời gian diễn ra',
    },
    tier_mix_component: {
      score: tierMixScore,
      max_score: 10,
      weight: '10%',
      metric_value: `${tierBreakdown.length} hạng vé`,
      formula: 'Cơ cấu phân bổ doanh thu đa tầng hạng vé',
    },
    total_health_score: healthScore,
  };

  const forecastTickets7d = Math.min(Math.round(velocityDailyTickets * 7), remainingTickets || Math.round(velocityDailyTickets * 7));
  const forecastRevenue7d = Math.round(velocityDailyRevenue * 7);
  const whatIfTickets = Math.min(Math.max(Math.ceil(ticketsSold * 0.1), 10), remainingTickets || Math.max(Math.ceil(ticketsSold * 0.1), 10));
  const whatIfRevenue = Math.round(whatIfTickets * avgTicketPrice);

  const keyInsights = [
    `Financial Health Score đạt ${healthScore}/100 (${getRiskLabel(riskLevel)}).`,
    `RevPAS đạt ${formatMoney(revpas)} (hiệu suất ${revpasEfficiency}% so với giá vé trung bình).`,
    `Doanh thu ròng chiếm ${netMarginRate}% doanh thu gộp; phí dịch vụ nền tảng chiếm ${feeRate}%.`,
    momentum.label,
  ];
  if (payload.best_ticket_type) {
    keyInsights.push(`Hạng vé "${payload.best_ticket_type}" đang là động lực đóng góp doanh thu chủ đạo.`);
  }

  const risks = [];
  if (occupancyRate < 50) {
    risks.push(`Tỷ lệ lấp đầy ${occupancyRate}% còn thấp, còn tới ${remainingTickets} vé chưa được khai thác.`);
  }
  if (inventoryRiskLevel === 'CRITICAL' || inventoryRiskLevel === 'HIGH') {
    risks.push(`Cảnh báo tồn kho [${inventoryRiskLevel}]: Còn ${daysUntilEvent} ngày nữa nhưng chưa bán hết ${remainingTickets} vé (cần ${requiredDailyTickets} vé/ngày).`);
  }
  if (momentum.status === 'SLOWING') {
    risks.push('Tốc độ doanh thu đang có chiều hướng giảm sút, cần kích cầu hoặc remarketing ngay.');
  }
  if (risks.length === 0) {
    risks.push('Các chỉ số vận hành và tài chính hiện nằm trong vùng an toàn và kiểm soát tốt.');
  }

  const recommendations = [];
  const laggingTier = tierBreakdown.find((t) => t.status === 'Chậm tiêu thụ');
  if (laggingTier) {
    recommendations.push(`Kích hoạt chiến dịch combo hoặc flash discount 10-15% cho hạng vé "${laggingTier.name}" để kích thích dòng tiền.`);
  }
  if (occupancyRate < 70) {
    recommendations.push('Đẩy mạnh truyền thông số & remarketing vào khung giờ vàng (19h - 22h) để cải thiện vận tốc bán.');
  } else {
    recommendations.push('Sự kiện có nhu cầu cao: Giữ nguyên mức giá và chuẩn bị kịch bản check-in vận hành đón tiếp.');
  }
  if (remainingTickets > 0 && avgTicketPrice > 0) {
    recommendations.push(`Cơ hội mở rộng: Bán thêm ${whatIfTickets} vé sẽ gia tăng thêm xấp xỉ ${formatMoney(whatIfRevenue)} doanh thu gộp.`);
  }

  return {
    health_score: healthScore,
    risk_level: riskLevel,
    key_insights: keyInsights,
    risks,
    recommendations,
    momentum,
    xai_breakdown: xaiBreakdown,
    tier_breakdown: tierBreakdown,
    velocity: {
      daily_tickets: velocityDailyTickets,
      daily_revenue: velocityDailyRevenue,
      growth_pct: velocityGrowthPct,
      recent_7d_revenue: recentRevenue,
      recent_7d_tickets: recentTickets,
    },
    inventory_pacing: {
      days_until_event: daysUntilEvent,
      remaining_tickets: remainingTickets,
      required_daily_tickets: requiredDailyTickets,
      inventory_risk_level: inventoryRiskLevel,
    },
    forecast: {
      next_7_days_revenue: forecastRevenue7d,
      next_7_days_tickets: forecastTickets7d,
      confidence: dailyRows.length >= 7 ? 'HIGH' : (dailyRows.length >= 3 ? 'MEDIUM' : 'LOW'),
    },
    what_if: {
      additional_tickets: whatIfTickets,
      estimated_gross_revenue: whatIfRevenue,
      avg_ticket_price: avgTicketPrice,
    },
    metrics: {
      revpas,
      revpas_efficiency: revpasEfficiency,
      avg_ticket_price: avgTicketPrice,
      avg_order_value: avgOrderValue,
      net_margin_rate: netMarginRate,
      fee_rate: feeRate,
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

  async exportAttendees(userId, eventId, filters) {
    const organizerId = await this._resolveOrganizerId(userId);
    const event = await this._assertOwnsEvent(organizerId, eventId);
    const rows = await organizerOrdersRepository.findAttendeesForExport(
      organizerId,
      eventId,
      filters,
    );

    return {
      filename: buildExportFilename(event.title),
      content: buildAttendeesCsv(rows),
      total: rows.length,
    };
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
    let event = null;
    if (filters.eventId) {
      event = await this._assertOwnsEvent(organizerId, filters.eventId);
    }

    const queryFilters = {
      eventId: filters.eventId || null,
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
    const subscriptionCost = toNumber(event ? (eventRevenue.subscription_cost || 0) : (revenueStats.overall?.subscription_cost || 0));
    const platformFee = toNumber(event ? (eventRevenue.platform_fee || subscriptionCost || 0) : (revenueStats.overall?.total_platform_fee || subscriptionCost || 0));

    const payload = {
      event_title: event?.title || (filters.eventId ? 'Sự kiện' : 'Tất cả sự kiện của Organizer'),
      gross_revenue: toNumber(event ? eventRevenue.gross_revenue : revenueStats.overall?.gross_revenue),
      net_revenue: toNumber(event ? eventRevenue.net_revenue : revenueStats.overall?.net_revenue),
      platform_fee: platformFee,
      subscription_cost: subscriptionCost,
      tickets_sold: toNumber(ticketSales.overall?.total_tickets_sold),
      total_orders: toNumber(event ? eventRevenue.total_orders : (revenueStats.overall?.total_orders || ticketSales.overall?.total_orders)),
      occupancy_rate: toNumber(event ? eventSales.occupancy_rate : (revenueStats.dashboard?.occupancy_rate || eventSales.occupancy_rate)),
      best_ticket_type: bestTicketType?.ticket_type_name || '',
      best_sales_day: bestSalesDay?.day || '',
    };
    const intelligence = buildFinancialIntelligence({ payload, ticketSales, eventSales, event });

    const enrichedPayload = {
      ...payload,
      revpas: intelligence.metrics.revpas,
      revpas_efficiency: intelligence.metrics.revpas_efficiency,
      avg_ticket_price: intelligence.metrics.avg_ticket_price,
      avg_order_value: intelligence.metrics.avg_order_value,
      net_margin_rate: intelligence.metrics.net_margin_rate,
      total_capacity: intelligence.metrics.total_capacity,
      remaining_tickets: intelligence.metrics.remaining_tickets,
      velocity_daily_tickets: intelligence.velocity.daily_tickets,
      velocity_daily_revenue: intelligence.velocity.daily_revenue,
      velocity_growth_pct: intelligence.velocity.growth_pct,
      momentum_label: intelligence.momentum.label,
      days_until_event: intelligence.inventory_pacing.days_until_event,
      inventory_risk_level: intelligence.inventory_pacing.inventory_risk_level,
      required_daily_tickets: intelligence.inventory_pacing.required_daily_tickets,
      health_score: intelligence.health_score,
      risk_level: intelligence.risk_level,
      tier_breakdown: intelligence.tier_breakdown,
    };

    try {
      const { result: aiResult, source } = await requestFinancialSummary(enrichedPayload);
      return {
        ...aiResult,
        insights: aiResult.insights || {
          occupancy: buildOccupancyInsight(payload.occupancy_rate),
          recommendation: intelligence.recommendations?.[0] || '',
        },
        intelligence,
        source,
        metrics: enrichedPayload,
      };
    } catch (error) {
      logger.warn(`[FinancialSummary] AI service unavailable, using fallback: ${error.message}`);
      const fallback = buildFallbackFinancialSummary(enrichedPayload, intelligence);
      return {
        ...fallback,
        intelligence,
        source: 'RULE_BASED_FALLBACK',
        warning: `Financial AI service unavailable: ${error.message}`,
        metrics: enrichedPayload,
      };
    }
  }
}

module.exports = new OrganizerOrdersService();
