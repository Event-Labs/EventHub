const OPENCAGE_BASE = 'https://api.opencagedata.com/geocode/v1/json'

function getApiKey() {
    return import.meta.env.VITE_OPENCAGE_API_KEY || ''
}

/**
 * Parse OpenCage result into form-compatible address fields.
 */
export function parseOpenCageAddress(result) {
    const components = result?.components || {}
    return {
        address_line: result?.formatted || '',
        city: components.city || components.town || components.state || '',
        district: components.state_district || components.county || components.district || '',
        ward: components.suburb || components.neighbourhood || components.village || '',
        country: components.country || 'Vietnam',
    }
}

/**
 * Internal helper to call OpenCage API.
 */
async function fetchOpenCage(query, limit, bias) {
    const params = new URLSearchParams({
        q: query,
        key: getApiKey(),
        language: 'vi',
        countrycode: 'vn',
        limit: String(limit),
    })

    if (bias?.lat != null && bias?.lng != null) {
        params.set('proximity', `${bias.lat},${bias.lng}`)
    }

    const response = await fetch(`${OPENCAGE_BASE}?${params}`)
    if (!response.ok) return []
    const data = await response.json()
    return data.results || []
}

/**
 * Search / autosuggest addresses using OpenCage.
 * @param {string} query - free-form text
 * @param {object} [options]
 * @param {number} [options.limit=8]
 * @param {number} [options.lat] - map center latitude for location bias
 * @param {number} [options.lng] - map center longitude for location bias
 * @returns {Promise<Array>} list of result objects
 */
export async function searchAddress(query, options = {}) {
    const q = query?.trim()
    if (!q || q.length < 3) return []

    const limit = options.limit || 8
    const bias = (options.lat != null && options.lng != null)
        ? { lat: options.lat, lng: options.lng }
        : undefined

    return fetchOpenCage(q, limit, bias)
}

/**
 * Reverse geocode: lat/lng → address using OpenCage.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<object>} single result object
 */
export async function reverseGeocode(lat, lng) {
    const params = new URLSearchParams({
        q: `${lat},${lng}`,
        key: getApiKey(),
        language: 'vi',
    })

    const response = await fetch(`${OPENCAGE_BASE}?${params}`)
    if (!response.ok) throw new Error('Không thể lấy địa chỉ từ tọa độ')
    const data = await response.json()
    const result = data.results?.[0]
    if (!result) throw new Error('Không tìm thấy địa chỉ cho tọa độ này')
    return result
}

/**
 * Forward geocode: text → coordinates using OpenCage.
 * @param {string} query - full address text
 * @param {object} [options]
 * @param {number} [options.limit=1]
 * @returns {Promise<Array>} list of result objects
 */
export async function forwardGeocode(query, options = {}) {
    const q = query?.trim()
    if (!q) return []

    const results = await fetchOpenCage(q, options.limit || 1)
    return results
}
