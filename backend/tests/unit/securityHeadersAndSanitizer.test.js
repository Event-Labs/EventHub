const express = require('express');
const http = require('http');
const securityMiddlewares = require('../../src/middlewares/security.middleware');
const {
  escapeHtml,
  sanitizeSafeUrl,
  sanitizeRichHtml,
  isSafeExternalHttpUrl,
} = require('../../src/core/security/htmlSanitizer');

describe('Anti-Clickjacking Security Middleware', () => {
  test('sets X-Frame-Options: DENY and CSP frame-ancestors none', async () => {
    const app = express();
    securityMiddlewares(app);
    app.get('/ping', (_req, res) => res.status(200).json({ ok: true }));

    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const port = server.address().port;
      const headers = await new Promise((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${port}/ping`, (res) => {
            res.resume();
            resolve(res.headers);
          })
          .on('error', reject);
      });

      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(headers['x-content-type-options']).toBe('nosniff');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe('HTML & URL Sanitizer (Anti-XSS)', () => {
  test('strips active tags and event handlers while preserving safe formatting', () => {
    const dirty = [
      '<h3>Event Intro</h3>',
      '<p class="ql-align-center" style="color: #0284c7">Welcome <strong>Guest</strong></p>',
      '<script>alert(1)</script>',
      '<iframe src="https://evil.example"></iframe>',
      '<svg onload="alert(1)"><circle /></svg>',
      '<img src="https://cdn.example.com/banner.jpg" onerror="alert(1)" alt="Banner" />',
      '<img src="javascript:alert(1)" />',
      '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" />',
      '<a href="javascript:alert(1)" onclick="alert(2)">Bad Link</a>',
      '<a href="https://eventhub.id.vn/events/1">Good Link</a>',
    ].join('');

    const clean = sanitizeRichHtml(dirty);
    expect(clean).toContain('<h3>Event Intro</h3>');
    expect(clean).toContain('<p class="ql-align-center" style="color: #0284c7">Welcome <strong>Guest</strong></p>');
    expect(clean).toContain('<img src="https://cdn.example.com/banner.jpg" alt="Banner" />');
    expect(clean).toContain('<a href="https://eventhub.id.vn/events/1" target="_blank" rel="noopener noreferrer">Good Link</a>');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('<iframe');
    expect(clean).not.toContain('<svg');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onload');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('image/svg+xml');
  });

  test('neutralizes unclosed angle brackets and dangerous inline styles', () => {
    const malformed = '<p style="background-image: url(javascript:alert(1))">Hi</p><img src=x onerror=alert(1)';
    const clean = sanitizeRichHtml(malformed);
    expect(clean).toBe('<p>Hi</p>&lt;img src=x onerror=alert(1)');
  });

  test('sanitizeSafeUrl blocks dangerous schemes and accepts safe URLs', () => {
    expect(sanitizeSafeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeSafeUrl('  JaVaScRiPt:alert(1)')).toBe('');
    expect(sanitizeSafeUrl('data:text/html,<script>1</script>')).toBe('');
    expect(sanitizeSafeUrl('vbscript:msgbox(1)')).toBe('');
    expect(sanitizeSafeUrl('//evil.example/a')).toBe('');
    expect(sanitizeSafeUrl('https://www.eventhub.id.vn/events/abc')).toBe('https://www.eventhub.id.vn/events/abc');
    expect(sanitizeSafeUrl('/events/abc')).toBe('/events/abc');
  });

  test('isSafeExternalHttpUrl blocks private/loopback SSRF targets and non-HTTP protocols', () => {
    expect(isSafeExternalHttpUrl('https://res.cloudinary.com/demo/image/upload/sample.pdf')).toBe(true);
    expect(isSafeExternalHttpUrl('http://127.0.0.1:3000/secret')).toBe(false);
    expect(isSafeExternalHttpUrl('http://localhost/admin')).toBe(false);
    expect(isSafeExternalHttpUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeExternalHttpUrl('http://10.0.0.5/internal')).toBe(false);
    expect(isSafeExternalHttpUrl('http://192.168.1.10/router')).toBe(false);
    expect(isSafeExternalHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalHttpUrl('javascript:alert(1)')).toBe(false);
  });

  test('escapeHtml escapes all HTML special characters', () => {
    expect(escapeHtml(`<script>"'&</script>`)).toBe('&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;');
  });
});
