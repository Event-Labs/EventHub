import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Cpu,
  Edit3,
  Eye,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldOff,
  Trash2,
  Unlock,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import {
  approveAdminDevice,
  deleteAdminDevice,
  disableAdminDevice,
  enableAdminDevice,
  fetchAdminDeviceDetail,
  fetchAdminDevices,
  fetchAssignableEvents,
  resetAdminDevicePairing,
  revokeAdminDevice,
  updateAdminDevice,
} from '@/services/adminDevices.js'
import { getApiMessage } from '@/lib/messages.js'
import { useToast } from '@/providers/ToastProvider.jsx'
import { Modal } from '@/components/Modal.jsx'
import { CosmicSelect } from '@/components/CosmicSelect.jsx'
import { useLanguage } from '@/i18n/LanguageContext.jsx'
import {
  Badge,
  KpiGrid,
  Page,
  Panel,
  StatusBadge,
  Table,
  TableActionButton,
} from './AdminComponents.jsx'

function formatDateTime(value, isEnglish = false) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(isEnglish ? 'en-US' : 'vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function formatRelativeTime(value, isEnglish = false) {
  if (!value) return isEnglish ? 'Never seen' : 'Chưa kết nối'
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (diffSec < 15) return isEnglish ? 'Just now' : 'Vừa xong'
  if (diffSec < 60) return isEnglish ? `${diffSec}s ago` : `${diffSec} giây trước`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return isEnglish ? `${diffMin}m ago` : `${diffMin} phút trước`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return isEnglish ? `${diffHour}h ago` : `${diffHour} giờ trước`
  const diffDay = Math.floor(diffHour / 24)
  return isEnglish ? `${diffDay}d ago` : `${diffDay} ngày trước`
}

function formatUptime(sec, isEnglish = false) {
  if (sec === null || sec === undefined) return '—'
  const s = Number(sec)
  if (!Number.isFinite(s)) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rem = s % 60
  if (h > 0) return isEnglish ? `${h}h ${m}m` : `${h}g ${m}p`
  if (m > 0) return isEnglish ? `${m}m ${rem}s` : `${m}p ${rem}s`
  return `${rem}s`
}

function formatHeap(bytes) {
  if (bytes === null || bytes === undefined) return '—'
  const kb = Number(bytes) / 1024
  return Number.isFinite(kb) ? `${kb.toFixed(1)} KB` : '—'
}

function getDeviceStatusMeta(status, isEnglish = false) {
  switch (status) {
    case 'PENDING':
      return { tone: 'amber', label: isEnglish ? 'Pending Approval' : 'Chờ duyệt' }
    case 'ACTIVE':
      return { tone: 'green', label: isEnglish ? 'Active' : 'Hoạt động' }
    case 'DISABLED':
      return { tone: 'orange', label: isEnglish ? 'Disabled' : 'Đã khóa' }
    case 'REVOKED':
      return { tone: 'red', label: isEnglish ? 'Revoked' : 'Đã thu hồi' }
    default:
      return { tone: 'gray', label: status || '—' }
  }
}

function getRssiMeta(rssi, isEnglish = false) {
  if (rssi === null || rssi === undefined) return { label: '—', tone: 'text-slate-400' }
  const val = Number(rssi)
  if (val >= -60) return { label: `${val} dBm (${isEnglish ? 'Strong' : 'Mạnh'})`, tone: 'text-emerald-400' }
  if (val >= -75) return { label: `${val} dBm (${isEnglish ? 'Fair' : 'Khá'})`, tone: 'text-amber-400' }
  return { label: `${val} dBm (${isEnglish ? 'Weak' : 'Yếu'})`, tone: 'text-rose-400' }
}

const emptyConfigForm = {
  name: '',
  assigned_event_id: '',
  auto_confirm: false,
}

