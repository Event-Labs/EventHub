import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchStaffCheckInReport } from '@/services/operations.js'
import { StaffPage, StaffPanel } from './StaffComponents.jsx'
import { SharedGateCheckInHistoryPanel } from './StaffQrCheckInPage.jsx'
import AnimatedNumber from '@/components/AnimatedNumber.jsx'

const getAutoLocale = () =>
  ((typeof document !== 'undefined' && document.documentElement.lang === 'en') ||
   (typeof localStorage !== 'undefined' && localStorage.getItem('eventhub_locale') === 'en'))
    ? 'en-US'
    : 'vi-VN'

const numberFormatter = {
  format: (num) => new Intl.NumberFormat(getAutoLocale()).format(num || 0)
}

export function StaffCheckInCountPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const reportQuery = useQuery({
    queryKey: ['staff-check-in-report'],
    queryFn: () => fetchStaffCheckInReport(),
  })

  const report = reportQuery.data || {}
  const summary = report.summary || {}
  const totalValid = Number(summary.total_valid || 0)
  const checkedIn = Number(summary.checked_in || 0)
  const remaining = Number(summary.remaining || 0)
  const cancelled = Number(summary.cancelled || 0)
  const progress = totalValid > 0 ? Math.round((checkedIn / totalValid) * 100) : 0
  const hourlyCheckIns = report.hourly_checkins || []
  const hourCategories = Array.from({ length: 24 }, (_, hour) => hour)
  const hourlyCounts = new Map(
    hourlyCheckIns.map((item) => [new Date(item.hour).getHours(), Number(item.count || 0)]),
  )
  const hourlySeries = hourCategories.map((hour) => hourlyCounts.get(hour) || 0)
  const maxHourlyCount = Math.max(1, ...hourlySeries)
  const chartHasData = hourlyCheckIns.length > 0

  return (
    <StaffPage
      title="Thống kê Soát vé"
    >
      {reportQuery.isError && (
        <div className="mb-5 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
          {reportQuery.error?.response?.data?.message || 'Không thể tải thống kê soát vé.'}
        </div>
      )}

      <>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ['Tổng vé hợp lệ', totalValid],
              ['Đã soát vé', checkedIn],
              ['Chưa soát', remaining],
              ['Vé đã hủy', cancelled],
            ].map(([label, value]) => (
              <StaffPanel key={label}>
                <p className="text-xs font-bold uppercase text-muted">{label}</p>
                <p className="mt-2 text-2xl font-extrabold text-content"><AnimatedNumber value={value} /></p>
              </StaffPanel>
            ))}
          </div>

          <StaffPanel className="mt-5">
            <div className="mb-3 flex justify-between text-sm font-bold text-content">
              <span>Tiến độ vào cổng</span>
              <span><AnimatedNumber value={checkedIn} /> / <AnimatedNumber value={totalValid} /> vé</span>
            </div>
            <div className="h-4 rounded bg-panel-soft overflow-hidden">
              <div
                className="h-full rounded bg-success transition-all duration-700 ease-out"
                style={{ width: `${mounted ? progress : 0}%` }}
              />
            </div>
          </StaffPanel>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
            <StaffPanel>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-content">Lượt soát vé theo giờ</h3>
                {reportQuery.isLoading && <span className="text-xs font-semibold text-muted">Đang tải...</span>}
              </div>
              <div className="relative mt-6 grid grid-cols-[2rem_1fr] gap-3">
                <div className="flex h-64 flex-col justify-between pb-5 text-right text-[10px] font-semibold text-muted">
                  <span>{maxHourlyCount}</span>
                  <span>{Math.ceil(maxHourlyCount * 0.75)}</span>
                  <span>{Math.ceil(maxHourlyCount * 0.5)}</span>
                  <span>{Math.ceil(maxHourlyCount * 0.25)}</span>
                  <span>0</span>
                </div>
                <div className={`min-w-0 ${reportQuery.isLoading ? 'animate-pulse' : ''}`}>
                  <div className="relative h-64 border-b border-l border-border-soft/50">
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                      {[0, 1, 2, 3, 4].map((line) => (
                        <div key={line} className="border-t border-dashed border-border-soft/35" />
                      ))}
                    </div>
                    <div className="absolute inset-x-2 bottom-0 top-0 flex items-end gap-1 sm:gap-2">
                      {hourlySeries.map((count, hour) => {
                        const targetH = count > 0 ? Math.max(5, Math.round((count / maxHourlyCount) * 100)) : 1
                        const height = mounted ? targetH : 1
                        return (
                          <div key={hour} className="group flex h-full min-w-0 flex-1 items-end justify-center">
                            <div
                              className={`w-full max-w-6 rounded-t transition-[height,background-color] duration-700 ease-out ${count > 0 ? 'bg-primary/75 group-hover:bg-primary' : 'bg-primary/15'}`}
                              style={{ height: `${height}%` }}
                              title={`${String(hour).padStart(2, '0')}:00 — ${count} lượt`}
                            />
                          </div>
                        )
                      })}
                    </div>
                    {!reportQuery.isLoading && !chartHasData && (
                      <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        <span className="rounded-full border border-border-soft/50 bg-surface/90 px-4 py-2 text-sm font-bold text-muted">
                          Chưa có dữ liệu
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-[repeat(24,minmax(0,1fr))] text-center text-[9px] font-semibold text-muted">
                    {hourCategories.map((hour) => (
                      <span key={hour} className={hour % 2 ? 'hidden sm:block' : ''}>{String(hour).padStart(2, '0')}:00</span>
                    ))}
                  </div>
                </div>
              </div>
            </StaffPanel>

            <StaffPanel>
              <h3 className="font-bold text-content">Theo loại vé</h3>
              {(report.ticket_types || []).length === 0 ? (
                <p className="mt-5 text-sm text-muted">Chưa có loại vé nào.</p>
              ) : (
                report.ticket_types.map((type) => {
                  const typeTotal = Number(type.total_valid || 0)
                  const typeCheckedIn = Number(type.checked_in || 0)
                  const typeProgress = typeTotal > 0 ? Math.round((typeCheckedIn / typeTotal) * 100) : 0
                  return (
                    <div key={type.id} className="mt-5">
                      <div className="mb-1 flex justify-between gap-3 text-sm text-content">
                        <span className="min-w-0 truncate">{type.name}</span>
                        <span className="shrink-0 text-muted">{typeCheckedIn}/{typeTotal}</span>
                      </div>
                      <div className="h-2 rounded bg-panel-soft">
                        <div className="h-full rounded bg-primary" style={{ width: `${typeProgress}%` }} />
                      </div>
                    </div>
                  )
                })
              )}
            </StaffPanel>
          </div>

          <div className="mt-5">
            <SharedGateCheckInHistoryPanel />
          </div>
      </>
    </StaffPage>
  )
}
