const DROP_WITH_BODY_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'template',
  'head',
  'meta',
  'link',
  'base',
]);

const ALLOWED_HTML_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ins',
  'strike',
  'sub',
  'sup',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'hr',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
]);

const VOID_HTML_TAGS = new Set(['br', 'hr', 'img']);

const ALLOWED_CSS_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'font-family',
  'text-decoration',
  'text-align',
  'line-height',
  'margin',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'padding',
  'padding-left',
  'padding-right',
  'padding-top',
  'padding-bottom',
  'border-radius',
  'width',
  'max-width',
]);

const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|gif|webp|bmp|avif);base64,[a-z0-9+/=\s]+$/i;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    });
}

function sanitizeSafeUrl(rawUrl, { allowMailto = true, allowRelative = true } = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const decoded = decodeHtmlEntities(rawUrl).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!decoded) return '';

  const collapsed = decoded.replace(/\s+/g, '');
  const lower = collapsed.toLowerCase();

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return decoded;
  }
  if (allowMailto && (lower.startsWith('mailto:') || lower.startsWith('tel:'))) {
    return decoded;
  }
  if (allowRelative && decoded.startsWith('/') && !decoded.startsWith('//')) {
    return decoded;
  }
  if (allowRelative && decoded.startsWith('#')) {
    return decoded;
  }
  if (/^www\./i.test(decoded)) {
    return `https://${decoded}`;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(collapsed) || lower.startsWith('//')) {
    return '';
  }

  return '';
}

function sanitizeImageSrc(rawSrc) {
  if (!rawSrc || typeof rawSrc !== 'string') return '';
  const decoded = decodeHtmlEntities(rawSrc).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!decoded) return '';
  if (SAFE_DATA_IMAGE_RE.test(decoded)) {
    return decoded.replace(/\s+/g, '');
  }
  return sanitizeSafeUrl(decoded, { allowMailto: false, allowRelative: true });
}

function parseAttributes(rawAttrs) {
  const attrs = {};
  const attrRegex = /([a-zA-Z0-9:-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRegex.exec(rawAttrs)) !== null) {
    const name = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = val;
  }
  return attrs;
}

function sanitizeInlineStyle(rawStyle) {
  if (!rawStyle || typeof rawStyle !== 'string') return '';
  const declarations = decodeHtmlEntities(rawStyle).split(';');
  const safeParts = [];

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    if (!prop || !val) continue;

    const normalizedProp = prop === 'background' ? 'background-color' : prop;
    if (!ALLOWED_CSS_PROPERTIES.has(normalizedProp)) continue;

    const lowerVal = val.toLowerCase();
    if (
      lowerVal.includes('url(') ||
      lowerVal.includes('expression') ||
      lowerVal.includes('javascript:') ||
      lowerVal.includes('vbscript:') ||
      lowerVal.includes('@import') ||
      lowerVal.includes('<') ||
      lowerVal.includes('>') ||
      lowerVal.includes('{') ||
      lowerVal.includes('}')
    ) {
      continue;
    }

    if (
      normalizedProp === 'background-color' &&
      !/^(#[0-9a-f]{3,8}|rgba?\([^()]+\)|hsla?\([^()]+\)|[a-z]{3,20}|transparent)$/i.test(val)
    ) {
      continue;
    }

    safeParts.push(`${normalizedProp}: ${val}`);
  }

  return safeParts.join('; ');
}

function sanitizeClassAttr(rawClass) {
  if (!rawClass || typeof rawClass !== 'string') return '';
  return rawClass
    .split(/\s+/)
    .map((cls) => cls.trim())
    .filter((cls) => /^[a-zA-Z0-9_-]{1,64}$/.test(cls))
    .join(' ');
}

