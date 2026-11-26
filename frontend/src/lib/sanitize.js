import DOMPurify from 'dompurify'

const ALLOWED_HTML_TAGS = [
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
]

const ALLOWED_HTML_ATTR = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'title',
  'class',
  'style',
  'colspan',
  'rowspan',
  'width',
  'height',
]

const FORBID_TAGS = [
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
]

const FORBID_ATTR = [
  'onerror',
  'onload',
  'onclick',
  'onmouseover',
  'onmouseenter',
  'onmouseleave',
  'onfocus',
  'onblur',
  'onchange',
  'onsubmit',
  'oninput',
  'onkeydown',
  'onkeyup',
  'formaction',
  'srcdoc',
  'xmlns',
]

const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|gif|webp|bmp|avif);base64,[a-z0-9+/=\s]+$/i
const DANGEROUS_STYLE_RE = /expression\s*\(|url\s*\(|javascript:|vbscript:|@import|<|>|\{|\}/i

let hooksInitialized = false

function ensureSanitizeHooks() {
  if (hooksInitialized) return
  hooksInitialized = true

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href')
      if (href) {
        const safe = sanitizeUrl(href, { allowMailto: true, allowRelative: true })
        if (!safe) {
          node.removeAttribute('href')
        } else {
          node.setAttribute('href', safe)
        }
      }
      if (node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer')
      }
    }

    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src')
      if (src) {
        const safeSrc = sanitizeImageSrc(src)
        if (!safeSrc) {
          node.removeAttribute('src')
        } else {
          node.setAttribute('src', safeSrc)
        }
      }
    }

    if (node.hasAttribute('style')) {
      const rawStyle = node.getAttribute('style') || ''
      if (DANGEROUS_STYLE_RE.test(rawStyle)) {
        node.removeAttribute('style')
      }
    }
  })
}

function stripControlChars(value) {
  let out = ''
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code > 31 && code !== 127) {
      out += value[i]
    }
  }
  return out.trim()
}

/**
 * Validates and normalizes an external or relative URL against a strict protocol allowlist.
 * Rejects javascript:, vbscript:, data:, file:, and obfuscated control characters.
 */
export function sanitizeUrl(rawUrl, { allowMailto = true, allowRelative = true } = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  const cleaned = stripControlChars(rawUrl)
  if (!cleaned) return ''

  const collapsed = cleaned.replace(/\s+/g, '')
  const lower = collapsed.toLowerCase()

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return cleaned
  }
  if (allowMailto && (lower.startsWith('mailto:') || lower.startsWith('tel:'))) {
    return cleaned
  }
  if (allowRelative && cleaned.startsWith('/') && !cleaned.startsWith('//')) {
    return cleaned
  }
  if (allowRelative && cleaned.startsWith('#')) {
    return cleaned
  }
  if (/^www\./i.test(cleaned)) {
    return `https://${cleaned}`
  }

  // Block any other explicit scheme (e.g. javascript:, vbscript:, data:, blob:)
  if (/^[a-z][a-z0-9+.-]*:/i.test(collapsed) || lower.startsWith('//')) {
    return ''
  }

  return ''
}

function sanitizeImageSrc(rawSrc) {
  if (!rawSrc || typeof rawSrc !== 'string') return ''
  const cleaned = stripControlChars(rawSrc)
  if (!cleaned) return ''
  if (SAFE_DATA_IMAGE_RE.test(cleaned)) {
    return cleaned
  }
  return sanitizeUrl(cleaned, { allowMailto: false, allowRelative: true })
}

/**
 * Sanitizes rich HTML before passing it to React dangerouslySetInnerHTML.
 * Strips scripts, event handlers, dangerous tags/styles, and unsafe URLs.
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return ''
  ensureSanitizeHooks()
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ALLOWED_HTML_TAGS,
    ALLOWED_ATTR: ALLOWED_HTML_ATTR,
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  })
}
