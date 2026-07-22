function normalizeRules(raw) {
  const rules = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
  return {
    require_adjacent_seats: Boolean(rules.require_adjacent_seats),
    require_same_row: Boolean(rules.require_same_row),
    disallow_single_seat_left: Boolean(rules.disallow_single_seat_left),
  };
}

function seatId(seat) {
  return String(seat?.session_seat_id || seat?.id || '');
}

function rowId(seat) {
  return String(seat?.row_id || seat?.row_label || '');
}

function positionValue(seat) {
  const x = Number(seat?.x_position);
  if (Number.isFinite(x)) return x;
  const number = Number.parseInt(String(seat?.seat_number || '').match(/\d+/)?.[0] || '', 10);
  return Number.isFinite(number) ? number : 0;
}

function sortSeats(seats) {
  return [...seats].sort((a, b) => positionValue(a) - positionValue(b));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function normalSeatGap(rowSeats) {
  const sorted = sortSeats(rowSeats);
  const gaps = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = positionValue(sorted[index]) - positionValue(sorted[index - 1]);
    if (gap > 0) gaps.push(gap);
  }
  return median(gaps);
}

function physicalNeighborInfo(left, right, rowSeats) {
  if (!left || !right || rowId(left) !== rowId(right)) return { adjacent: false, aisle: false };

  const leftBlock = left.block_id || left.blockId;
  const rightBlock = right.block_id || right.blockId;
  if (leftBlock && rightBlock && String(leftBlock) !== String(rightBlock)) {
    return { adjacent: false, aisle: true };
  }

  const explicitRight = left.right_neighbor_id || left.rightNeighborId;
  const explicitLeft = right.left_neighbor_id || right.leftNeighborId;
  if (explicitRight || explicitLeft) {
    const linked = (!explicitRight || String(explicitRight) === seatId(right)) &&
      (!explicitLeft || String(explicitLeft) === seatId(left));
    return { adjacent: linked, aisle: !linked };
  }

  const sorted = sortSeats(rowSeats);
  const leftIndex = sorted.findIndex((seat) => seatId(seat) === seatId(left));
  const rightIndex = sorted.findIndex((seat) => seatId(seat) === seatId(right));
  if (leftIndex < 0 || rightIndex !== leftIndex + 1) return { adjacent: false, aisle: false };

  const normalGap = normalSeatGap(rowSeats);
  const actualGap = positionValue(right) - positionValue(left);
  const separatedByAisle = normalGap !== null && actualGap > normalGap * 1.6;
  return { adjacent: !separatedByAisle, aisle: separatedByAisle };
}

function isAvailableSeat(seat) {
  if (seat?.is_disabled || seat?.has_paid_ticket) return false;
  if (['SOLD', 'BOOKED', 'LOCKED', 'BLOCKED', 'DISABLED'].includes(String(seat?.status || '').toUpperCase())) return false;
  if (seat?.status === 'HELD') {
    return Boolean(seat.held_until) && new Date(seat.held_until).getTime() <= Date.now();
  }
  return !seat?.status || seat.status === 'AVAILABLE';
}

function rowSegments(rowSeats) {
  const sorted = sortSeats(rowSeats);
  const segments = [];
  let current = [];
  sorted.forEach((seat, index) => {
    if (index > 0 && !physicalNeighborInfo(sorted[index - 1], seat, sorted).adjacent) {
      if (current.length) segments.push(current);
      current = [];
    }
    current.push(seat);
  });
  if (current.length) segments.push(current);
  return segments;
}

function singletonSeatIds(rowSeats, selectedIds = new Set()) {
  const singletons = new Set();
  rowSegments(rowSeats).forEach((segment) => {
    let run = [];
    const flush = () => {
      if (run.length === 1) singletons.add(seatId(run[0]));
      run = [];
    };
    segment.forEach((seat) => {
      if (isAvailableSeat(seat) && !selectedIds.has(seatId(seat))) run.push(seat);
      else flush();
    });
    flush();
  });
  return singletons;
}

function validateSelectedSeats({ rules: rawRules, selectedSeats = [], eligibleSeats = [] }) {
  const rules = normalizeRules(rawRules);
  const issues = [];
  const selected = selectedSeats.filter(Boolean);
  if (selected.length === 0) return issues;

  const selectedRows = new Set(selected.map(rowId));
  if ((rules.require_same_row || rules.require_adjacent_seats) && selectedRows.size > 1) {
    issues.push('C\u00e1c gh\u1ebf trong c\u00f9ng m\u1ed9t \u0111\u01a1n ph\u1ea3i thu\u1ed9c c\u00f9ng m\u1ed9t h\u00e0ng.');
    return issues;
  }

  if (rules.require_adjacent_seats && selected.length >= 2) {
    const rowSeats = eligibleSeats.filter((seat) => rowId(seat) === rowId(selected[0]));
    const sortedSelected = sortSeats(selected);
    for (let index = 1; index < sortedSelected.length; index += 1) {
      const relation = physicalNeighborInfo(sortedSelected[index - 1], sortedSelected[index], rowSeats);
      if (!relation.adjacent) {
        issues.push(relation.aisle
          ? 'C\u00e1c gh\u1ebf \u0111\u00e3 ch\u1ecdn b\u1ecb ng\u0103n c\u00e1ch b\u1edfi l\u1ed1i \u0111i.'
          : 'Vui l\u00f2ng ch\u1ecdn c\u00e1c gh\u1ebf li\u1ec1n k\u1ec1 nhau.');
        return issues;
      }
    }
  }

  if (rules.disallow_single_seat_left) {
    const selectedIds = new Set(selected.map(seatId));
    const affectedRows = new Set(selected.map(rowId));
    for (const affectedRow of affectedRows) {
      const rowSeats = eligibleSeats.filter((seat) => rowId(seat) === affectedRow);
      const before = singletonSeatIds(rowSeats);
      const after = singletonSeatIds(rowSeats, selectedIds);
      const createsNewSingleton = [...after].some((id) => !before.has(id));
      if (createsNewSingleton) {
        issues.push('L\u1ef1a ch\u1ecdn n\u00e0y s\u1ebd \u0111\u1ec3 l\u1ea1i m\u1ed9t gh\u1ebf tr\u1ed1ng \u0111\u01a1n l\u1ebb. Vui l\u00f2ng ch\u1ecdn c\u1ea3 hai gh\u1ebf ho\u1eb7c ch\u1ecdn v\u1ecb tr\u00ed kh\u00e1c.');
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