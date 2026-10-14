const {
  normalizeRules,
  validateSelectedSeats,
  isAvailableSeat,
  sortSeats,
  positionValue,
  seatId,
  rowId,
} = require('./seatingRules');

class SeatAllocationService {
  /**
   * Normalize natural user input for row letter
   * e.g.: "hàng C", "Hàng c", "hàng ghế C", "row C", "C" -> "C"
   */
  cleanRowLabel(str) {
    if (!str || typeof str !== 'string') return null;
    const s = str.trim();
    if (/(?:trung\s*tâm|trung\s*tam|trung|giữa|giua|đầu|dau|cuối|cuoi|vip|bất\s*kỳ|gần\s*sân\s*khấu|center)/i.test(s)) {
      return null;
    }
    const match = s.match(/(?:hàng\s*(?:ghế\s*)?|row\s*)([a-zA-Z\d]{1,3})\b/i) || s.match(/^([a-zA-Z\d]{1,3})$/i);
    return match ? match[1].toUpperCase() : null;
  }

  /**
   * Distance between two row labels (e.g. 'C' and 'D' = 1, 'C' and 'B' = 1)
   */
  _rowDistance(rowA, rowB) {
    if (!rowA || !rowB) return 999;
    const codeA = rowA.charCodeAt(0);
    const codeB = rowB.charCodeAt(0);
    return Math.abs(codeA - codeB);
  }