function escapeStrayAngles(text) {
  if (!text) return '';
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Sanitizes user-supplied rich HTML for safe web rendering and DB storage.
 * Drops active/dangerous tags with their body, strips event handlers and
 * dangerous CSS/URI schemes, and escapes any stray unclosed angle brackets.
 */
function sanitizeRichHtml(rawHtml) {
  if (rawHtml === undefined || rawHtml === null) return '';
  const input = String(rawHtml);
  if (!input.trim()) return '';

  const tokenRegex = /(<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:[\s/][^<>]*)?>)/g;
  let output = '';
  let lastIndex = 0;
  let dropDepthTag = null;
  let dropDepth = 0;
  let match;

  while ((match = tokenRegex.exec(input)) !== null) {
    const textChunk = input.slice(lastIndex, match.index);
    if (textChunk && dropDepth === 0) {
      output += escapeStrayAngles(textChunk);
    }

    const token = match[0];
    lastIndex = tokenRegex.lastIndex;

    if (token.startsWith('<!--')) {
      continue;
    }

    const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([\s\S]*?)(\/?)>$/.exec(token);
    if (!tagMatch) continue;

    const isClosing = tagMatch[1] === '/';
    const tagName = tagMatch[2].toLowerCase();
    const rawAttrs = tagMatch[3] || '';
    const isSelfClosing = tagMatch[4] === '/' || VOID_HTML_TAGS.has(tagName);

    if (dropDepth > 0) {
      if (tagName === dropDepthTag) {
        if (isClosing) {
          dropDepth -= 1;
          if (dropDepth === 0) dropDepthTag = null;
        } else if (!isSelfClosing) {
          dropDepth += 1;
        }
      }
      continue;
    }

    if (DROP_WITH_BODY_TAGS.has(tagName)) {
      if (!isClosing && !isSelfClosing) {
        dropDepth = 1;
        dropDepthTag = tagName;
      }
      continue;
    }

    if (!ALLOWED_HTML_TAGS.has(tagName)) {
      continue;
    }

    if (isClosing) {
      if (!VOID_HTML_TAGS.has(tagName)) {
        output += `</${tagName}>`;
      }
      continue;
    }

    const attrs = parseAttributes(rawAttrs);
    const safeClass = sanitizeClassAttr(attrs.class);
    const safeStyle = sanitizeInlineStyle(attrs.style);
    const outAttrs = [];

    if (safeClass) outAttrs.push(`class="${escapeHtml(safeClass)}"`);
    if (safeStyle) outAttrs.push(`style="${escapeHtml(safeStyle)}"`);

    if (tagName === 'a') {
      const safeHref = sanitizeSafeUrl(attrs.href, { allowMailto: true, allowRelative: true });
      if (safeHref) {
        outAttrs.push(`href="${escapeHtml(safeHref)}"`);
        outAttrs.push('target="_blank"', 'rel="noopener noreferrer"');
      }
    } else if (tagName === 'img') {
      const safeSrc = sanitizeImageSrc(attrs.src);
      if (!safeSrc) continue;
      outAttrs.push(`src="${escapeHtml(safeSrc)}"`);
      if (attrs.alt) outAttrs.push(`alt="${escapeHtml(decodeHtmlEntities(attrs.alt))}"`);
      if (attrs.title) outAttrs.push(`title="${escapeHtml(decodeHtmlEntities(attrs.title))}"`);
      if (/^\d{1,4}$/.test(attrs.width || '')) outAttrs.push(`width="${attrs.width}"`);
      if (/^\d{1,4}$/.test(attrs.height || '')) outAttrs.push(`height="${attrs.height}"`);
    } else {
      if (attrs.title) outAttrs.push(`title="${escapeHtml(decodeHtmlEntities(attrs.title))}"`);
      if ((tagName === 'td' || tagName === 'th') && /^\d{1,3}$/.test(attrs.colspan || '')) {
        outAttrs.push(`colspan="${attrs.colspan}"`);
      }
      if ((tagName === 'td' || tagName === 'th') && /^\d{1,3}$/.test(attrs.rowspan || '')) {
        outAttrs.push(`rowspan="${attrs.rowspan}"`);
      }
    }

    const attrStr = outAttrs.length > 0 ? ` ${outAttrs.join(' ')}` : '';
    output += VOID_HTML_TAGS.has(tagName) ? `<${tagName}${attrStr} />` : `<${tagName}${attrStr}>`;
  }

  const tail = input.slice(lastIndex);
  if (tail && dropDepth === 0) {
    output += escapeStrayAngles(tail);
  }

  return output;
}

function isPrivateOrLoopbackHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return true;
  }

  // IPv4 private / loopback / link-local / CGNAT checks
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  // IPv6 private / link-local prefixes
  if (host.includes(':') && (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))) {
    return true;
  }

  return false;
}

function isSafeExternalHttpUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  escapeHtml,
  decodeHtmlEntities,
  sanitizeSafeUrl,
  sanitizeRichHtml,
  isSafeExternalHttpUrl,
};
