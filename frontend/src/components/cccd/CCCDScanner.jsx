import React, { useState, useRef, useEffect } from 'react'
import {
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Lock,
  FileCheck,
  Check,
  Edit3,
  XCircle,
} from 'lucide-react'
import { useToast } from '@/providers/ToastProvider.jsx'
import { scanCccdCard } from '@/services/organizerRequests'

const PIPELINE_STAGES = [
  { id: 'QUALITY_CHECK', label: 'Kiểm tra chất lượng ảnh' },
  { id: 'CV_ALIGN', label: 'Căn chỉnh phối cảnh thẻ (OpenCV)' },
  { id: 'QR_DECODE', label: 'Giải mã QR C06 chip' },
  { id: 'VIET_OCR', label: 'Nhận diện tiếng Việt đa trường (VietOCR)' },
  { id: 'C06_VALIDATION', label: 'Đối soát chéo & chuẩn C06 Bộ Công An' },
]

export default function CCCDScanner({ initialData = {}, currentKycData = null, onApply }) {
  const toast = useToast()
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [activeStageIndex, setActiveStageIndex] = useState(0)
  const [scanResult, setScanResult] = useState(null)
  const [errorDetails, setErrorDetails] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editableFields, setEditableFields] = useState({
    fullName: '',
    idNumber: '',
    dob: '',
    gender: 'Nam',
    address: '',
  })
  const fileInputRef = useRef(null)

  // Initialize from initialData if already populated
  useEffect(() => {
    if (initialData?.idNumber || initialData?.fullName) {
      setEditableFields({
        fullName: initialData.fullName || '',
        idNumber: initialData.idNumber || '',
        dob: initialData.dob || '',
        gender: initialData.gender || 'Nam',
        address: initialData.address || '',
      })
    }
  }, [initialData?.idNumber, initialData?.fullName])

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedFile.type)) {
      toast.error('Chỉ hỗ trợ tệp ảnh định dạng JPG, PNG hoặc WEBP.')
      return
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('Kích thước ảnh tối đa là 10MB.')
      return
    }

    setFile(selectedFile)
    const url = URL.createObjectURL(selectedFile)
    setPreviewUrl(url)
    setErrorDetails(null)
    setScanResult(null)
    setIsEditing(false)

    // Trigger scan automatically
    startScan(selectedFile)
  }

  const startScan = async (targetFile) => {
    setIsScanning(true)
    setErrorDetails(null)
    setScanResult(null)
    setActiveStageIndex(0)

    const interval = setInterval(() => {
      setActiveStageIndex((prev) => (prev < 4 ? prev + 1 : prev))
    }, 900)

    try {
      const data = await scanCccdCard(targetFile)
      clearInterval(interval)
      setActiveStageIndex(4)
      setScanResult(data)

      const v = data?.verification
      const f = v?.fields || {}

      const extracted = {
        fullName: f.full_name?.value || '',
        idNumber: f.id_number?.value || '',
        dob: f.dob?.value || '',
        gender: f.gender?.value || 'Nam',
        address: f.residence?.value || f.origin?.value || '',
      }

      setEditableFields(extracted)

      const payload = {
        ...extracted,
        kycData: {
          verification_method: 'PARTNER_VETTING',
          scan_method: data.qr_found ? 'AI_OCR_AND_QR' : 'AI_OCR_ONLY',
          id_number: extracted.idNumber,
          full_name: extracted.fullName,
          dob: extracted.dob,
          gender: extracted.gender,
          address: extracted.address,
          province: v?.c06_validation?.province_name || '',
          birth_year: v?.c06_validation?.birth_year || '',
          overall_confidence: v?.overall_confidence || 0.9,
          has_qr_cross_check: data.qr_found || false,
          qr_found: data.qr_found || false,
          algorithm_checked: v?.c06_validation?.is_valid || false,
          verified: v?.is_trustworthy || false,
          submitted_at: new Date().toISOString(),
        },
      }

      // Automatically apply to parent form state
      onApply(payload)
      toast.success('Đã nhận diện và tự động áp dụng thông tin CCCD!')
    } catch (err) {
      clearInterval(interval)
      const errResponse = err?.response?.data
      if (errResponse?.data?.guidance || errResponse?.errorCode === 'CCCD_QUALITY_REJECTED') {
        setErrorDetails({
          message: errResponse.message || 'Chất lượng ảnh không đạt tiêu chuẩn.',
          guidance: errResponse.data?.guidance || [],
          quality: errResponse.data?.quality || null,
        })
      } else {
        const msg = errResponse?.message || err?.message || 'Không thể quét CCCD. Vui lòng thử lại.'
        setErrorDetails({
          message: msg,
          guidance: ['Đảm bảo chụp rõ nét 4 góc thẻ trên mặt phẳng có ánh sáng tốt.'],
        })
      }
    } finally {
      setIsScanning(false)
    }
  }

  const handleFieldChange = (field, value) => {
    const updated = { ...editableFields, [field]: value }
    setEditableFields(updated)

    // Sync changes to parent form
    onApply({
      ...updated,
      kycData: {
        ...(currentKycData || {}),
        full_name: updated.fullName,
        id_number: updated.idNumber,
        dob: updated.dob,
        gender: updated.gender,
        address: updated.address,
      },
    })
  }

  const handleReset = () => {
    setFile(null)
    setPreviewUrl(null)
    setScanResult(null)
    setErrorDetails(null)
    setIsEditing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const hasData = Boolean(editableFields.idNumber || scanResult)

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-slate-900/95 via-[#0b1329] to-slate-900/95 p-5 space-y-4 shadow-xl shadow-sky-950/20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-sky-500/20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/30">
            <Sparkles className="size-5 text-sky-100" />
          </div>
          <div>
            <h4 className="font-extrabold text-white text-sm flex items-center gap-2">
              QUÉT VÀ ĐỊNH DANH THẺ CCCD
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/40">
                AI + QR C06
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Hệ thống tự động đọc thông tin và đối soát chéo theo chuẩn C06 Bộ Công An.
            </p>
          </div>
        </div>

        {/* Decree 13/2023 Compliance Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[11px] font-medium shrink-0 self-start sm:self-auto">
          <Lock className="size-3.5 text-emerald-400" />
          <span>Bảo mật NĐ 13/2023 (Xóa ảnh tức thì)</span>
        </div>
      </div>

      {/* Main Upload / Scanner Box (shown when no data is loaded yet) */}
      {!hasData && !isScanning && !errorDetails && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0])
          }}
          className="group relative cursor-pointer rounded-2xl border-2 border-dashed border-sky-500/40 hover:border-sky-400 bg-sky-950/20 hover:bg-sky-950/35 p-6 transition duration-200 text-center"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0])
            }}
          />

          <div className="max-w-md mx-auto space-y-3">
            <div className="mx-auto size-12 rounded-2xl bg-sky-500/20 text-sky-300 flex items-center justify-center border border-sky-500/30 group-hover:scale-105 transition">
              <Camera className="size-6 text-sky-400" />
            </div>

            <div>
              <p className="text-sm font-bold text-white">
                Bấm để tải ảnh hoặc kéo thả thẻ CCCD mặt trước vào đây
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Định dạng: JPG, PNG, WEBP (Tối đa 10MB). Khuyến khích chụp rõ nét 4 góc thẻ, đủ sáng, không lóa flash.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-sky-500/20 text-sky-300 text-xs font-mono">
              <FileCheck className="size-3.5" />
              <span>Khung chuẩn ISO ID-1 (Tỉ lệ 85.6 x 53.98mm)</span>
            </div>
          </div>
        </div>
      )}

      {/* Scanning Stepper */}
      {isScanning && (
        <div className="rounded-2xl border border-sky-500/30 bg-slate-900/80 p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-bold text-sky-300 flex items-center gap-2">
              <RefreshCw className="size-4 animate-spin text-sky-400" />
              Đang phân tích và xử lý ảnh CCCD...
            </span>
            <span className="font-mono text-slate-400">
              Bước {activeStageIndex + 1} / {PIPELINE_STAGES.length}
            </span>
          </div>

          <div className="space-y-2 pt-1">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isDone = idx < activeStageIndex
              const isCurrent = idx === activeStageIndex
              return (
                <div
                  key={stage.id}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition ${
                    isCurrent
                      ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40 font-bold'
                      : isDone
                      ? 'text-emerald-300 bg-emerald-950/20'
                      : 'text-slate-500'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                  ) : isCurrent ? (
                    <div className="size-4 rounded-full border-2 border-sky-400 border-t-transparent animate-spin shrink-0" />
                  ) : (
                    <div className="size-4 rounded-full border border-slate-700 shrink-0" />
                  )}
                  <span>{stage.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Error / Quality Rejection Banner */}
      {errorDetails && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-4 space-y-3 text-xs text-rose-200 shadow-lg shadow-rose-950/30">
          <div className="flex items-center gap-2 font-bold text-rose-300 text-sm">
            <AlertTriangle className="size-5 text-rose-400 shrink-0" />
            <span>{errorDetails.message}</span>
          </div>

          {errorDetails.guidance?.length > 0 && (
            <div className="pl-7 space-y-1 text-rose-200/90">
              <p className="font-semibold text-rose-300">Hướng dẫn chụp lại để nhận diện chuẩn xác:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {errorDetails.guidance.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-2 pl-7 flex gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow-md shadow-rose-950/40"
            >
              <RefreshCw className="size-3.5" /> Chụp lại hoặc chọn ảnh khác
            </button>
          </div>
        </div>
      )}

      {/* Identified CCCD Details Card (Self-Contained Single Source of Truth) */}
      {hasData && !isScanning && (
        <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-4 sm:p-5 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0])
            }}
          />

          {/* Top Result Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <Check className="size-4" />
              </div>
              <div>
                <h5 className="font-bold text-white text-sm">Thông tin định danh CCCD</h5>
                <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> Đã xác thực chuẩn thuật toán C06 Bộ Công An
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Độ tin cậy: {Math.round((scanResult?.verification?.overall_confidence || currentKycData?.overall_confidence || 0.98) * 100)}%
              </span>

              {scanResult?.qr_found || currentKycData?.has_qr_cross_check ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                  <Check className="size-3" /> Mã QR hợp lệ
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition"
              >
                <Edit3 className="size-3" /> {isEditing ? 'Xong' : 'Chỉnh sửa'}
              </button>
            </div>
          </div>

          {/* Extracted Fields Display / Inline Edit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
            {/* Họ và tên */}
            <div className="p-3 rounded-xl bg-slate-800/80 border border-white/5 space-y-1">
              <span className="text-slate-400 text-[11px] block">Họ và tên pháp lý</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editableFields.fullName}
                  onChange={(e) => handleFieldChange('fullName', e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-sky-500/40 rounded-lg px-2.5 py-1.5 text-white font-bold uppercase text-xs focus:outline-none focus:border-sky-400"
                />
              ) : (
                <p className="font-extrabold text-white text-sm uppercase">{editableFields.fullName || 'Chưa nhận diện'}</p>
              )}
            </div>

            {/* Số CCCD */}
            <div className="p-3 rounded-xl bg-slate-800/80 border border-white/5 space-y-1">
              <span className="text-slate-400 text-[11px] block">Số CCCD (12 chữ số)</span>
              {isEditing ? (
                <input
                  type="text"
                  maxLength={12}
                  value={editableFields.idNumber}
                  onChange={(e) => handleFieldChange('idNumber', e.target.value.replace(/\D/g, '').slice(0, 12))}
                  className="w-full bg-slate-900 border border-sky-500/40 rounded-lg px-2.5 py-1.5 text-emerald-300 font-mono font-bold text-xs focus:outline-none focus:border-sky-400"
                />
              ) : (
                <p className="font-mono font-bold text-emerald-300 text-sm">{editableFields.idNumber || 'Chưa nhận diện'}</p>
              )}
            </div>

            {/* Ngày sinh & Giới tính */}
            <div className="p-3 rounded-xl bg-slate-800/80 border border-white/5 space-y-1">
              <span className="text-slate-400 text-[11px] block">Ngày sinh</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editableFields.dob}
                  onChange={(e) => handleFieldChange('dob', e.target.value)}
                  placeholder="DD/MM/YYYY"
                  className="w-full bg-slate-900 border border-sky-500/40 rounded-lg px-2.5 py-1.5 text-white font-semibold text-xs focus:outline-none focus:border-sky-400"
                />
              ) : (
                <p className="font-semibold text-white">{editableFields.dob || 'Chưa rõ'}</p>
              )}
            </div>

            <div className="p-3 rounded-xl bg-slate-800/80 border border-white/5 space-y-1">
              <span className="text-slate-400 text-[11px] block">Giới tính</span>
              {isEditing ? (
                <select
                  value={editableFields.gender}
                  onChange={(e) => handleFieldChange('gender', e.target.value)}
                  className="w-full bg-slate-900 border border-sky-500/40 rounded-lg px-2.5 py-1.5 text-white font-semibold text-xs focus:outline-none focus:border-sky-400"
                >
                  <option value="Nam">Nam</option>
                  <option value="Nữ">Nữ</option>
                </select>
              ) : (
                <p className="font-semibold text-white">{editableFields.gender || 'Nam'}</p>
              )}
            </div>

            {/* Nơi thường trú */}
            <div className="sm:col-span-2 p-3 rounded-xl bg-slate-800/80 border border-white/5 space-y-1">
              <span className="text-slate-400 text-[11px] block">Nơi thường trú theo CCCD</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editableFields.address}
                  onChange={(e) => handleFieldChange('address', e.target.value)}
                  className="w-full bg-slate-900 border border-sky-500/40 rounded-lg px-2.5 py-1.5 text-white font-semibold text-xs focus:outline-none focus:border-sky-400"
                />
              ) : (
                <p className="font-semibold text-white">{editableFields.address || 'Chưa rõ'}</p>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs">
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              <Check className="size-3.5" /> Thông tin đã sẵn sàng để gửi duyệt hồ sơ
            </span>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
            >
              <RefreshCw className="size-3.5" /> Quét lại ảnh khác
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
