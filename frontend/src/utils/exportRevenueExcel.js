import ExcelJS from 'exceljs'

// ─── Format Helpers ─────────────────────────────────────────────────────────

function formatVND(n) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(n) || 0)
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '—'
  }
}

function formatDayLabel(val) {
  if (!val) return ''
  const [datePart] = String(val).split('T')
  const [year, month, day] = datePart.split('-')
  return year && month && day ? `${day}/${month}` : datePart
}

function slugifyVietnamese(str, maxLen = 35) {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLen)
    .replace(/_+$/, '')
}

// ─── Offscreen Canvas Chart Generator ───────────────────────────────────────

/**
 * Renders a high-resolution revenue bar chart on an off-screen HTML5 canvas
 * and returns the base64 PNG data.
 */
function renderRevenueChartCanvas(dailyRevenue = []) {
  if (!dailyRevenue || dailyRevenue.length === 0) return null

  try {
    const canvas = document.createElement('canvas')
    const width = 860
    const height = 360
    const dpr = 2 // 2x retina sharpness
    canvas.width = width * dpr
    canvas.height = height * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)

    // 1. Dark Modern Background with subtle border
    ctx.fillStyle = '#0B1329'
    ctx.fillRect(0, 0, width, height)

    // Inner card border
    ctx.strokeStyle = '#1E293B'
    ctx.lineWidth = 1.5
    ctx.strokeRect(1, 1, width - 2, height - 2)

    // 2. Chart Header
    ctx.fillStyle = '#F8FAFC'
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif'
    ctx.fillText('BIỂU ĐỒ XU HƯỚNG DOANH THU THEO NGÀY (VND)', 24, 34)

    const totalRev = dailyRevenue.reduce((s, d) => s + Number(d.net_revenue || 0), 0)
    const totalOrders = dailyRevenue.reduce((s, d) => s + Number(d.orders || 0), 0)
    ctx.fillStyle = '#94A3B8'
    ctx.font = '12px system-ui, -apple-system, sans-serif'
    ctx.fillText(
      `Tổng doanh thu kỳ: ${formatVND(totalRev)}   |   Số đơn hàng: ${totalOrders} đơn   |   Mốc ghi nhận: ${dailyRevenue.length} ngày`,
      24,
      56,
    )

    // 3. Coordinate System & Scale
    const padLeft = 85
    const padRight = 30
    const padTop = 80
    const padBottom = 45
    const plotW = width - padLeft - padRight
    const plotH = height - padTop - padBottom

    const maxVal = Math.max(...dailyRevenue.map((d) => Number(d.net_revenue || 0)), 100_000)

    // 4. Horizontal Grid Lines & Y-Axis Labels
    const ySteps = 4
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.font = '11px system-ui, -apple-system, sans-serif'

    for (let i = 0; i <= ySteps; i++) {
      const yVal = (maxVal / ySteps) * i
      const yPos = padTop + plotH - (plotH / ySteps) * i

      // Grid line
      ctx.strokeStyle = i === 0 ? '#334155' : '#1E293B'
      ctx.lineWidth = 1
      if (i > 0) {
        ctx.setLineDash([4, 4])
      } else {
        ctx.setLineDash([])
      }
      ctx.beginPath()
      ctx.moveTo(padLeft, yPos)
      ctx.lineTo(padLeft + plotW, yPos)
      ctx.stroke()
      ctx.setLineDash([])

      // Y-axis text
      ctx.fillStyle = '#64748B'
      let yLabel = ''
      if (yVal >= 1_000_000_000) yLabel = `${(yVal / 1_000_000_000).toFixed(1)}B`
      else if (yVal >= 1_000_000) yLabel = `${(yVal / 1_000_000).toFixed(1)}M`
      else if (yVal >= 1_000) yLabel = `${(yVal / 1_000).toFixed(0)}K`
      else yLabel = `${Math.round(yVal)}`
      ctx.fillText(`${yLabel} ₫`, padLeft - 10, yPos)
    }

    // 5. Draw Bars
    const count = dailyRevenue.length
    const slotW = plotW / Math.max(count, 1)
    const barW = Math.min(Math.max(slotW * 0.58, 8), 42)

    dailyRevenue.forEach((d, i) => {
      const val = Number(d.net_revenue || 0)
      const barH = Math.max((val / maxVal) * plotH, val > 0 ? 3 : 0)
      const x = padLeft + i * slotW + (slotW - barW) / 2
      const y = padTop + plotH - barH

      const isPeak = val === maxVal && val > 0

      // Bar gradient fill
      const grad = ctx.createLinearGradient(0, y, 0, padTop + plotH)
      if (isPeak) {
        grad.addColorStop(0, '#F59E0B') // Gold Amber
        grad.addColorStop(1, '#B45309')
      } else {
        grad.addColorStop(0, '#38BDF8') // Cyan Sky
        grad.addColorStop(1, '#0284C7')
      }

      ctx.fillStyle = grad
      ctx.beginPath()
      const radius = Math.min(barW / 2, 4)
      if (barH > 4) {
        ctx.moveTo(x + radius, y)
        ctx.lineTo(x + barW - radius, y)
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius)
        ctx.lineTo(x + barW, padTop + plotH)
        ctx.lineTo(x, padTop + plotH)
        ctx.lineTo(x, y + radius)
        ctx.quadraticCurveTo(x, y, x + radius, y)
        ctx.closePath()
        ctx.fill()
      } else if (val > 0) {
        ctx.fillRect(x, padTop + plotH - 3, barW, 3)
      }

      // Peak highlight indicator dot
      if (isPeak) {
        ctx.fillStyle = '#FEF08A'
        ctx.beginPath()
        ctx.arc(x + barW / 2, y - 5, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }

      // X-Axis Labels (adaptive step so labels don't collide)
      const labelStep = Math.max(1, Math.ceil(count / 14))
      if (i % labelStep === 0 || i === count - 1) {
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#94A3B8'
        ctx.font = '10px system-ui, -apple-system, sans-serif'
        ctx.fillText(formatDayLabel(d.day), x + barW / 2, padTop + plotH + 8)
      }
    })

    return canvas.toDataURL('image/png')
  } catch (err) {
    console.warn('Canvas revenue chart generation failed:', err)
    return null
  }
}

