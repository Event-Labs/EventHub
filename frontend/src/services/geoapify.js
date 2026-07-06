const GEOAPIFY_BASE = 'https://api.geoapify.com/v1/geocode'

function getApiKey() {
    return import.meta.env.VITE_GEOAPIFY_API_KEY || ''
}

/**
 * Parse Geoapify result into form-compatible address fields.
 */
export function parseGeoapifyAddress(result) {
    return {
        address_line: result?.formatted || '',
        city: result?.city || result?.state || '',
        district: result?.district || result?.county || '',
        ward: result?.suburb || result?.neighbourhood || result?.quarter || '',
        country: result?.country || 'Vietnam',
    }
}

/**
 * Internal helper to call a Geoapify geocoding endpoint.
 * @param {string} endpoint - 'autocomplete' or 'search'
 * @param {string} query - search text
 * @param {number} limit - max results
 * @param {{ lat?: number, lng?: number }} [bias] - location bias (map center)
 */
async function fetchGeoapify(endpoint, query, limit, bias) {
    const params = new URLSearchParams({
        text: query,
        format: 'json',
        lang: 'vi',
        filter: 'countrycode:vn',
        limit: String(limit),
        apiKey: getApiKey(),
    })

    // Bias results towards the current map view
    if (bias?.lat != null && bias?.lng != null) {
        params.set('bias', `proximity:${bias.lng},${bias.lat}`)
    }

    const response = await fetch(`${GEOAPIFY_BASE}/${endpoint}?${params}`)
    if (!response.ok) return []
    const data = await response.json()
    return data.results || []
}

/**
 * Search addresses using Geoapify.
 * Tries Autocomplete API first (faster, better for specific place names).
 * Falls back to Forward Geocoding (/search) if autocomplete returns no results
 * (handles Vietnamese short queries like "Hội An" better).
 *
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

    // Try autocomplete first (faster, better for specific names like "Đại học FPT")
    const autocompleteResults = await fetchGeoapify('autocomplete', q, limit, bias)
    if (autocompleteResults.length > 0) return autocompleteResults

    // Fallback to forward geocoding (handles short Vietnamese queries better)
    return fetchGeoapify('search', q, limit, bias)
}

/**
 * Reverse geocode: lat/lng → address using Geoapify Reverse Geocoding API.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<object>} single result object
 */
export async function reverseGeocode(lat, lng) {
    const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        format: 'json',
        lang: 'vi',
        apiKey: getApiKey(),
    })

    const response = await fetch(`${GEOAPIFY_BASE}/reverse?${params}`)
    if (!response.ok) throw new Error('Không thể lấy địa chỉ từ tọa độ')
    const data = await response.json()
    const result = data.results?.[0]
    if (!result) throw new Error('Không tìm thấy địa chỉ cho tọa độ này')
    return result
}

/**
 * Forward geocode: text → coordinates using Geoapify Geocoding API.
 * @param {string} query - full address text
 * @param {object} [options]
 * @param {number} [options.limit=1]
 * @returns {Promise<Array>} list of result objects
 */
export async function forwardGeocode(query, options = {}) {
    const q = query?.trim()
    if (!q) return []

    const params = new URLSearchParams({
        text: q,
        format: 'json',
        lang: 'vi',
        filter: 'countrycode:vn',
        limit: String(options.limit || 1),
        apiKey: getApiKey(),
    })

    const response = await fetch(`${GEOAPIFY_BASE}/search?${params}`)
    if (!response.ok) throw new Error('Không thể tìm địa chỉ')
    const data = await response.json()
    return data.results || []
}
