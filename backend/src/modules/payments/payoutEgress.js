const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');

let lastOkAt = 0;

async function assertEgressIp() {
  const proxyUrl = process.env.PAYOS_STATIC_PROXY_URL;
  const expectedIp = process.env.PAYOS_EXPECTED_EGRESS_IP;

  if (!proxyUrl || !expectedIp) {
    throw new Error('Chưa cấu hình proxy chi tiền (PAYOS_STATIC_PROXY_URL hoặc PAYOS_EXPECTED_EGRESS_IP)');
  }

  if (Date.now() - lastOkAt < 5 * 60 * 1000) return; // cache 5 phút

  const agent = new HttpsProxyAgent(proxyUrl);
  const { data } = await axios.get('https://api.ipify.org', {
    httpsAgent: agent,
    proxy: false,
    timeout: 8000,
  });

  if (String(data).trim() !== expectedIp.trim()) {
    throw new Error(`IP đi ra (${String(data).trim()}) không khớp IP đã đăng ký với PayOS (${expectedIp.trim()})`);
  }

  lastOkAt = Date.now();
}

function payoutAxiosConfig() {
  const proxyUrl = process.env.PAYOS_STATIC_PROXY_URL;
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
  return { httpsAgent: agent, proxy: false }; // proxy:false bắt buộc với axios
}

module.exports = { assertEgressIp, payoutAxiosConfig };