  /**
   * Allocate best available seats honoring dynamic organizer seating_rules
   * @param {Array} allSessionSeats List of all session_seats in the session
   * @param {Object} rawRules event.seating_rules configured by Organizer
   * @param {Array} ticketTypes Available ticket_types for the event/session
   * @param {Object} options { quantity, preferredRow, ticketTypeId, isCenterPreferred }
   */
  allocateSeats(allSessionSeats, rawRules, ticketTypes = [], options = {}) {
    const rules = normalizeRules(rawRules);
    const quantity = Math.max(1, parseInt(options.quantity, 10) || 1);
    const preferredRow = this.cleanRowLabel(options.preferredRow);
    const isCenterPreferred = /(?:trung|giữa|giua|center)/i.test(options.preferredRow || '') || Boolean(options.isCenterPreferred);
    const requestedTicketTypeId = options.ticketTypeId || null;

    // 1. FAST-FAIL: max_tickets_per_order
    if (rules.max_tickets_per_order && quantity > rules.max_tickets_per_order) {
      return {
        success: false,
        code: 'EXCEEDS_MAX_TICKETS',
        maxTickets: rules.max_tickets_per_order,
        message: `Sự kiện này Ban tổ chức quy định giới hạn tối đa ${rules.max_tickets_per_order} vé cho mỗi lần đặt.`
      };
    }

    // Sort ticket types by price ascending (cheapest first)
    const sortedTicketTypes = [...ticketTypes]
      .filter(t => t.is_seated !== false)
      .sort((a, b) => Number(a.price) - Number(b.price));

    const cheapestOnly = options.cheapestOnly === true;

    // 2. Filter available seats
    let availableSeats = (allSessionSeats || []).filter(s => isAvailableSeat(s));

    if (requestedTicketTypeId) {
      availableSeats = availableSeats.filter(s =>
        !s.ticket_type_ids ||
        s.ticket_type_ids.length === 0 ||
        s.ticket_type_ids.map(String).includes(String(requestedTicketTypeId))
      );
    } else if (cheapestOnly && sortedTicketTypes.length > 0) {
      const cheapestId = String(sortedTicketTypes[0].id);
      const filteredCheapest = availableSeats.filter(s =>
        !s.ticket_type_ids ||
        s.ticket_type_ids.length === 0 ||
        s.ticket_type_ids.map(String).includes(cheapestId)
      );
      if (filteredCheapest.length >= quantity) {
        availableSeats = filteredCheapest;
      }
    }

    if (availableSeats.length < quantity) {
      return {
        success: false,
        code: 'NOT_ENOUGH_AVAILABLE',
        availableCount: availableSeats.length,
        message: `Sự kiện hiện chỉ còn ${availableSeats.length} ghế trống, không đủ ${quantity} ghế như bạn yêu cầu.`
      };
    }

    // 3. Group and sort seats by row
    const rowMap = new Map();
    for (const seat of availableSeats) {
      const r = String(rowId(seat) || '').toUpperCase();
      if (!rowMap.has(r)) rowMap.set(r, []);
      rowMap.get(r).push(seat);
    }
    for (const [r, list] of rowMap.entries()) {
      rowMap.set(r, sortSeats(list));
    }

    const physicalRowMap = new Map();
    for (const seat of allSessionSeats || []) {
      const r = String(rowId(seat) || '').toUpperCase();
      if (!physicalRowMap.has(r)) physicalRowMap.set(r, []);
      physicalRowMap.get(r).push(seat);
    }

    // Helper validator using EventHub's core seatingRules engine
    const testCandidate = (candidateSeats) => {
      const issues = validateSelectedSeats({
        rules,
        selectedSeats: candidateSeats,
        eligibleSeats: allSessionSeats,
      });
      return { valid: issues.length === 0, issues };
    };

    let selectedCandidate = null;
    let isPreferredRow = false;
    let alternativeRow = null;
    let note = null;

    // Detect horizontal position preference within the row
    let horizontalPref = 'CENTER';
    if (options.horizontalPreference) {
      horizontalPref = options.horizontalPreference;
    } else if (/(?:bên\s*trái|lệch\s*trái|phía\s*trái|tay\s*trái)/i.test(options.userMessage || options.preferredRow || '')) {
      horizontalPref = 'LEFT';
    } else if (/(?:bên\s*phải|lệch\s*phải|phía\s*phải|tay\s*phải)/i.test(options.userMessage || options.preferredRow || '')) {
      horizontalPref = 'RIGHT';
    }

    // STRATEGY A: User specified a preferred row (e.g. "Hàng C")
    if (preferredRow && rowMap.has(preferredRow)) {
      const rowSeats = rowMap.get(preferredRow);
      const physicalRow = physicalRowMap.get(preferredRow);
      const candidate = this._findBestContiguousSlice(rowSeats, quantity, testCandidate, physicalRow, horizontalPref);
      if (candidate) {
        selectedCandidate = candidate;
        isPreferredRow = true;
      } else if (!rules.require_adjacent_seats && !rules.disallow_single_seat_left && rowSeats.length >= quantity) {
        // Can take non-contiguous seats if event rules allow it
        const slice = rowSeats.slice(0, quantity);
        if (testCandidate(slice).valid) {
          selectedCandidate = slice;
          isPreferredRow = true;
          note = `Các ghế ở hàng ${preferredRow} hiện không còn liền kề nhau nhưng vẫn thuộc cùng hàng theo yêu cầu của bạn.`;
        }
      }
    }

    // STRATEGY B: Try other rows
    if (!selectedCandidate) {
      // Sort rows by preference/proximity
      const allRowNames = [...rowMap.keys()];
      if (preferredRow && rowMap.has(preferredRow)) {
        allRowNames.sort((a, b) => this._rowDistance(a, preferredRow) - this._rowDistance(b, preferredRow));
      } else if (isCenterPreferred && allRowNames.length > 0) {
        // Sort by proximity to median center row
        allRowNames.sort();
        const midIdx = Math.floor(allRowNames.length / 2);
        const centerRow = allRowNames[midIdx];
        allRowNames.sort((a, b) => this._rowDistance(a, centerRow) - this._rowDistance(b, centerRow));
      } else {
        // Natural alphabetical order (A, B, C...)
        allRowNames.sort();
      }

      for (const rowName of allRowNames) {
        if (preferredRow && rowName === preferredRow) continue; // already tested
        const rowSeats = rowMap.get(rowName);
        const physicalRow = physicalRowMap.get(rowName);
        const candidate = this._findBestContiguousSlice(rowSeats, quantity, testCandidate, physicalRow, horizontalPref);
        if (candidate) {
          selectedCandidate = candidate;
          isPreferredRow = false;
          alternativeRow = rowName;
          if (preferredRow) {
            note = `Hàng ${preferredRow} không còn đủ ${quantity} ghế thỏa mãn quy định sự kiện, Eve đã chọn hàng ${rowName} đẹp nhất cho bạn!`;
          } else if (isCenterPreferred) {
            note = `Eve đã ưu tiên chọn các vị trí chính giữa hàng ${rowName} với góc nhìn trung tâm trực diện sân khấu nhất cho bạn!`;
          }
          break;
        }
      }
    }

    // STRATEGY C: If event DOES NOT require same row and NOT require adjacent seats
    if (!selectedCandidate && !rules.require_same_row && !rules.require_adjacent_seats) {
      const mixedSeats = [];
      for (const [_, list] of rowMap.entries()) {
        for (const seat of list) {
          mixedSeats.push(seat);
          if (mixedSeats.length === quantity) {
            if (testCandidate(mixedSeats).valid) {
              selectedCandidate = mixedSeats;
              isPreferredRow = false;
              note = 'Sự kiện cho phép chọn ghế ở các hàng khác nhau, Eve đã chọn các vị trí tốt nhất cho bạn!';
              break;
            }
          }
        }
        if (selectedCandidate) break;
      }
    }

    if (!selectedCandidate) {
      let failMessage = 'Không tìm thấy vị trí ghế nào thỏa mãn đồng thời các quy tắc của sự kiện.';
      if (rules.require_adjacent_seats) {
        failMessage = `Sự kiện yêu cầu các ghế phải liền kề nhau và cùng hàng, hiện không còn ${quantity} ghế trống liền kề nào thỏa mãn.`;
      } else if (rules.require_same_row) {
        failMessage = `Sự kiện yêu cầu các ghế phải thuộc cùng một hàng, hiện không còn hàng ghế nào đủ ${quantity} chỗ trống.`;
      }
      return {
        success: false,
        code: 'NO_VALID_SEATS',
        message: failMessage,
        rulesApplied: rules
      };
    }

    // Map each allocated seat to its ticketType and calculate total price
    const enrichedSeats = selectedCandidate.map((seat) => {
      const mappedTicketIds = seat.ticket_type_ids || [];
      let matchedTicket = null;
      if (requestedTicketTypeId && mappedTicketIds.map(String).includes(String(requestedTicketTypeId))) {
        matchedTicket = ticketTypes.find(t => String(t.id) === String(requestedTicketTypeId));
      }
      if (!matchedTicket) {
        matchedTicket = sortedTicketTypes.find(t => mappedTicketIds.map(String).includes(String(t.id)));
      }
      if (!matchedTicket) {
        matchedTicket = sortedTicketTypes[0] || ticketTypes[0];
      }
      return {
        id: seatId(seat),
        session_seat_id: seat.session_seat_id,
        seat_id: seat.seat_id,
        label: seat.label || `${seat.row_label}${seat.seat_number}`,
        row_label: seat.row_label,
        seat_number: seat.seat_number,
        ticketType: matchedTicket || null,
        price: Number(matchedTicket?.price || 0),
        zone: seat.zone || null,
        seat_type: seat.seat_type || null,
      };
    });

    const totalAmount = enrichedSeats.reduce((sum, s) => sum + s.price, 0);

    // Group items for booking draft & holdSeats payload:
    // Format: [{ ticket_type_id, quantity, session_seat_ids }]
    const itemGroups = new Map();
    for (const seat of enrichedSeats) {
      const tId = seat.ticketType?.id || 'default';
      if (!itemGroups.has(tId)) {
        itemGroups.set(tId, {
          ticketType: seat.ticketType,
          quantity: 0,
          sessionSeatIds: [],
          seatLabels: []
        });
      }
      const grp = itemGroups.get(tId);
      grp.quantity += 1;
      grp.sessionSeatIds.push(seat.session_seat_id);
      grp.seatLabels.push(seat.label);
    }

    const items = [...itemGroups.values()].map(g => ({
      ticket_type_id: g.ticketType?.id,
      ticketType: g.ticketType,
      quantity: g.quantity,
      session_seat_ids: g.sessionSeatIds,
      sessionSeatIds: g.sessionSeatIds,
      seatLabels: g.seatLabels
    }));

    return {
      success: true,
      seats: enrichedSeats,
      items,
      totalAmount,
      isPreferredRow,
      alternativeRow,
      note,
      rulesApplied: rules
    };
  }