export function AdminDevicesPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { isEnglish } = useLanguage()

  const [filters, setFilters] = useState({
    status: 'ALL',
    online: 'ALL',
    event_id: '',
    search: '',
  })

  // Modals state
  const [configModal, setConfigModal] = useState({ open: false, mode: 'approve', device: null })
  const [configForm, setConfigForm] = useState(emptyConfigForm)
  const [detailDeviceId, setDetailDeviceId] = useState(null)
  const [confirmModal, setConfirmModal] = useState({ open: false, action: null, device: null })

  const devicesQuery = useQuery({
    queryKey: ['admin-devices', filters],
    queryFn: () => fetchAdminDevices(filters),
    refetchInterval: 10000,
  })

  const eventsQuery = useQuery({
    queryKey: ['admin-devices-assignable-events'],
    queryFn: fetchAssignableEvents,
  })

  const detailQuery = useQuery({
    queryKey: ['admin-device-detail', detailDeviceId],
    queryFn: () => fetchAdminDeviceDetail(detailDeviceId),
    enabled: Boolean(detailDeviceId),
  })

  const devices = useMemo(() => devicesQuery.data?.items || [], [devicesQuery.data?.items])
  const stats = devicesQuery.data?.stats || {
    total: 0,
    pending: 0,
    active: 0,
    online: 0,
    disabled: 0,
    revoked: 0,
  }
  const assignableEvents = useMemo(() => eventsQuery.data || [], [eventsQuery.data])

  const pendingDevices = useMemo(
    () => devices.filter((d) => d.status === 'PENDING'),
    [devices],
  )

  const eventOptions = useMemo(() => {
    const base = [
      { value: '', label: isEnglish ? 'Unassigned (Select later)' : 'Chưa gán sự kiện' },
    ]
    return base.concat(
      assignableEvents.map((ev) => ({
        value: ev.id,
        label: `${ev.title}${ev.slug ? ` (${ev.slug})` : ''}`,
      })),
    )
  }, [assignableEvents, isEnglish])

  const filterEventOptions = useMemo(() => {
    const base = [
      { value: '', label: isEnglish ? 'All Events' : 'Tất cả sự kiện' },
    ]
    return base.concat(
      assignableEvents.map((ev) => ({
        value: ev.id,
        label: ev.title,
      })),
    )
  }, [assignableEvents, isEnglish])

  const invalidateDevices = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-devices'] })
    if (detailDeviceId) {
      queryClient.invalidateQueries({ queryKey: ['admin-device-detail', detailDeviceId] })
    }
  }

  const approveMutation = useMutation({
    mutationFn: ({ id, payload }) => approveAdminDevice(id, payload),
    onSuccess: () => {
      toast.success(
        isEnglish
          ? 'Device approved. It will claim credentials automatically.'
          : 'Đã duyệt thiết bị. Thiết bị sẽ tự động nhận khóa bảo mật trong vài giây.',
      )
      closeConfigModal()
      invalidateDevices()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, isEnglish ? 'Failed to approve device.' : 'Không thể duyệt thiết bị.'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateAdminDevice(id, payload),
    onSuccess: () => {
      toast.success(isEnglish ? 'Device configuration updated.' : 'Đã cập nhật cấu hình thiết bị.')
      closeConfigModal()
      invalidateDevices()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, isEnglish ? 'Failed to update device.' : 'Không thể cập nhật thiết bị.'))
    },
  })

  const actionMutation = useMutation({
    mutationFn: async ({ action, id }) => {
      switch (action) {
        case 'disable':
          return disableAdminDevice(id)
        case 'enable':
          return enableAdminDevice(id)
        case 'revoke':
          return revokeAdminDevice(id)
        case 'reset-pairing':
          return resetAdminDevicePairing(id)
        case 'delete':
          return deleteAdminDevice(id)
        default:
          throw new Error('Unsupported action')
      }
    },
    onSuccess: (_data, variables) => {
      const messages = {
        disable: isEnglish ? 'Device disabled.' : 'Đã khóa thiết bị từ xa.',
        enable: isEnglish ? 'Device re-enabled.' : 'Đã mở khóa thiết bị.',
        revoke: isEnglish ? 'Device access revoked.' : 'Đã thu hồi quyền thiết bị.',
        'reset-pairing': isEnglish ? 'Device pairing reset.' : 'Đã đặt lại trạng thái ghép nối.',
        delete: isEnglish ? 'Device deleted.' : 'Đã xóa thiết bị.',
      }
      toast.success(messages[variables.action] || 'Thành công')
      setConfirmModal({ open: false, action: null, device: null })
      invalidateDevices()
    },
    onError: (err) => {
      toast.error(getApiMessage(err, isEnglish ? 'Operation failed.' : 'Thao tác thất bại.'))
    },
  })

  const openApproveModal = (device) => {
    setConfigForm({
      name: device.name || '',
      assigned_event_id: device.assigned_event_id || '',
      auto_confirm: Boolean(device.auto_confirm),
    })
    setConfigModal({ open: true, mode: 'approve', device })
  }

  const openEditModal = (device) => {
    setConfigForm({
      name: device.name || '',
      assigned_event_id: device.assigned_event_id || '',
      auto_confirm: Boolean(device.auto_confirm),
    })
    setConfigModal({ open: true, mode: 'edit', device })
  }

  const closeConfigModal = () => {
    setConfigModal({ open: false, mode: 'approve', device: null })
    setConfigForm(emptyConfigForm)
  }

  const submitConfigForm = (e) => {
    e.preventDefault()
    if (!configModal.device) return

    const trimmedName = configForm.name.trim()
    if (!trimmedName) {
      toast.error(isEnglish ? 'Please enter a device name.' : 'Vui lòng nhập tên thiết bị.')
      return
    }

    const payload = {
      name: trimmedName,
      assigned_event_id: configForm.assigned_event_id || null,
      auto_confirm: Boolean(configForm.auto_confirm),
    }

    if (configModal.mode === 'approve') {
      approveMutation.mutate({ id: configModal.device.id, payload })
    } else {
      updateMutation.mutate({ id: configModal.device.id, payload })
    }
  }

  const openConfirmModal = (action, device) => {
    setConfirmModal({ open: true, action, device })
  }

  const confirmDialogConfig = useMemo(() => {
    const devName = confirmModal.device?.name || confirmModal.device?.mac_address || ''
    switch (confirmModal.action) {
      case 'disable':
        return {
          title: isEnglish ? 'Disable Device' : 'Khóa thiết bị check-in',
          body: isEnglish
            ? `Device "${devName}" will immediately receive HTTP 403 and cannot scan tickets until re-enabled.`
            : `Thiết bị "${devName}" sẽ bị từ chối ngay lập tức (HTTP 403) và không thể quét vé cho tới khi được mở khóa lại.`,
          btnLabel: isEnglish ? 'Disable Device' : 'Xác nhận khóa',
          btnClass: 'admin-primary bg-amber-500 border-none text-slate-950 font-extrabold hover:bg-amber-400',
        }
      case 'enable':
        return {
          title: isEnglish ? 'Enable Device' : 'Mở khóa thiết bị',
          body: isEnglish
            ? `Re-enable "${devName}" so it can resume scanning tickets using its existing secret.`
            : `Mở khóa lại thiết bị "${devName}" để tiếp tục hoạt động với khóa xác thực hiện tại.`,
          btnLabel: isEnglish ? 'Enable Device' : 'Mở khóa',
          btnClass: 'admin-primary bg-emerald-500 border-none text-slate-950 font-extrabold hover:bg-emerald-400',
        }
      case 'revoke':
        return {
          title: isEnglish ? 'Revoke Device Credentials' : 'Thu hồi quyền thiết bị',
          body: isEnglish
            ? `This permanently invalidates the secret and event assignment for "${devName}". The device must re-register and be approved again to work.`
            : `Thao tác này xóa vĩnh viễn khóa xác thực và hủy gán sự kiện của "${devName}". Thiết bị sẽ phải đăng ký ghép nối lại từ đầu.`,
          btnLabel: isEnglish ? 'Revoke Access' : 'Thu hồi quyền',
          btnClass: 'admin-primary bg-rose-500 border-none text-white font-extrabold hover:bg-rose-400',
        }
      case 'reset-pairing':
        return {
          title: isEnglish ? 'Reset Device Pairing' : 'Đặt lại ghép nối (Re-pair)',
          body: isEnglish
            ? `Use this when "${devName}" had its flash erased. Current secret will be cleared so the device can call /register and pair again.`
            : `Dùng khi thiết bị "${devName}" bị xóa bộ nhớ flash. Khóa cũ sẽ bị hủy để thiết bị có thể gọi /register và chờ Admin duyệt lại.`,
          btnLabel: isEnglish ? 'Reset Pairing' : 'Đặt lại ghép nối',
          btnClass: 'admin-primary bg-amber-500 border-none text-slate-950 font-extrabold hover:bg-amber-400',
        }
      case 'delete':
        return {
          title: isEnglish ? 'Delete Device' : 'Xóa thiết bị',
          body: isEnglish
            ? `Remove "${devName}" from the device registry? Historical ticket check-in records remain preserved.`
            : `Xóa thiết bị "${devName}" khỏi danh sách? Lịch sử check-in trên các vé đã quét vẫn được giữ nguyên.`,
          btnLabel: isEnglish ? 'Delete' : 'Xóa thiết bị',
          btnClass: 'admin-primary bg-rose-500 border-none text-white font-extrabold hover:bg-rose-400',
        }
      default:
        return { title: '', body: '', btnLabel: '', btnClass: 'admin-primary' }
    }
  }, [confirmModal, isEnglish])

  const kpiItems = [
    {
      label: isEnglish ? 'Total Devices' : 'Tổng thiết bị',
      value: stats.total,
      sub: isEnglish ? 'ESP32-S3 terminals' : 'Thiết bị phần cứng ESP32-S3',
    },
    {
      label: isEnglish ? 'Online Now' : 'Đang trực tuyến',
      value: stats.online,
      change: stats.online > 0 ? (isEnglish ? 'Live heartbeat' : 'Heartbeat ổn định') : null,
      sub: stats.online === 0 ? (isEnglish ? 'No active heartbeat' : 'Chưa có thiết bị online') : null,
    },
    {
      label: isEnglish ? 'Pending Approval' : 'Chờ duyệt ghép nối',
      value: stats.pending,
      change: stats.pending > 0 ? (isEnglish ? 'Urgent action' : 'Cần duyệt ngay') : null,
      sub: stats.pending === 0 ? (isEnglish ? 'All paired' : 'Không có yêu cầu mới') : null,
    },
    {
      label: isEnglish ? 'Disabled / Revoked' : 'Đã khóa / Thu hồi',
      value: Number(stats.disabled || 0) + Number(stats.revoked || 0),
      sub: `${stats.disabled || 0} ${isEnglish ? 'disabled' : 'khóa'} • ${stats.revoked || 0} ${isEnglish ? 'revoked' : 'thu hồi'}`,
    },
  ]

  const headers = [
    isEnglish ? 'Device' : 'Thiết bị',
    isEnglish ? 'Status & Pairing' : 'Trạng thái & Mã ghép nối',
    isEnglish ? 'Connection' : 'Kết nối & Tín hiệu',
    isEnglish ? 'Assigned Event' : 'Sự kiện được gán',
    isEnglish ? 'Check-in Mode' : 'Chế độ & Thống kê',
    { label: isEnglish ? 'Actions' : 'Thao tác', align: 'center' },
  ]

  const rows = devices.map((device) => {
    const statusMeta = getDeviceStatusMeta(device.status, isEnglish)
    const rssiMeta = getRssiMeta(device.last_rssi, isEnglish)

    return [
      // 1. Device info
      <div key="device" className="min-w-[190px]">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Cpu className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-white [html.light_&]:text-[#0D1B2A]">
              {device.name || (isEnglish ? 'Unnamed ESP32' : 'Thiết bị chưa đặt tên')}
            </p>
            <p className="font-mono text-xs text-slate-400 [html.light_&]:text-slate-600">
              {device.mac_address}
            </p>
          </div>
        </div>
        {(device.hardware || device.firmware_version) && (
          <p className="mt-1.5 text-[11px] text-slate-400">
            {[device.hardware, device.firmware_version ? `fw ${device.firmware_version}` : null]
              .filter(Boolean)
              .join(' • ')}
          </p>
        )}
      </div>,

      // 2. Status & pairing code
      <div key="status" className="space-y-1.5">
        <StatusBadge status={device.status} tone={statusMeta.tone} label={statusMeta.label} dot />
        {device.status === 'PENDING' && device.pairing_code && (
          <div className="flex items-center gap-1.5">
            <span className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 font-mono text-xs font-black tracking-widest text-amber-300 [html.light_&]:text-amber-800">
              {device.pairing_code}
            </span>
          </div>
        )}
        {device.status === 'ACTIVE' && device.has_pending_claim && (
          <p className="text-[11px] font-semibold text-amber-300 [html.light_&]:text-amber-700">
            {isEnglish ? 'Waiting ESP32 to claim secret...' : 'Đang chờ ESP32 nhận secret...'}
          </p>
        )}
      </div>,

      // 3. Connection / Online / IP / RSSI
      <div key="connection" className="min-w-[160px] space-y-1">
        <div className="flex items-center gap-1.5">
          {device.is_online ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 [html.light_&]:text-emerald-700">
              <Wifi className="size-3" />
              {isEnglish ? 'Online' : 'Online'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/30 bg-slate-500/15 px-2.5 py-0.5 text-[11px] font-bold text-slate-400 [html.light_&]:text-slate-600">
              <WifiOff className="size-3" />
              {isEnglish ? 'Offline' : 'Offline'}
            </span>
          )}
          <span className="text-[11px] text-slate-400">{formatRelativeTime(device.last_seen_at, isEnglish)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
          <span>IP: {device.last_ip || '—'}</span>
          {device.last_rssi !== null && device.last_rssi !== undefined && (
            <span className={rssiMeta.tone}>{rssiMeta.label}</span>
          )}
        </div>
      </div>,

      // 4. Assigned Event
      <div key="event" className="max-w-[230px]">
        {device.assigned_event_id && device.event_title ? (
          <>
            <p className="truncate font-semibold text-white [html.light_&]:text-[#0D1B2A]" title={device.event_title}>
              {device.event_title}
            </p>
            <p className="truncate font-mono text-[11px] text-slate-400">{device.event_slug}</p>
          </>
        ) : (
          <Badge tone="gray">{isEnglish ? 'Unassigned' : 'Chưa gán sự kiện'}</Badge>
        )}
      </div>,

      // 5. Mode & Check-in stats
      <div key="mode" className="space-y-1">
        <div className="flex items-center gap-1.5">
          {device.auto_confirm ? (
            <Badge tone="cyan" dot>
              <Zap className="size-3" />
              {isEnglish ? 'Auto Check-in' : 'Tự động Check-in'}
            </Badge>
          ) : (
            <Badge tone="slate">{isEnglish ? 'Verify Only' : 'Chỉ xác thực'}</Badge>
          )}
        </div>
        <p className="text-[11px] text-slate-400">
          v{device.config_version || 1} • {device.checked_in_count || 0} {isEnglish ? 'check-ins' : 'lượt check-in'}
        </p>
      </div>,

      // 6. Actions
      <div key="actions" className="flex items-center justify-center gap-1.5">
        {device.status === 'PENDING' && (
          <TableActionButton
            icon={CheckCircle2}
            label={isEnglish ? 'Approve' : 'Duyệt'}
            tone="success"
            onClick={() => openApproveModal(device)}
          />
        )}

        {['ACTIVE', 'DISABLED'].includes(device.status) && (
          <TableActionButton
            icon={Edit3}
            label={isEnglish ? 'Configure' : 'Cấu hình'}
            onClick={() => openEditModal(device)}
          />
        )}

        <TableActionButton
          icon={Eye}
          label={isEnglish ? 'Details' : 'Chi tiết'}
          onClick={() => setDetailDeviceId(device.id)}
        />

        {device.status === 'ACTIVE' && (
          <TableActionButton
            icon={Lock}
            label={isEnglish ? 'Disable' : 'Khóa'}
            tone="warning"
            onClick={() => openConfirmModal('disable', device)}
          />
        )}

        {device.status === 'DISABLED' && (
          <TableActionButton
            icon={Unlock}
            label={isEnglish ? 'Enable' : 'Mở khóa'}
            tone="success"
            onClick={() => openConfirmModal('enable', device)}
          />
        )}

        {['ACTIVE', 'DISABLED'].includes(device.status) && (
          <>
            <TableActionButton
              icon={RotateCcw}
              label={isEnglish ? 'Reset Pairing' : 'Ghép lại'}
              onClick={() => openConfirmModal('reset-pairing', device)}
            />
            <TableActionButton
              icon={ShieldOff}
              label={isEnglish ? 'Revoke' : 'Thu hồi'}
              tone="danger"
              onClick={() => openConfirmModal('revoke', device)}
            />
          </>
        )}

        {['PENDING', 'REVOKED'].includes(device.status) && (
          <TableActionButton
            icon={Trash2}
            label={isEnglish ? 'Delete' : 'Xóa'}
            tone="danger"
            onClick={() => openConfirmModal('delete', device)}
          />
        )}
      </div>,
    ]
  })

  return (
    <Page
      title={isEnglish ? 'ESP32-S3 Check-in Devices' : 'Thiết bị Check-in ESP32-S3'}
      actions={
        <button
          type="button"
          onClick={() => devicesQuery.refetch()}
          className="admin-secondary flex items-center gap-2 px-4 py-2 text-sm"
        >
          <RefreshCw className={`size-4 ${devicesQuery.isFetching ? 'animate-spin' : ''}`} />
          <span>{isEnglish ? 'Refresh' : 'Làm mới'}</span>
        </button>
      }
    >
      <KpiGrid items={kpiItems} />

      {/* Pending Pairing Highlight */}
      {pendingDevices.length > 0 && (
        <Panel className="mt-6 border-amber-400/35 bg-amber-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-amber-300 [html.light_&]:text-amber-700">
                {isEnglish ? 'New Hardware Waiting for Pairing' : 'Thiết bị mới đang chờ duyệt ghép nối'}
              </p>
              <p className="mt-1 text-sm text-slate-300 [html.light_&]:text-slate-700">
                {isEnglish
                  ? 'Verify the pairing code displayed on the ESP32-S3 OLED/Serial and approve to issue its one-time device secret.'
                  : 'Đối chiếu mã ghép nối hiển thị trên thiết bị ESP32-S3 và bấm Duyệt để cấp khóa xác thực 1 lần.'}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pendingDevices.map((dev) => (
              <div
                key={dev.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-[#0d172e]/90 p-4 [html.light_&]:bg-white"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-amber-500/20 px-2.5 py-1 font-mono text-sm font-black tracking-widest text-amber-300 [html.light_&]:text-amber-800">
                      {dev.pairing_code || '------'}
                    </span>
                    <span className="text-xs text-slate-400">{dev.hardware || 'ESP32-S3'}</span>
                  </div>
                  <p className="mt-1.5 font-mono text-xs text-slate-300 [html.light_&]:text-slate-700">
                    MAC: {dev.mac_address}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    IP: {dev.last_ip || '—'} • {formatRelativeTime(dev.last_seen_at, isEnglish)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openApproveModal(dev)}
                  className="admin-primary shrink-0 px-3.5 py-2 text-xs"
                >
                  {isEnglish ? 'Approve' : 'Duyệt'}
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Filters */}
      <Panel className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder={isEnglish ? 'Search by name, MAC, pairing code, IP...' : 'Tìm theo tên cổng, MAC, mã ghép nối, IP...'}
              className="cosmic-input h-10 w-full pl-10 pr-4 text-sm"
            />
          </div>

          <CosmicSelect
            value={filters.status}
            onChange={(val) => setFilters((prev) => ({ ...prev, status: val }))}
            options={[
              { value: 'ALL', label: isEnglish ? 'All Statuses' : 'Tất cả trạng thái' },
              { value: 'PENDING', label: isEnglish ? 'Pending Approval' : 'Chờ duyệt' },
              { value: 'ACTIVE', label: isEnglish ? 'Active' : 'Hoạt động' },
              { value: 'DISABLED', label: isEnglish ? 'Disabled' : 'Đã khóa' },
              { value: 'REVOKED', label: isEnglish ? 'Revoked' : 'Đã thu hồi' },
            ]}
          />

          <CosmicSelect
            value={filters.online}
            onChange={(val) => setFilters((prev) => ({ ...prev, online: val }))}
            options={[
              { value: 'ALL', label: isEnglish ? 'All Connections' : 'Mọi kết nối' },
              { value: 'ONLINE', label: isEnglish ? 'Online Only' : 'Đang Online' },
              { value: 'OFFLINE', label: isEnglish ? 'Offline Only' : 'Đang Offline' },
            ]}
          />

          <CosmicSelect
            value={filters.event_id}
            onChange={(val) => setFilters((prev) => ({ ...prev, event_id: val }))}
            options={filterEventOptions}
            minWidth="min-w-[200px]"
          />

          {(filters.search || filters.status !== 'ALL' || filters.online !== 'ALL' || filters.event_id) && (
            <button
              type="button"
              onClick={() => setFilters({ status: 'ALL', online: 'ALL', event_id: '', search: '' })}
              className="text-xs font-bold text-primary hover:underline"
            >
              {isEnglish ? 'Reset' : 'Xóa lọc'}
            </button>
          )}
        </div>
      </Panel>

      {/* Devices Table */}
      <div className="mt-6">
        {devicesQuery.isLoading ? (
          <Panel>
            <p className="text-sm font-semibold text-subtle">
              {isEnglish ? 'Loading check-in devices...' : 'Đang tải danh sách thiết bị...'}
            </p>
          </Panel>
        ) : devicesQuery.isError ? (
          <Panel>
            <p className="text-sm font-semibold text-error">
              {getApiMessage(devicesQuery.error, isEnglish ? 'Failed to load devices.' : 'Không thể tải danh sách thiết bị.')}
            </p>
          </Panel>
        ) : devices.length === 0 ? (
          <Panel className="py-12 text-center">
            <Cpu className="mx-auto size-10 text-slate-500" />
            <p className="mt-3 text-base font-bold text-white [html.light_&]:text-[#0D1B2A]">
              {isEnglish ? 'No ESP32-S3 devices found' : 'Chưa có thiết bị ESP32-S3 nào'}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {isEnglish
                ? 'When an ESP32-S3 device calls POST /api/iot/v1/devices/register, it will appear here for approval.'
                : 'Khi ESP32-S3 gọi POST /api/iot/v1/devices/register, thiết bị sẽ xuất hiện tại đây để Admin duyệt.'}
            </p>
          </Panel>
        ) : (
          <Table headers={headers} rows={rows} tableClassName="min-w-[980px]" />
        )}
      </div>

      {/* Approve / Configure Modal */}
      <Modal
        open={configModal.open}
        onClose={closeConfigModal}
        title={
          configModal.mode === 'approve'
            ? (isEnglish ? 'Approve & Pair Device' : 'Duyệt & Ghép nối thiết bị')
            : (isEnglish ? 'Configure Device' : 'Cấu hình thiết bị check-in')
        }
        footer={
          <>
            <button type="button" className="admin-secondary" onClick={closeConfigModal}>
              {isEnglish ? 'Cancel' : 'Hủy bỏ'}
            </button>
            <button
              type="submit"
              form="device-config-form"
              disabled={approveMutation.isPending || updateMutation.isPending}
              className="admin-primary"
            >
              {approveMutation.isPending || updateMutation.isPending
                ? (isEnglish ? 'Saving...' : 'Đang lưu...')
                : configModal.mode === 'approve'
                  ? (isEnglish ? 'Approve & Issue Secret' : 'Duyệt & Cấp khóa')
                  : (isEnglish ? 'Save Changes' : 'Lưu cấu hình')}
            </button>
          </>
        }
      >
        {configModal.device && (
          <form id="device-config-form" onSubmit={submitConfigForm} className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#121c38] p-3.5 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">MAC Address</p>
                  <p className="font-mono text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                    {configModal.device.mac_address}
                  </p>
                </div>
                {configModal.device.pairing_code && (
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {isEnglish ? 'Pairing Code' : 'Mã đối chiếu'}
                    </p>
                    <p className="font-mono text-base font-black tracking-widest text-amber-300 [html.light_&]:text-amber-700">
                      {configModal.device.pairing_code}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-slate-700">
                {isEnglish ? 'Device Display Name *' : 'Tên hiển thị thiết bị *'}
              </span>
              <input
                type="text"
                required
                value={configForm.name}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={isEnglish ? 'e.g. Gate A1, VIP Entrance' : 'VD: Cổng A1, Cổng VIP'}
                className="cosmic-input mt-2 h-10 w-full px-3.5 text-sm"
              />
            </label>

            <div>
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-300 [html.light_&]:text-slate-700">
                {isEnglish ? 'Assigned Event' : 'Sự kiện được phép check-in'}
              </span>
              <CosmicSelect
                value={configForm.assigned_event_id}
                onChange={(val) => setConfigForm((prev) => ({ ...prev, assigned_event_id: val }))}
                options={eventOptions}
                className="w-full"
                buttonClassName="w-full"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                {isEnglish
                  ? 'ESP32 will reject tickets belonging to any other event (WRONG_EVENT).'
                  : 'Thiết bị sẽ từ chối ngay lập tức nếu vé không thuộc sự kiện đang gán.'}
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50">
              <input
                type="checkbox"
                checked={configForm.auto_confirm}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, auto_confirm: e.target.checked }))}
                className="mt-0.5 size-4 accent-primary"
              />
              <div>
                <p className="text-sm font-bold text-white [html.light_&]:text-[#0D1B2A]">
                  {isEnglish ? 'Auto Check-in (auto_confirm)' : 'Tự động Check-in (auto_confirm)'}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {isEnglish
                    ? 'When enabled and scan action is "auto", valid tickets are marked USED immediately. When disabled, scanning only verifies the ticket.'
                    : 'Khi bật và thiết bị gửi action="auto", vé hợp lệ sẽ được check-in ngay lập tức. Khi tắt, thiết bị chỉ xác thực (verify).'}
                </p>
              </div>
            </label>
          </form>
        )}
      </Modal>

      {/* Device Detail Modal */}
      <Modal
        open={Boolean(detailDeviceId)}
        onClose={() => setDetailDeviceId(null)}
        maxWidth="max-w-2xl"
        title={isEnglish ? 'Device Telemetry & Check-in History' : 'Chi tiết thiết bị & Lịch sử quét vé'}
        footer={
          <button type="button" className="admin-secondary" onClick={() => setDetailDeviceId(null)}>
            {isEnglish ? 'Close' : 'Đóng'}
          </button>
        }
      >
        {detailQuery.isLoading ? (
          <p className="text-sm text-slate-400">{isEnglish ? 'Loading details...' : 'Đang tải chi tiết...'}</p>
        ) : detailQuery.isError ? (
          <p className="text-sm text-error">
            {getApiMessage(detailQuery.error, isEnglish ? 'Failed to load details.' : 'Không thể tải chi tiết.')}
          </p>
        ) : detailQuery.data?.device ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-[#121c38] p-3.5 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50">
                <p className="text-xs font-bold uppercase text-slate-400">{isEnglish ? 'Identity' : 'Định danh'}</p>
                <p className="mt-1 font-bold text-white [html.light_&]:text-[#0D1B2A]">
                  {detailQuery.data.device.name || '—'}
                </p>
                <p className="font-mono text-xs text-slate-300 [html.light_&]:text-slate-700">
                  MAC: {detailQuery.data.device.mac_address}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                  ID: {detailQuery.data.device.id}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#121c38] p-3.5 [html.light_&]:border-slate-200 [html.light_&]:bg-slate-50">
                <p className="text-xs font-bold uppercase text-slate-400">{isEnglish ? 'Telemetry' : 'Thông số phần cứng'}</p>
                <p className="mt-1 text-xs text-slate-300 [html.light_&]:text-slate-700">
                  IP: <span className="font-mono">{detailQuery.data.device.last_ip || '—'}</span> • RSSI:{' '}
                  <span>{detailQuery.data.device.last_rssi ?? '—'} dBm</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-300 [html.light_&]:text-slate-700">
                  Heap: {formatHeap(detailQuery.data.device.last_free_heap)} • Uptime:{' '}
                  {formatUptime(detailQuery.data.device.last_uptime_sec, isEnglish)}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Config v{detailQuery.data.device.config_version} • Last seen:{' '}
                  {formatDateTime(detailQuery.data.device.last_seen_at, isEnglish)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2.5 text-xs font-black uppercase tracking-wider text-slate-400">
                {isEnglish ? 'Recent Check-ins (Latest 20)' : 'Lịch sử check-in gần nhất (20 vé)'}
              </h4>
              {detailQuery.data.recent_checkins?.length > 0 ? (
                <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 [html.light_&]:border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-white/10 bg-[#172242] text-slate-200 [html.light_&]:bg-slate-100 [html.light_&]:text-slate-700">
                      <tr>
                        <th className="px-3 py-2">{isEnglish ? 'Ticket' : 'Mã vé'}</th>
                        <th className="px-3 py-2">{isEnglish ? 'Attendee' : 'Người tham dự'}</th>
                        <th className="px-3 py-2">{isEnglish ? 'Event' : 'Sự kiện'}</th>
                        <th className="px-3 py-2">{isEnglish ? 'Time' : 'Thời gian'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 [html.light_&]:divide-slate-200">
                      {detailQuery.data.recent_checkins.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-mono font-bold text-primary">{item.ticket_code}</td>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-white [html.light_&]:text-[#0D1B2A]">{item.attendee_name}</p>
                            <p className="text-[11px] text-slate-400">{item.ticket_type_name}</p>
                          </td>
                          <td className="px-3 py-2 text-slate-300 [html.light_&]:text-slate-700">{item.event_title}</td>
                          <td className="px-3 py-2 text-slate-400">{formatDateTime(item.checked_in_at, isEnglish)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl border border-white/10 p-4 text-center text-xs text-slate-400 [html.light_&]:border-slate-200">
                  {isEnglish ? 'No tickets checked in by this device yet.' : 'Thiết bị chưa check-in vé nào.'}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Confirm Action Modal */}
      <Modal
        open={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: null, device: null })}
        title={confirmDialogConfig.title}
        footer={
          <>
            <button
              type="button"
              className="admin-secondary"
              onClick={() => setConfirmModal({ open: false, action: null, device: null })}
            >
              {isEnglish ? 'Cancel' : 'Hủy'}
            </button>
            <button
              type="button"
              disabled={actionMutation.isPending}
              className={confirmDialogConfig.btnClass}
              onClick={() =>
                confirmModal.device &&
                actionMutation.mutate({ action: confirmModal.action, id: confirmModal.device.id })
              }
            >
              {actionMutation.isPending
                ? (isEnglish ? 'Processing...' : 'Đang xử lý...')
                : confirmDialogConfig.btnLabel}
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-slate-300 [html.light_&]:text-slate-700">
          {confirmDialogConfig.body}
        </p>
      </Modal>
    </Page>
  )
}
