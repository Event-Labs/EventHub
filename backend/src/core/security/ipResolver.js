/**
 * Secure Client IP Resolver with Cloudflare Trusted Proxy Validation
 * Prevents IP spoofing via forged CF-Connecting-IP headers on direct backend access.
 */

// Cloudflare published IPv4 and IPv6 CIDR ranges
const CLOUDFLARE_IPV4_CIDRS = [
  { ip: '173.245.48.0', prefix: 20 },
  { ip: '103.21.244.0', prefix: 22 },
  { ip: '103.22.200.0', prefix: 22 },
  { ip: '103.31.4.0', prefix: 22 },
  { ip: '141.101.64.0', prefix: 18 },
  { ip: '108.162.192.0', prefix: 18 },
  { ip: '190.93.240.0', prefix: 20 },
  { ip: '188.114.96.0', prefix: 20 },
  { ip: '197.234.240.0', prefix: 22 },
  { ip: '198.41.128.0', prefix: 17 },
  { ip: '162.158.0.0', prefix: 15 },
  { ip: '104.16.0.0', prefix: 13 },
  { ip: '104.24.0.0', prefix: 14 },
  { ip: '172.64.0.0', prefix: 13 },
  { ip: '131.0.72.0', prefix: 22 },
];

function normalizeIp(ip) {
  if (!ip || typeof ip !== 'string') return '127.0.0.1';
  let cleaned = ip.trim();
  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.substring(7);
  }
  return cleaned;
}

function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
}

function isIpv4InCidr(ip, cidrIp, prefix) {
  const ipInt = ipv4ToInt(ip);
  const cidrInt = ipv4ToInt(cidrIp);
  if (ipInt === null || cidrInt === null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (cidrInt & mask);
}

function isLoopbackOrPrivate(ip) {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  // Private subnets: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  if (isIpv4InCidr(ip, '10.0.0.0', 8)) return true;
  if (isIpv4InCidr(ip, '172.16.0.0', 12)) return true;
  if (isIpv4InCidr(ip, '192.168.0.0', 16)) return true;
  // IPv6 local / private
  if (ip.startsWith('fc00:') || ip.startsWith('fd00:') || ip.startsWith('fe80:')) return true;
  return false;
}

function isCloudflareIp(ip) {
  const norm = normalizeIp(ip);
  for (const { ip: cidrIp, prefix } of CLOUDFLARE_IPV4_CIDRS) {
    if (isIpv4InCidr(norm, cidrIp, prefix)) return true;
  }
  // Cloudflare IPv6 prefixes
  const cfV6Prefixes = ['2400:cb00:', '2606:4700:', '2803:f800:', '2405:b500:', '2405:8100:', '2a06:98c0:', '2c0f:f248:'];
  for (const prefix of cfV6Prefixes) {
    if (norm.toLowerCase().startsWith(prefix)) return true;
  }
  return false;
}

function isTrustedProxy(remoteIp) {
  const norm = normalizeIp(remoteIp);
  return isLoopbackOrPrivate(norm) || isCloudflareIp(norm);
}

/**
 * Resolves the true client IP:
 * - If the direct connecting socket (remoteAddress) is NOT a trusted proxy,
 *   reject client-supplied proxy headers (CF-Connecting-IP, X-Forwarded-For) to prevent spoofing.
 * - If trusted proxy and CF headers are present (with valid proxy secret if configured), use CF-Connecting-IP.
 * - Otherwise use Express's validated req.ip or the remote socket address.
 */
function getClientIp(req) {
  if (!req) return '127.0.0.1';

  // Extract socket remoteAddress
  const rawRemote =
    (req.headers && req.headers['x-simulated-socket-ip']) ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    '127.0.0.1';
  const remoteIp = normalizeIp(rawRemote);

  const cfHeader = req.headers ? req.headers['cf-connecting-ip'] : null;
  const cfRay = req.headers ? req.headers['cf-ray'] : null;
  const proxySecret = process.env.CLOUDFLARE_PROXY_SECRET;
  const passedSecret = req.headers ? req.headers['x-cf-proxy-secret'] : null;

  // Check if connecting peer is trusted
  const remoteIsTrusted = isTrustedProxy(remoteIp);

  // If secret is configured in env, strictly require matching secret header
  const secretMatches = !proxySecret || passedSecret === proxySecret;

  if (remoteIsTrusted && secretMatches && cfHeader && cfRay) {
    return normalizeIp(String(cfHeader).split(',')[0].trim());
  }

  // If connecting peer is NOT trusted, an attacker connected directly to origin:
  // Discard all proxy headers to prevent spoofing
  if (!remoteIsTrusted) {
    return remoteIp;
  }

  // If trusted local reverse proxy (like Nginx) without Cloudflare
  if (req.ip) {
    return normalizeIp(req.ip);
  }

  return remoteIp;
}

module.exports = {
  getClientIp,
  isTrustedProxy,
  isCloudflareIp,
  normalizeIp,
};