// ─── Main Excel Export Function ──────────────────────────────────────────────

/**
 * Generates an Excel (.xlsx) financial workbook with KPIs, embedded chart,
 * daily breakdown, and event / tier breakdown tables.
 */
export async function exportOrganizerRevenueToExcel({
  overall = {},
  dashboard = {},
  dailyRevenue = [],
  byEvent = [],
  tiers = [],
  activeEvent = null,
  activeRangeLabel = '',
  organizerUser = null,
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'EventHub System'
  workbook.lastModifiedBy = organizerUser?.name || organizerUser?.email || 'Organizer'
  workbook.created = new Date()
  workbook.modified = new Date()

  const worksheet = workbook.addWorksheet('Báo cáo Doanh thu', {
    views: [{ showGridLines: true }],
    properties: { tabColor: { argb: 'FFC99A47' } },
  })

  // ── Calculate dynamic column widths ──
  const grossRev = Number(overall.gross_revenue || overall.net_revenue || 0)
  const totalPaidTickets = Number(dashboard.issued_tickets || overall.paid_tickets || 0)
  const occupancyPct = Number(dashboard.occupancy_rate || overall.occupancy_rate || 0) / 100
  const ordersCount = Number(overall.total_orders || 0)
  const avgOrderVal = ordersCount > 0 ? Math.round(grossRev / ordersCount) : 0
  const checkinRate = Number(dashboard.checkin_rate || 0) / 100

  // Calculate dynamic minimum column width for currency based on maximum value
  const maxRevenueVal = Math.max(
    grossRev,
    ...dailyRevenue.map((d) => Number(d.net_revenue || 0)),
    ...byEvent.map((e) => Number(e.gross_revenue || 0)),
    100_000,
  )
  const formattedRevSample = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(maxRevenueVal)
  const dynamicRevColWidth = Math.max(26, formattedRevSample.length + 8)

  // 1. Column Widths
  worksheet.columns = [
    { key: 'colA', width: 4 }, // margin spacer
    { key: 'colB', width: 10 }, // STT
    { key: 'colC', width: 32 }, // Date / Event Title / Tier Name
    { key: 'colD', width: 20 }, // Orders / Date / Tier Price
    { key: 'colE', width: dynamicRevColWidth }, // Daily Revenue / Orders / Tickets
    { key: 'colF', width: dynamicRevColWidth }, // Share % / Event Revenue / Tier Rev
    { key: 'colG', width: 22 }, // Notes / Discount / Occupancy
    { key: 'colH', width: 16 }, // Extra margin
  ]

  // Palette styles
  const NAVY_DARK = 'FF0F172A'
  const NAVY_HEADER = 'FF1E293B'
  const GOLD_ACCENT = 'FFE6C17A'
  const GOLD_BG = 'FFFDF8EB'
  const LIGHT_GRAY = 'FFF8FAFC'
  const BORDER_LIGHT = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  }
  const TOTAL_BORDER = {
    top: { style: 'thin', color: { argb: 'FF0F172A' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'double', color: { argb: 'FF0F172A' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  }

  function applyBoxStyle(col1, row1, col2, row2, fillArgb, border) {
    const colStartCode = col1.charCodeAt(0)
    const colEndCode = col2.charCodeAt(0)
    for (let c = colStartCode; c <= colEndCode; c++) {
      const colLetter = String.fromCharCode(c)
      for (let r = row1; r <= row2; r++) {
        const cell = worksheet.getCell(`${colLetter}${r}`)
        if (fillArgb) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
        }
        if (border) {
          cell.border = border
        }
      }
    }
  }

  // ── ROW 2: MAIN BRAND HEADER ──
  worksheet.mergeCells('B2:G2')
  const titleCell = worksheet.getCell('B2')
  titleCell.value = 'EVENTHUB · BÁO CÁO THỐNG KÊ DOANH THU & HIỆU SUẤT VẬN HÀNH'
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: GOLD_ACCENT } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_DARK } }
  worksheet.getRow(2).height = 36

  // ── ROW 3-4: METADATA ──
  const organizerName =
    organizerUser?.business_name || organizerUser?.name || organizerUser?.email || 'Nhà tổ chức EventHub'
  const eventScope = activeEvent ? activeEvent.title : 'Toàn bộ danh mục sự kiện'

  worksheet.mergeCells('B3:D3')
  worksheet.getCell('B3').value = `Nhà tổ chức: ${organizerName}`
  worksheet.getCell('B3').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }

  worksheet.mergeCells('E3:G3')
  worksheet.getCell('E3').value = `Kỳ thống kê: ${activeRangeLabel || 'Tất cả thời gian'}`
  worksheet.getCell('E3').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }
  worksheet.getCell('E3').alignment = { horizontal: 'right' }

  worksheet.mergeCells('B4:D4')
  worksheet.getCell('B4').value = `Phạm vi: ${eventScope}`
  worksheet.getCell('B4').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }

  worksheet.mergeCells('E4:G4')
  const nowFormatted = new Date().toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  worksheet.getCell('E4').value = `Thời điểm xuất: ${nowFormatted}`
  worksheet.getCell('E4').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }
  worksheet.getCell('E4').alignment = { horizontal: 'right' }

  // ── ROW 6: SECTION 1 - EXECUTIVE KPIS ──
  worksheet.mergeCells('B6:G6')
  const sec1 = worksheet.getCell('B6')
  sec1.value = '1. TỔNG QUAN CHỈ SỐ KINH DOANH (KPIS)'
  sec1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  sec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_HEADER } }
  sec1.alignment = { vertical: 'middle', indent: 1 }
  worksheet.getRow(6).height = 24

  // Row 7 & 8: Cards 1, 2, 3
  // Card 1: Tổng doanh thu (Merged B-C -> Rộng 42 ký tự, không bao giờ bị ######)
  worksheet.mergeCells('B7:C7')
  applyBoxStyle('B', 7, 'C', 7, 'FFF1F5F9', BORDER_LIGHT)
  worksheet.getCell('B7').value = 'TỔNG DOANH THU (VND)'
  worksheet.getCell('B7').font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF475569' } }
  worksheet.getCell('B7').alignment = { vertical: 'middle', horizontal: 'center' }

  worksheet.mergeCells('B8:C8')
  applyBoxStyle('B', 8, 'C', 8, GOLD_BG, BORDER_LIGHT)
  worksheet.getCell('B8').value = grossRev
  worksheet.getCell('B8').numFmt = '#,##0 "₫"'
  worksheet.getCell('B8').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } }
  worksheet.getCell('B8').alignment = { vertical: 'middle', horizontal: 'center' }

  // Card 2: Vé đã bán (Merged D-E)
  worksheet.mergeCells('D7:E7')
  applyBoxStyle('D', 7, 'E', 7, 'FFF1F5F9', BORDER_LIGHT)
  worksheet.getCell('D7').value = 'TỔNG VÉ ĐÃ BÁN'
  worksheet.getCell('D7').font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF475569' } }
  worksheet.getCell('D7').alignment = { vertical: 'middle', horizontal: 'center' }

  worksheet.mergeCells('D8:E8')
  applyBoxStyle('D', 8, 'E', 8, 'FFFFFFFF', BORDER_LIGHT)
  worksheet.getCell('D8').value = totalPaidTickets
  worksheet.getCell('D8').numFmt = '#,##0 "vé"'
  worksheet.getCell('D8').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } }
  worksheet.getCell('D8').alignment = { vertical: 'middle', horizontal: 'center' }

  // Card 3: Tỷ lệ lấp đầy (Merged F-G)
  worksheet.mergeCells('F7:G7')
  applyBoxStyle('F', 7, 'G', 7, 'FFF1F5F9', BORDER_LIGHT)
  worksheet.getCell('F7').value = 'TỶ LỆ LẤP ĐẦY'
  worksheet.getCell('F7').font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF475569' } }
  worksheet.getCell('F7').alignment = { vertical: 'middle', horizontal: 'center' }

  worksheet.mergeCells('F8:G8')
  applyBoxStyle('F', 8, 'G', 8, 'FFFFFFFF', BORDER_LIGHT)
  worksheet.getCell('F8').value = occupancyPct
  worksheet.getCell('F8').numFmt = '0.0%'
  worksheet.getCell('F8').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } }
  worksheet.getCell('F8').alignment = { vertical: 'middle', horizontal: 'center' }

  worksheet.getRow(7).height = 20
  worksheet.getRow(8).height = 28

  // Row 9 & 10: Cards 4, 5, 6
  // Card 4: Tổng đơn hàng (Merged B-C)
  worksheet.mergeCells('B9:C9')
  applyBoxStyle('B', 9, 'C', 9, 'FFF1F5F9', BORDER_LIGHT)
  worksheet.getCell('B9').value = 'TỔNG SỐ ĐƠN HÀNG'
  worksheet.getCell('B9').font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF475569' } }
  worksheet.getCell('B9').alignment = { vertical: 'middle', horizontal: 'center' }

  worksheet.mergeCells('B10:C10')
  applyBoxStyle('B', 10, 'C', 10, 'FFFFFFFF', BORDER_LIGHT)
  worksheet.getCell('B10').value = ordersCount
  worksheet.getCell('B10').numFmt = '#,##0 "đơn"'
  worksheet.getCell('B10').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } }
  worksheet.getCell('B10').alignment = { vertical: 'middle', horizontal: 'center' }

  // Card 5: Giá trị trung bình / đơn (Merged D-E)
  worksheet.mergeCells('D9:E9')
  applyBoxStyle('D', 9, 'E', 9, 'FFF1F5F9', BORDER_LIGHT)
  worksheet.getCell('D9').value = 'GIÁ TRỊ TRUNG BÌNH / ĐƠN (AOV)'
  worksheet.getCell('D9').font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF475569' } }
  worksheet.getCell('D9').alignment = { vertical: 'middle', horizontal: 'center' }

  worksheet.mergeCells('D10:E10')
  applyBoxStyle('D', 10, 'E', 10, 'FFFFFFFF', BORDER_LIGHT)
  worksheet.getCell('D10').value = avgOrderVal
  worksheet.getCell('D10').numFmt = '#,##0 "₫"'
  worksheet.getCell('D10').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } }
  worksheet.getCell('D10').alignment = { vertical: 'middle', horizontal: 'center' }

  // Card 6: Tỷ lệ Check-in (Merged F-G)
  worksheet.mergeCells('F9:G9')
  applyBoxStyle('F', 9, 'G', 9, 'FFF1F5F9', BORDER_LIGHT)
  worksheet.getCell('F9').value = 'TỶ LỆ CHECK-IN'
  worksheet.getCell('F9').font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF475569' } }
  worksheet.getCell('F9').alignment = { vertical: 'middle', horizontal: 'center' }

  worksheet.mergeCells('F10:G10')
  applyBoxStyle('F', 10, 'G', 10, 'FFFFFFFF', BORDER_LIGHT)
  worksheet.getCell('F10').value = checkinRate
  worksheet.getCell('F10').numFmt = '0.0%'
  worksheet.getCell('F10').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } }
  worksheet.getCell('F10').alignment = { vertical: 'middle', horizontal: 'center' }

  worksheet.getRow(9).height = 20
  worksheet.getRow(10).height = 28

  // ── ROW 12: SECTION 2 - REVENUE TREND CHART ──
  worksheet.mergeCells('B12:G12')
  const sec2 = worksheet.getCell('B12')
  sec2.value = '2. BIỂU ĐỒ XU HƯỚNG DOANH THU THEO NGÀY'
  sec2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  sec2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_HEADER } }
  sec2.alignment = { vertical: 'middle', indent: 1 }
  worksheet.getRow(12).height = 24

  // Render chart on canvas & embed into sheet
  let nextSectionRow = 30
  const chartBase64 = renderRevenueChartCanvas(dailyRevenue)
  if (chartBase64) {
    try {
      const cleanBase64 = chartBase64.replace(/^data:image\/png;base64,/, '')
      const imageId = workbook.addImage({
        base64: cleanBase64,
        extension: 'png',
      })
      worksheet.addImage(imageId, {
        tl: { col: 1, row: 13 }, // B14
        br: { col: 7, row: 28 }, // G29
        editAs: 'oneCell',
      })
      nextSectionRow = 30
    } catch (err) {
      console.warn('Embedding chart into worksheet failed:', err)
      nextSectionRow = 14
    }
  } else {
    worksheet.mergeCells('B13:G14')
    const noChart = worksheet.getCell('B13')
    noChart.value = 'Chưa có dữ liệu giao dịch trong khoảng thời gian này để vẽ biểu đồ.'
    noChart.alignment = { vertical: 'middle', horizontal: 'center' }
    noChart.font = { italic: true, color: { argb: 'FF94A3B8' } }
    nextSectionRow = 16
  }

  // ── SECTION 3: DAILY REVENUE BREAKDOWN TABLE ──
  worksheet.mergeCells(`B${nextSectionRow}:G${nextSectionRow}`)
  const sec3 = worksheet.getCell(`B${nextSectionRow}`)
  sec3.value = '3. BẢNG CHI TIẾT DOANH THU THEO NGÀY'
  sec3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  sec3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_HEADER } }
  sec3.alignment = { vertical: 'middle', indent: 1 }
  worksheet.getRow(nextSectionRow).height = 24
  nextSectionRow += 1

  // Table Headers
  const dailyHeaders = [
    { col: 'B', title: 'STT', align: 'center' },
    { col: 'C', title: 'Ngày giao dịch', align: 'center' },
    { col: 'D', title: 'Số đơn hàng', align: 'right' },
    { col: 'E', title: 'Doanh thu trong ngày (VND)', align: 'right' },
    { col: 'F', title: 'Tỷ trọng kỳ (%)', align: 'right' },
    { col: 'G', title: 'Ghi chú', align: 'center' },
  ]
  dailyHeaders.forEach((h) => {
    const c = worksheet.getCell(`${h.col}${nextSectionRow}`)
    c.value = h.title
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    c.alignment = { vertical: 'middle', horizontal: h.align }
    c.border = BORDER_LIGHT
  })
  worksheet.getRow(nextSectionRow).height = 22

  const dailyTableStartRow = nextSectionRow + 1
  let curRow = dailyTableStartRow

  const totalPeriodRevenue = dailyRevenue.reduce((s, d) => s + Number(d.net_revenue || 0), 0)

  if (dailyRevenue.length === 0) {
    worksheet.mergeCells(`B${curRow}:G${curRow}`)
    const emptyCell = worksheet.getCell(`B${curRow}`)
    emptyCell.value = 'Không có bản ghi doanh thu theo ngày trong khoảng thời gian này.'
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center' }
    emptyCell.font = { italic: true, color: { argb: 'FF94A3B8' } }
    worksheet.getRow(curRow).height = 24
    curRow += 1
  } else {
    dailyRevenue.forEach((item, idx) => {
      const row = worksheet.getRow(curRow)
      row.height = 20
      const isZebra = idx % 2 === 1
      const bg = isZebra ? LIGHT_GRAY : 'FFFFFFFF'

      // STT
      const cStt = worksheet.getCell(`B${curRow}`)
      cStt.value = idx + 1
      cStt.alignment = { vertical: 'middle', horizontal: 'center' }
      cStt.font = { name: 'Calibri', size: 10 }
      cStt.border = BORDER_LIGHT
      cStt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      // Date
      const cDate = worksheet.getCell(`C${curRow}`)
      cDate.value = formatDate(item.day)
      cDate.alignment = { vertical: 'middle', horizontal: 'center' }
      cDate.font = { name: 'Calibri', size: 10, bold: true }
      cDate.border = BORDER_LIGHT
      cDate.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      // Orders
      const cOrders = worksheet.getCell(`D${curRow}`)
      cOrders.value = Number(item.orders || 0)
      cOrders.numFmt = '#,##0'
      cOrders.alignment = { vertical: 'middle', horizontal: 'right' }
      cOrders.font = { name: 'Calibri', size: 10 }
      cOrders.border = BORDER_LIGHT
      cOrders.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      // Revenue
      const revVal = Number(item.net_revenue || 0)
      const cRev = worksheet.getCell(`E${curRow}`)
      cRev.value = revVal
      cRev.numFmt = '#,##0 "₫"'
      cRev.alignment = { vertical: 'middle', horizontal: 'right' }
      cRev.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
      cRev.border = BORDER_LIGHT
      cRev.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      // Share %
      const share = totalPeriodRevenue > 0 ? revVal / totalPeriodRevenue : 0
      const cShare = worksheet.getCell(`F${curRow}`)
      cShare.value = share
      cShare.numFmt = '0.0%'
      cShare.alignment = { vertical: 'middle', horizontal: 'right' }
      cShare.font = { name: 'Calibri', size: 10 }
      cShare.border = BORDER_LIGHT
      cShare.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      // Note
      const cNote = worksheet.getCell(`G${curRow}`)
      cNote.value = revVal === Math.max(...dailyRevenue.map((d) => Number(d.net_revenue || 0))) && revVal > 0 ? 'Đỉnh doanh thu ★' : '—'
      cNote.alignment = { vertical: 'middle', horizontal: 'center' }
      cNote.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FFB45309' } }
      cNote.border = BORDER_LIGHT
      cNote.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      curRow += 1
    })

    // Total Row for Daily Breakdown
    const totalRow = worksheet.getRow(curRow)
    totalRow.height = 24

    const cTotLabel = worksheet.getCell(`B${curRow}`)
    worksheet.mergeCells(`B${curRow}:C${curRow}`)
    cTotLabel.value = 'TỔNG CỘNG DOANH THU KỲ'
    cTotLabel.alignment = { vertical: 'middle', horizontal: 'center' }
    cTotLabel.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
    cTotLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotLabel.border = TOTAL_BORDER
    worksheet.getCell(`C${curRow}`).border = TOTAL_BORDER

    // Sum Orders
    const cTotOrders = worksheet.getCell(`D${curRow}`)
    cTotOrders.value = { formula: `SUM(D${dailyTableStartRow}:D${curRow - 1})` }
    cTotOrders.numFmt = '#,##0 "đơn"'
    cTotOrders.alignment = { vertical: 'middle', horizontal: 'right' }
    cTotOrders.font = { name: 'Calibri', size: 10, bold: true }
    cTotOrders.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotOrders.border = TOTAL_BORDER

    // Sum Revenue
    const cTotRev = worksheet.getCell(`E${curRow}`)
    cTotRev.value = { formula: `SUM(E${dailyTableStartRow}:E${curRow - 1})` }
    cTotRev.numFmt = '#,##0 "₫"'
    cTotRev.alignment = { vertical: 'middle', horizontal: 'right' }
    cTotRev.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } }
    cTotRev.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotRev.border = TOTAL_BORDER

    // Sum % (100%)
    const cTotPct = worksheet.getCell(`F${curRow}`)
    cTotPct.value = { formula: `SUM(F${dailyTableStartRow}:F${curRow - 1})` }
    cTotPct.numFmt = '0.0%'
    cTotPct.alignment = { vertical: 'middle', horizontal: 'right' }
    cTotPct.font = { name: 'Calibri', size: 10, bold: true }
    cTotPct.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotPct.border = TOTAL_BORDER

    const cTotNote = worksheet.getCell(`G${curRow}`)
    cTotNote.value = 'Hoàn tất'
    cTotNote.alignment = { vertical: 'middle', horizontal: 'center' }
    cTotNote.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF64748B' } }
    cTotNote.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotNote.border = TOTAL_BORDER

    curRow += 1
  }

  // ── SECTION 4: CONDITIONAL TABLE (PORTFOLIO BY EVENT OR SINGLE EVENT TIERS) ──
  curRow += 2

  if (activeEvent && tiers && tiers.length > 0) {
    // 4A. Single Event Ticket Tiers Mix
    worksheet.mergeCells(`B${curRow}:G${curRow}`)
    const sec4 = worksheet.getCell(`B${curRow}`)
    sec4.value = `4. CƠ CẤU VÀ HIỆU SUẤT HẠNG VÉ: "${activeEvent.title}"`
    sec4.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    sec4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_HEADER } }
    sec4.alignment = { vertical: 'middle', indent: 1 }
    worksheet.getRow(curRow).height = 24
    curRow += 1

    const tierHeaders = [
      { col: 'B', title: 'STT', align: 'center' },
      { col: 'C', title: 'Hạng vé', align: 'left' },
      { col: 'D', title: 'Đơn giá vé', align: 'right' },
      { col: 'E', title: 'Đã bán / Sức chứa', align: 'center' },
      { col: 'F', title: 'Doanh thu hạng vé (VND)', align: 'right' },
      { col: 'G', title: 'Tỷ lệ lấp đầy (%)', align: 'right' },
    ]
    tierHeaders.forEach((th) => {
      const c = worksheet.getCell(`${th.col}${curRow}`)
      c.value = th.title
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      c.alignment = { vertical: 'middle', horizontal: th.align }
      c.border = BORDER_LIGHT
    })
    worksheet.getRow(curRow).height = 22
    curRow += 1

    const tierStartRow = curRow
    tiers.forEach((t, idx) => {
      const sold = Number(t.sold_quantity ?? t.sold ?? 0)
      const cap = Number(t.capacity || 0)
      const price = Number(t.unit_price ?? t.price ?? 0)
      const rev = Number(t.revenue || sold * price)
      const occ = cap > 0 ? sold / cap : Number(t.occupancy_rate || 0) / 100

      const isZebra = idx % 2 === 1
      const bg = isZebra ? LIGHT_GRAY : 'FFFFFFFF'

      worksheet.getCell(`B${curRow}`).value = idx + 1
      worksheet.getCell(`B${curRow}`).alignment = { vertical: 'middle', horizontal: 'center' }
      worksheet.getCell(`B${curRow}`).font = { name: 'Calibri', size: 10 }
      worksheet.getCell(`B${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`B${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getCell(`C${curRow}`).value = t.ticket_type_name || t.name || `Hạng vé #${idx + 1}`
      worksheet.getCell(`C${curRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
      worksheet.getCell(`C${curRow}`).font = { name: 'Calibri', size: 10, bold: true }
      worksheet.getCell(`C${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`C${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getCell(`D${curRow}`).value = price
      worksheet.getCell(`D${curRow}`).numFmt = '#,##0 "₫"'
      worksheet.getCell(`D${curRow}`).alignment = { vertical: 'middle', horizontal: 'right' }
      worksheet.getCell(`D${curRow}`).font = { name: 'Calibri', size: 10 }
      worksheet.getCell(`D${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`D${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getCell(`E${curRow}`).value = `${sold} / ${cap}`
      worksheet.getCell(`E${curRow}`).alignment = { vertical: 'middle', horizontal: 'center' }
      worksheet.getCell(`E${curRow}`).font = { name: 'Calibri', size: 10 }
      worksheet.getCell(`E${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`E${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getCell(`F${curRow}`).value = rev
      worksheet.getCell(`F${curRow}`).numFmt = '#,##0 "₫"'
      worksheet.getCell(`F${curRow}`).alignment = { vertical: 'middle', horizontal: 'right' }
      worksheet.getCell(`F${curRow}`).font = { name: 'Calibri', size: 10, bold: true }
      worksheet.getCell(`F${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`F${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getCell(`G${curRow}`).value = occ
      worksheet.getCell(`G${curRow}`).numFmt = '0.0%'
      worksheet.getCell(`G${curRow}`).alignment = { vertical: 'middle', horizontal: 'right' }
      worksheet.getCell(`G${curRow}`).font = { name: 'Calibri', size: 10 }
      worksheet.getCell(`G${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`G${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getRow(curRow).height = 20
      curRow += 1
    })

    // Total Tier Row
    worksheet.mergeCells(`B${curRow}:D${curRow}`)
    const cTotTierLabel = worksheet.getCell(`B${curRow}`)
    cTotTierLabel.value = 'TỔNG CỘNG HẠNG VÉ'
    cTotTierLabel.alignment = { vertical: 'middle', horizontal: 'center' }
    cTotTierLabel.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
    cTotTierLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotTierLabel.border = TOTAL_BORDER
    worksheet.getCell(`C${curRow}`).border = TOTAL_BORDER
    worksheet.getCell(`D${curRow}`).border = TOTAL_BORDER

    worksheet.getCell(`E${curRow}`).value = '—'
    worksheet.getCell(`E${curRow}`).alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.getCell(`E${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    worksheet.getCell(`E${curRow}`).border = TOTAL_BORDER

    const cTotTierRev = worksheet.getCell(`F${curRow}`)
    cTotTierRev.value = { formula: `SUM(F${tierStartRow}:F${curRow - 1})` }
    cTotTierRev.numFmt = '#,##0 "₫"'
    cTotTierRev.alignment = { vertical: 'middle', horizontal: 'right' }
    cTotTierRev.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } }
    cTotTierRev.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotTierRev.border = TOTAL_BORDER

    const cTotTierOcc = worksheet.getCell(`G${curRow}`)
    cTotTierOcc.value = occupancyPct
    cTotTierOcc.numFmt = '0.0%'
    cTotTierOcc.alignment = { vertical: 'middle', horizontal: 'right' }
    cTotTierOcc.font = { name: 'Calibri', size: 10, bold: true }
    cTotTierOcc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotTierOcc.border = TOTAL_BORDER

    worksheet.getRow(curRow).height = 24
    curRow += 1
  } else if (byEvent && byEvent.length > 0) {
    // 4B. Portfolio Performance by Event
    worksheet.mergeCells(`B${curRow}:G${curRow}`)
    const sec4 = worksheet.getCell(`B${curRow}`)
    sec4.value = '4. BẢNG HIỆU SUẤT DOANH THU THEO TỪNG SỰ KIỆN'
    sec4.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    sec4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_HEADER } }
    sec4.alignment = { vertical: 'middle', indent: 1 }
    worksheet.getRow(curRow).height = 24
    curRow += 1

    const eventHeaders = [
      { col: 'B', title: 'STT', align: 'center' },
      { col: 'C', title: 'Tên sự kiện', align: 'left' },
      { col: 'D', title: 'Ngày bắt đầu', align: 'center' },
      { col: 'E', title: 'Số đơn hàng', align: 'right' },
      { col: 'F', title: 'Doanh thu vé (VND)', align: 'right' },
      { col: 'G', title: 'Chiết khấu đã áp dụng', align: 'right' },
    ]
    eventHeaders.forEach((eh) => {
      const c = worksheet.getCell(`${eh.col}${curRow}`)
      c.value = eh.title
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      c.alignment = { vertical: 'middle', horizontal: eh.align }
      c.border = BORDER_LIGHT
    })
    worksheet.getRow(curRow).height = 22
    curRow += 1

    const eventStartRow = curRow
    byEvent.forEach((item, idx) => {
      const gross = Number(item.gross_revenue || 0)
      const discount = Number(item.total_discount || 0)
      const orders = Number(item.total_orders || 0)
      const isZebra = idx % 2 === 1
      const bg = isZebra ? LIGHT_GRAY : 'FFFFFFFF'

      worksheet.getCell(`B${curRow}`).value = idx + 1
      worksheet.getCell(`B${curRow}`).alignment = { vertical: 'middle', horizontal: 'center' }
      worksheet.getCell(`B${curRow}`).font = { name: 'Calibri', size: 10 }
      worksheet.getCell(`B${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`B${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getCell(`C${curRow}`).value = item.event_title || `Sự kiện #${item.event_id}`
      worksheet.getCell(`C${curRow}`).alignment = { vertical: 'middle', horizontal: 'left' }
      worksheet.getCell(`C${curRow}`).font = { name: 'Calibri', size: 10, bold: true }
      worksheet.getCell(`C${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`C${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getCell(`D${curRow}`).value = formatDate(item.start_time)
      worksheet.getCell(`D${curRow}`).alignment = { vertical: 'middle', horizontal: 'center' }
      worksheet.getCell(`D${curRow}`).font = { name: 'Calibri', size: 10 }
      worksheet.getCell(`D${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`D${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getCell(`E${curRow}`).value = orders
      worksheet.getCell(`E${curRow}`).numFmt = '#,##0'
      worksheet.getCell(`E${curRow}`).alignment = { vertical: 'middle', horizontal: 'right' }
      worksheet.getCell(`E${curRow}`).font = { name: 'Calibri', size: 10 }
      worksheet.getCell(`E${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`E${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getCell(`F${curRow}`).value = gross
      worksheet.getCell(`F${curRow}`).numFmt = '#,##0 "₫"'
      worksheet.getCell(`F${curRow}`).alignment = { vertical: 'middle', horizontal: 'right' }
      worksheet.getCell(`F${curRow}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
      worksheet.getCell(`F${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`F${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getCell(`G${curRow}`).value = discount
      worksheet.getCell(`G${curRow}`).numFmt = '#,##0 "₫"'
      worksheet.getCell(`G${curRow}`).alignment = { vertical: 'middle', horizontal: 'right' }
      worksheet.getCell(`G${curRow}`).font = { name: 'Calibri', size: 10, color: { argb: discount > 0 ? 'FFB45309' : 'FF64748B' } }
      worksheet.getCell(`G${curRow}`).border = BORDER_LIGHT
      worksheet.getCell(`G${curRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }

      worksheet.getRow(curRow).height = 20
      curRow += 1
    })

    // Total Events Row
    worksheet.mergeCells(`B${curRow}:D${curRow}`)
    const cTotEvLabel = worksheet.getCell(`B${curRow}`)
    cTotEvLabel.value = 'TỔNG CỘNG TẤT CẢ SỰ KIỆN'
    cTotEvLabel.alignment = { vertical: 'middle', horizontal: 'center' }
    cTotEvLabel.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
    cTotEvLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotEvLabel.border = TOTAL_BORDER
    worksheet.getCell(`C${curRow}`).border = TOTAL_BORDER
    worksheet.getCell(`D${curRow}`).border = TOTAL_BORDER

    const cTotEvOrders = worksheet.getCell(`E${curRow}`)
    cTotEvOrders.value = { formula: `SUM(E${eventStartRow}:E${curRow - 1})` }
    cTotEvOrders.numFmt = '#,##0 "đơn"'
    cTotEvOrders.alignment = { vertical: 'middle', horizontal: 'right' }
    cTotEvOrders.font = { name: 'Calibri', size: 10, bold: true }
    cTotEvOrders.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotEvOrders.border = TOTAL_BORDER

    const cTotEvRev = worksheet.getCell(`F${curRow}`)
    cTotEvRev.value = { formula: `SUM(F${eventStartRow}:F${curRow - 1})` }
    cTotEvRev.numFmt = '#,##0 "₫"'
    cTotEvRev.alignment = { vertical: 'middle', horizontal: 'right' }
    cTotEvRev.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } }
    cTotEvRev.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotEvRev.border = TOTAL_BORDER

    const cTotEvDisc = worksheet.getCell(`G${curRow}`)
    cTotEvDisc.value = { formula: `SUM(G${eventStartRow}:G${curRow - 1})` }
    cTotEvDisc.numFmt = '#,##0 "₫"'
    cTotEvDisc.alignment = { vertical: 'middle', horizontal: 'right' }
    cTotEvDisc.font = { name: 'Calibri', size: 10, bold: true }
    cTotEvDisc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_BG } }
    cTotEvDisc.border = TOTAL_BORDER

    worksheet.getRow(curRow).height = 24
    curRow += 1
  }

  // ── FOOTER NOTICE ──
  curRow += 2
  worksheet.mergeCells(`B${curRow}:G${curRow}`)
  const footerCell = worksheet.getCell(`B${curRow}`)
  footerCell.value =
    '* Báo cáo tài chính này được trích xuất tự động từ Nền tảng Quản lý Sự kiện EventHub. Số liệu tiền tệ tính theo VND và có giá trị tại thời điểm xuất.'
  footerCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }
  footerCell.alignment = { vertical: 'middle', horizontal: 'left' }

  // ── DOWNLOAD TRIGGER ──
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const eventSlug = activeEvent
    ? slugifyVietnamese(activeEvent.title, 35)
    : 'Tat_ca_su_kien'
  const dateStr = new Date().toISOString().split('T')[0]
  a.download = `Bao_cao_doanh_thu_${eventSlug || 'Su_kien'}_${dateStr}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

