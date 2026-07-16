function normalizeRules(raw) {
  const rules = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
  return {
    require_adjacent_seats: Boolean(rules.require_adjacent_seats),
    require_same_row: Boolean(rules.require_same_row),
    disallow_single_seat_left: Boolean(rules.disallow_single_seat_left),
  };
}

function seatNumberValue(seat) {
  const number = Number.parseInt(String(seat.seat_number || '').match(/\d+/)?.[0] || '', 10);
  if (Number.isFinite(number)) return number;
  const x = Number(seat.x_position);
  return Number.isFinite(x) ? x : 0;
}

function rowLabel(seat) {
  return String(seat.row_label || '');
}

function isAvailableSeat(seat) {
  if (seat.is_disabled || seat.has_paid_ticket) return false;
  if (seat.status === 'SOLD') return false;
  if (seat.status === 'HELD' && seat.held_until && new Date(seat.held_until).getTime() > Date.now()) {
    return false;
  }
  return true;
}

function validateSelectedSeats({ rules: rawRules, selectedSeats = [], eligibleSeats = [] }) {
  const rules = normalizeRules(rawRules);
  const issues = [];
  const selected = selectedSeats.filter(Boolean);

  if (selected.length === 0) return issues;

  const selectedRows = new Set(selected.map(rowLabel));
  if ((rules.require_same_row || rules.require_adjacent_seats) && selectedRows.size > 1) {
    issues.push('Các ghế đã chọn phải nằm cùng một hàng.');
  }

  if (rules.require_adjacent_seats && selectedRows.size === 1) {
    const sorted = [...selected].sort((a, b) => seatNumberValue(a) - seatNumberValue(b));
    const adjacent = sorted.every((seat, index) => {
      if (index === 0) return true;
      return seatNumberValue(seat) - seatNumberValue(sorted[index - 1]) === 1;
    });
    if (!adjacent) {
      issues.push('Các ghế đã chọn phải liền kề nhau.');
    }
  }

  if (rules.disallow_single_seat_left) {
    const selectedIds = new Set(selected.map((seat) => String(seat.session_seat_id || seat.id)));
    const affectedRows = new Set(selected.map(rowLabel));
    const rows = new Map();
    eligibleSeats.forEach((seat) => {
      const key = rowLabel(seat);
      if (!affectedRows.has(key)) return;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(seat);
    });

    for (const seats of rows.values()) {
      const sorted = seats.sort((a, b) => seatNumberValue(a) - seatNumberValue(b));
      let block = 0;
      let previousNumber = null;

      for (const seat of sorted) {
        const seatId = String(seat.session_seat_id || seat.id);
        const number = seatNumberValue(seat);
        const availableAfterSelection = isAvailableSeat(seat) && !selectedIds.has(seatId);
        const contiguous = previousNumber === null || number - previousNumber === 1;

        if (!availableAfterSelection || !contiguous) {
          if (block === 1) {
            issues.push('Không được để lại một ghế trống lẻ trong cùng hàng.');
            return issues;
          }
          block = availableAfterSelection ? 1 : 0;
        } else {
          block += 1;
        }
        previousNumber = number;
      }

      if (block === 1) {
        issues.push('Không được để lại một ghế trống lẻ trong cùng hàng.');
        return issues;
      }
    }
  }

  return issues;
}

module.exports = {
  normalizeRules,
  validateSelectedSeats,
};
