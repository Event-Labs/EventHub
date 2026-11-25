const { getClientIp, isTrustedProxy, normalizeIp, isCloudflareIp } = require('../../src/core/security/ipResolver');

describe('Security Verification: Cloudflare Trusted IP Resolver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CLOUDFLARE_PROXY_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('Rejects spoofed CF-Connecting-IP when connecting socket is an untrusted direct client IP', () => {
    const untrustedDirectReq = {
      headers: {
        'cf-connecting-ip': '8.8.8.8',
        'cf-ray': 'fake-ray-123',
        'x-forwarded-for': '8.8.8.8',
      },
      socket: {
        remoteAddress: '203.0.113.50', // Untrusted external IP reaching backend directly
      },
    };

    const clientIp = getClientIp(untrustedDirectReq);
    expect(clientIp).toBe('203.0.113.50');
    expect(clientIp).not.toBe('8.8.8.8');
  });

  test('Accepts CF-Connecting-IP when connecting socket is a verified Cloudflare proxy IP with cf-ray', () => {
    const cfReq = {
      headers: {
        'cf-connecting-ip': '198.51.100.22',
        'cf-ray': 'ray-xyz-789',
      },
      socket: {
        remoteAddress: '173.245.48.15', // Legitimate Cloudflare IP in 173.245.48.0/20
      },
    };

    const clientIp = getClientIp(cfReq);
    expect(clientIp).toBe('198.51.100.22');
  });

  test('Accepts CF-Connecting-IP when connecting socket is trusted loopback proxy', () => {
    const localProxyReq = {
      headers: {
        'cf-connecting-ip': '203.0.113.99',
        'cf-ray': 'ray-local-111',
      },
      socket: {
        remoteAddress: '127.0.0.1',
      },
    };

    const clientIp = getClientIp(localProxyReq);
    expect(clientIp).toBe('203.0.113.99');
  });

  test('Enforces CLOUDFLARE_PROXY_SECRET when configured', () => {
    process.env.CLOUDFLARE_PROXY_SECRET = 'secret_cf_token_xyz';

    // 1. Missing or wrong secret -> rejected
    const invalidSecretReq = {
      headers: {
        'cf-connecting-ip': '1.2.3.4',
        'cf-ray': 'ray-123',
        'x-cf-proxy-secret': 'wrong_secret',
      },
      socket: {
        remoteAddress: '127.0.0.1',
      },
    };
    expect(getClientIp(invalidSecretReq)).toBe('127.0.0.1');

    // 2. Correct secret -> accepted
    const validSecretReq = {
      headers: {
        'cf-connecting-ip': '1.2.3.4',
        'cf-ray': 'ray-123',
        'x-cf-proxy-secret': 'secret_cf_token_xyz',
      },
      socket: {
        remoteAddress: '127.0.0.1',
      },
    };
    expect(getClientIp(validSecretReq)).toBe('1.2.3.4');
  });

  test('Correctly normalizes IPv6-mapped IPv4 addresses', () => {
    expect(normalizeIp('::ffff:192.168.1.100')).toBe('192.168.1.100');
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp('10.0.0.1')).toBe('10.0.0.1');
  });

  test('Accurately identifies Cloudflare IPv4 and IPv6 CIDRs', () => {
    expect(isCloudflareIp('173.245.48.1')).toBe(true);
    expect(isCloudflareIp('104.16.1.1')).toBe(true);
    expect(isCloudflareIp('162.158.0.1')).toBe(true);
    expect(isCloudflareIp('2400:cb00:2048:1::c629:d7a2')).toBe(true);

    expect(isCloudflareIp('8.8.8.8')).toBe(false);
    expect(isCloudflareIp('1.1.1.1')).toBe(false);
    expect(isCloudflareIp('203.0.113.50')).toBe(false);
  });
});
