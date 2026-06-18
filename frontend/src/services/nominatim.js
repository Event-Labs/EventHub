const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'

function buildHeaders() {
  return {
    Accept: 'application/json',
    'Accept-Language': 'vi',
  }
}

export function parseNominatimAddress(result) {
  const addr = result?.address || {}
  return {
    address_line: result?.display_name || '',
    city: addr.city || addr.town || addr.state || addr.province || '',
    district: addr.city_district || addr.district || addr.county || addr.municipality || '',
    ward: addr.suburb || addr.neighbourhood || addr.quarter || addr.village || '',
    country: addr.country || 'Vietnam',
  }
}

export async function searchAddress(query, options = {}) {
  const q = query?.trim()
  if (!q || q.length < 3) return []

  const normalizedQuery = /việt nam|viet nam|vietnam/i.test(q) ? q : `${q}, Vietnam`

  const params = new URLSearchParams({
    q: normalizedQuery,
    format: 'json',
    addressdetails: '1',
    countrycodes: 'vn',
    dedupe: '1',
    limit: String(options.limit || 8),
  })

  const response = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
    headers: buildHeaders(),
  })
  if (!response.ok) throw new Error('Không thể tìm địa chỉ')
  return response.json()
}

export async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
    addressdetails: '1',
  })

  const response = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, {
    headers: buildHeaders(),
  })
  if (!response.ok) throw new Error('Không thể lấy địa chỉ từ tọa độ')
  return response.json()
}