  /**
   * Helper: Find the best contiguous slice in rowSeats that passes the validation callback.
   * Prioritizes slices closest to the center of the physical row by default (or left/right if preferred).
   */
  _findBestContiguousSlice(rowSeats, quantity, validator, allPhysicalRowSeats = null, preference = 'CENTER') {
    if (!rowSeats || rowSeats.length < quantity) return null;

    // Determine the physical row bounds and midpoint
    const refSeats = (allPhysicalRowSeats && allPhysicalRowSeats.length > 0) ? allPhysicalRowSeats : rowSeats;
    const sortedRef = sortSeats(refSeats);
    const minPos = positionValue(sortedRef[0]);
    const maxPos = positionValue(sortedRef[sortedRef.length - 1]);
    const rowCenter = (minPos + maxPos) / 2;

    const validCandidates = [];

    // Sliding window of size `quantity`
    for (let i = 0; i <= rowSeats.length - quantity; i++) {
      const slice = rowSeats.slice(i, i + quantity);
      const { valid } = validator(slice);
      if (valid) {
        const sliceCenter = (positionValue(slice[0]) + positionValue(slice[slice.length - 1])) / 2;
        const distFromCenter = Math.abs(sliceCenter - rowCenter);
        validCandidates.push({
          slice,
          sliceCenter,
          distFromCenter
        });
      }
    }

    if (validCandidates.length === 0) return null;

    // Rank candidates:
    if (preference === 'LEFT') {
      validCandidates.sort((a, b) => a.sliceCenter - b.sliceCenter);
    } else if (preference === 'RIGHT') {
      validCandidates.sort((a, b) => b.sliceCenter - a.sliceCenter);
    } else {
      // Default: CENTER (exact midpoint of stage/venue)
      validCandidates.sort((a, b) => a.distFromCenter - b.distFromCenter);
    }

    return validCandidates[0].slice;
  }
}

module.exports = new SeatAllocationService();
