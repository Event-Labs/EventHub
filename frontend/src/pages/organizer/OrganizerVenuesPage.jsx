import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Pencil, Search, Trash2 } from 'lucide-react'
import { OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'
import {
  createVenue,
  deleteVenue,
  getVenues,
  updateVenue,
} from '@/services/organizerVenues.js'
import { parseNominatimAddress, reverseGeocode, searchAddress } from '@/services/nominatim.js'

const DEFAULT_CENTER = { lat: 21.0285, lng: 105.8542 }

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const EMPTY_FORM = {
  name: '',
  address_line: '',
  city: '',
  district: '',
  ward: '',
  country: 'Vietnam',
  latitude: null,
  longitude: null,
  description: '',
}

function VenueFormModal({ open, editVenue, onClose, onSaved }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markerInstance = useRef(null)
  const searchTimer = useRef(null)
  const skipSearch = useRef(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [geocoding, setGeocoding] = useState(false)

  const applyGeocode = useCallback((result, lat, lng) => {
    const parsed = parseNominatimAddress(result)
    setForm((f) => ({
      ...f,
      address_line: parsed.address_line || f.address_line,
      city: parsed.city || f.city,
      district: parsed.district || f.district,
      ward: parsed.ward || f.ward,
      country: parsed.country || f.country,
      latitude: lat,
      longitude: lng,
    }))
  }, [])

  const moveMarker = useCallback((lat, lng, pan = true) => {
    if (!markerInstance.current || !mapInstance.current) return
    markerInstance.current.setLatLng([lat, lng])
    if (pan) mapInstance.current.panTo([lat, lng])
  }, [])

  useEffect(() => {
    if (!open) return
    setForm(
      editVenue
        ? {
            name: editVenue.name || '',
            address_line: editVenue.address_line || '',
            city: editVenue.city || '',
            district: editVenue.district || '',
            ward: editVenue.ward || '',
            country: editVenue.country || 'Vietnam',
            latitude: editVenue.latitude,
            longitude: editVenue.longitude,
            description: editVenue.description || '',
          }
        : { ...EMPTY_FORM },
    )
    setSuggestions([])
    setShowSuggestions(false)
    setError('')
    skipSearch.current = true
  }, [open, editVenue])

  useEffect(() => {
    if (!open || !mapRef.current) return

    const lat = Number(editVenue?.latitude ?? DEFAULT_CENTER.lat)
    const lng = Number(editVenue?.longitude ?? DEFAULT_CENTER.lng)

    const map = L.map(mapRef.current, { zoomControl: true }).setView([lat, lng], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    const marker = L.marker([lat, lng], { draggable: true, icon: markerIcon }).addTo(map)
    mapInstance.current = map
    markerInstance.current = marker

    async function updateLocationFromCoords(lat, lng, shouldPan = false) {
      marker.setLatLng([lat, lng])
      if (shouldPan) map.panTo([lat, lng])
      setGeocoding(true)
      try {
        const result = await reverseGeocode(lat, lng)
        skipSearch.current = true
        applyGeocode(result, lat, lng)
      } catch (err) {
        console.error(err)
        setForm((f) => ({ ...f, latitude: lat, longitude: lng }))
      } finally {
        setGeocoding(false)
      }
    }

    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng()
      updateLocationFromCoords(lat, lng)
    })

    map.on('click', (e) => {
      const { lat, lng } = e.latlng
      updateLocationFromCoords(lat, lng, true)
    })

    const resizeTimer = setTimeout(() => map.invalidateSize(), 150)

    return () => {
      clearTimeout(resizeTimer)
      map.remove()
      mapInstance.current = null
      markerInstance.current = null
    }
  }, [open, editVenue?.id, applyGeocode])

  useEffect(() => {
    if (!open || form.latitude == null || form.longitude == null) return
    moveMarker(Number(form.latitude), Number(form.longitude), false)
  }, [open, form.latitude, form.longitude, moveMarker])

  useEffect(() => {
    if (!open) return undefined

    if (skipSearch.current) {
      skipSearch.current = false
      return undefined
    }

    const query = form.address_line.trim()
    if (query.length < 3) {
      setSuggestions([])
      setSearching(false)
      return undefined
    }

    setSearching(true)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchAddress(query)
        setSuggestions(results)
        setShowSuggestions(true)
      } catch (err) {
        console.error(err)
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    }, 400)

    return () => clearTimeout(searchTimer.current)
  }, [open, form.address_line])

  function selectSuggestion(item) {
    const lat = Number(item.lat)
    const lng = Number(item.lon)
    skipSearch.current = true
    applyGeocode(item, lat, lng)
    moveMarker(lat, lng)
    setSuggestions([])
    setShowSuggestions(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Vui lòng nhập tên địa điểm')
      return
    }
    if (!form.address_line.trim()) {
      setError('Vui lòng nhập địa chỉ')
      return
    }
    if (!form.city.trim()) {
      setError('Vui lòng nhập thành phố')
      return
    }
    if (form.latitude == null || form.longitude == null) {
      setError('Vui lòng chọn vị trí trên bản đồ hoặc dùng gợi ý địa chỉ')
      return
    }

    setSaving(true)
    setError('')
    try {
      if (editVenue?.id) {
        await updateVenue(editVenue.id, form)
      } else {
        await createVenue(form)
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.message || 'Không thể lưu địa điểm')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-[800px] flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#c3c6d7] px-6 py-4">
          <h2 className="text-lg font-bold text-[#111827]">
            {editVenue ? 'Sửa địa điểm' : 'Thêm địa điểm'}
          </h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-[#737686]">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2">
            <div className="space-y-3 border-b border-[#c3c6d7] p-5 md:border-b-0 md:border-r">
              <div>
                <label className="mb-1 block text-xs font-bold text-[#737686]">Tên địa điểm*</label>
                <input
                  className="h-10 w-full rounded-md border border-[#c3c6d7] px-3 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="relative">
                <label className="mb-1 block text-xs font-bold text-[#737686]">Địa chỉ*</label>
                <input
                  className="h-10 w-full rounded-md border border-[#c3c6d7] px-3 text-sm"
                  value={form.address_line}
                  onChange={(e) => setForm((f) => ({ ...f, address_line: e.target.value }))}
                  onFocus={() => suggestions.length && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Nhập địa chỉ để tìm kiếm..."
                  autoComplete="off"
                />
                {searching && (
                  <span className="absolute right-3 top-9 text-xs text-[#737686]">Đang tìm...</span>
                )}
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[#c3c6d7] bg-white shadow-lg">
                    {suggestions.map((item) => (
                      <li key={item.place_id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-[#f2f4f6]"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSuggestion(item)}
                        >
                          {item.display_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[#737686]">Thành phố*</label>
                <input
                  className="h-10 w-full rounded-md border border-[#c3c6d7] px-3 text-sm"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#737686]">Quận/Huyện</label>
                  <input
                    className="h-10 w-full rounded-md border border-[#c3c6d7] px-3 text-sm"
                    value={form.district}
                    onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#737686]">Phường/Xã</label>
                  <input
                    className="h-10 w-full rounded-md border border-[#c3c6d7] px-3 text-sm"
                    value={form.ward}
                    onChange={(e) => setForm((f) => ({ ...f, ward: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[#737686]">Mô tả</label>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-[#c3c6d7] px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="p-5">
              <p className="mb-2 text-xs font-bold text-[#737686]">Bản đồ (OpenStreetMap)</p>
              <div ref={mapRef} className="z-0 h-[380px] w-full cursor-crosshair rounded-md border border-[#c3c6d7]" />
              <p className="mt-2 text-xs text-[#737686]">
                Click trên bản đồ, kéo marker hoặc chọn gợi ý địa chỉ để tự động điền.
              </p>
              {geocoding && (
                <p className="mt-1 text-xs font-medium text-primary">Đang lấy địa chỉ...</p>
              )}
            </div>
          </div>
          {error && <p className="px-5 text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 border-t border-[#c3c6d7] px-5 py-4">
            <button type="button" onClick={onClose} className="admin-secondary">
              Hủy
            </button>
            <button type="submit" disabled={saving} className="admin-primary">
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function VenueCard({ venue, onEdit, onDelete }) {
  const location = [venue.city, venue.district].filter(Boolean).join(', ')

  return (
    <div className="rounded-md border border-[#c3c6d7] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#dbe1ff] text-primary">
          <MapPin className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-[#111827]">{venue.name}</h3>
          <p className="mt-1 text-sm text-[#434655]">{location || venue.address_line}</p>
          <p className="mt-2 text-xs text-[#737686]">
            {venue.seat_map_count || 0} sơ đồ · {venue.total_seats || 0} ghế
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/organizer/venues/${venue.id}/seat-maps`}
          className="admin-secondary text-xs"
        >
          Sơ đồ ghế
        </Link>
        <button type="button" onClick={() => onEdit(venue)} className="admin-secondary text-xs">
          <Pencil className="size-3.5" />
          Sửa
        </button>
        <button
          type="button"
          onClick={() => onDelete(venue)}
          className="flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
        >
          <Trash2 className="size-3.5" />
          Xóa
        </button>
      </div>
    </div>
  )
}

export function OrganizerVenuesPage() {
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editVenue, setEditVenue] = useState(null)
  const [message, setMessage] = useState('')

  const loadVenues = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getVenues()
      setVenues(data)
    } catch (err) {
      console.error(err)
      setMessage('Không thể tải danh sách địa điểm.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadVenues()
  }, [loadVenues])

  const filtered = venues.filter((v) => {
    const q = search.toLowerCase()
    return (
      v.name?.toLowerCase().includes(q) ||
      v.city?.toLowerCase().includes(q) ||
      v.address_line?.toLowerCase().includes(q)
    )
  })

  function openCreate() {
    setEditVenue(null)
    setModalOpen(true)
  }

  function openEdit(venue) {
    setEditVenue(venue)
    setModalOpen(true)
  }

  async function handleDelete(venue) {
    if (!window.confirm(`Xóa địa điểm "${venue.name}"?`)) return
    try {
      await deleteVenue(venue.id)
      setMessage('Đã xóa địa điểm.')
      loadVenues()
    } catch (err) {
      console.error(err)
      setMessage(err.response?.data?.message || 'Không thể xóa địa điểm.')
    }
  }

  return (
    <OrganizerPage
      title="Quản lý địa điểm"
      description="Tạo và quản lý địa điểm tổ chức sự kiện, kèm sơ đồ ghế."
      action="Thêm địa điểm"
      onAction={openCreate}
    >
      <div className="mb-5">
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#737686]" />
          <input
            className="h-10 w-full rounded-md border border-[#c3c6d7] bg-[#f7f9fb] pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder="Tìm theo tên, thành phố..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {message && <p className="mb-4 text-sm text-[#434655]">{message}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : !filtered.length ? (
        <div className="rounded-md border border-dashed border-[#c3c6d7] py-16 text-center text-sm text-[#737686]">
          Chưa có địa điểm nào. Nhấn &quot;Thêm địa điểm&quot; để bắt đầu.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((venue) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <VenueFormModal
        open={modalOpen}
        editVenue={editVenue}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setMessage(editVenue ? 'Đã cập nhật địa điểm.' : 'Đã tạo địa điểm mới.')
          loadVenues()
        }}
      />
    </OrganizerPage>
  )
}
