import React, { useState, useEffect, useRef } from 'react';

function parseValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return {
      prefix: '',
      numeric: val,
      decimals: Number.isInteger(val) ? 0 : 2,
      isThousandFormatted: false,
      suffix: ''
    };
  }
  const str = String(val).trim();
  if (!str || str === '—' || str === '-' || str === 'N/A') return null;

  const match = str.match(/^([^\d\-+]*)([\-+]?[\d.,]+)([^\d]*)$/);
  if (!match) return null;

  const prefix = match[1];
  const rawNum = match[2];
  const suffix = match[3];

  const dotCount = (rawNum.match(/\./g) || []).length;
  const commaCount = (rawNum.match(/,/g) || []).length;

  let numeric = 0;
  let isThousandFormatted = false;
  let decimals = 0;

  if (dotCount > 1) {
    numeric = parseFloat(rawNum.replace(/\./g, ''));
    isThousandFormatted = true;
  } else if (dotCount === 1 && commaCount === 0) {
    const parts = rawNum.split('.');
    if (parts[1].length === 3 && parts[0].length >= 1 && parseInt(parts[0], 10) > 0 && !suffix.includes('%')) {
      numeric = parseFloat(rawNum.replace(/\./g, ''));
      isThousandFormatted = true;
    } else {
      numeric = parseFloat(rawNum);
      decimals = parts[1].length;
    }
  } else if (commaCount > 0 && dotCount === 0) {
    const parts = rawNum.split(',');
    if (parts[1].length === 3 && parts[0].length >= 1) {
      numeric = parseFloat(rawNum.replace(/,/g, ''));
      isThousandFormatted = true;
    } else {
      numeric = parseFloat(rawNum.replace(',', '.'));
      decimals = parts[1].length;
    }
  } else {
    numeric = parseFloat(rawNum);
  }

  if (isNaN(numeric)) return null;

  return { prefix, numeric, isThousandFormatted, decimals, suffix };
}

function formatWithSeparators(num) {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatCurrent(parsed, current) {
  let numStr = '';
  if (parsed.isThousandFormatted) {
    numStr = formatWithSeparators(current);
  } else if (parsed.decimals > 0) {
    numStr = current.toFixed(parsed.decimals);
  } else {
    numStr = formatWithSeparators(current);
  }
  return parsed.prefix + numStr + parsed.suffix;
}

export default function AnimatedNumber({ value, duration = 900, className = '' }) {
  const parsed = parseValue(value);
  const [display, setDisplay] = useState(() => (parsed ? formatCurrent(parsed, 0) : String(value ?? '')));
  const prevValRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const p = parseValue(value);
    if (!p) {
      setDisplay(String(value ?? ''));
      return;
    }

    const startVal = prevValRef.current;
    const targetVal = p.numeric;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic: fast start, smooth deceleration
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (targetVal - startVal) * ease;

      setDisplay(formatCurrent(p, current));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevValRef.current = targetVal;
        setDisplay(formatCurrent(p, targetVal));
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span className={className}>{display}</span>;
}
