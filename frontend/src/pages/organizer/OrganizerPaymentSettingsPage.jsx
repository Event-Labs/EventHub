import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Loader2, Save, Wifi } from 'lucide-react'
import { http as api } from '@/services/http.js'

export function OrganizerPaymentSettingsPage() {
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  
  const [channel, setChannel] = useState(null)
  
  const [formData, setFormData] = useState({
    client_id: '',
    api_key: '',
    checksum_key: ''
  })
  
  const [error, setError] = useState(location.state?.error || null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    fetchChannel()
  }, [])

  const fetchChannel = async () => {
    try {
      setLoading(true)
      const res = await api.get('/organizer/payments/channel')
      if (res.data) {
        setChannel(res.data)
        setFormData({
          client_id: res.data.client_id || '',
          api_key: res.data.api_key_encrypted || '',
          checksum_key: res.data.checksum_key_encrypted || ''
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    try {
      setSaving(true)
      setError(null)
      setSuccess(null)
      const res = await api.post('/organizer/payments/channel', formData)
      setChannel(res.data)
      setSuccess('Đã lưu cấu hình thành công.')
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể lưu cấu hình.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  const isActive = channel?.status === 'ACTIVE'

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-extrabold text-[#191c1e] tracking-tight">Cấu hình Thanh toán</h1>
        <p className="mt-2 text-[#434655] text-lg">
          Thiết lập tài khoản PayOS để nhận tiền bán vé trực tiếp về tài khoản của bạn.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#e5e7eb] transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
        <div className="border-b border-[#e5e7eb] bg-gradient-to-r from-slate-50 to-white px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                <Wifi className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold text-[#191c1e] text-lg">Cổng thanh toán PayOS</h3>
                <p className="text-sm text-[#434655]">Hỗ trợ quét mã QR VietQR tự động</p>
              </div>
            </div>
            {channel && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {isActive ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <AlertCircle className="size-3.5" />
                )}
                {channel.status}
              </span>
            )}
          </div>
        </div>

        <div className="p-6 md:p-8">
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 flex items-start gap-3 border border-red-100 animate-in fade-in">
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700 flex items-start gap-3 border border-emerald-100 animate-in fade-in">
              <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
              <p className="font-medium">{success}</p>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#191c1e]">
                  Client ID
                </label>
                <input
                  type="text"
                  required
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full rounded-xl border border-[#c3c6d7] bg-white px-4 py-2.5 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-[#8f91a0]"
                  placeholder="Nhập Client ID"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#191c1e]">
                  API Key
                </label>
                <input
                  type="password"
                  required
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  className="w-full rounded-xl border border-[#c3c6d7] bg-white px-4 py-2.5 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-[#8f91a0]"
                  placeholder="Nhập API Key"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#191c1e]">
                  Checksum Key
                </label>
                <input
                  type="password"
                  required
                  value={formData.checksum_key}
                  onChange={(e) => setFormData({ ...formData, checksum_key: e.target.value })}
                  className="w-full rounded-xl border border-[#c3c6d7] bg-white px-4 py-2.5 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 hover:border-[#8f91a0]"
                  placeholder="Nhập Checksum Key"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-[#e5e7eb]">
              <button
                type="submit"
                disabled={saving || testing}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-primary/90 disabled:opacity-50 active:scale-95"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Lưu cấu hình
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
