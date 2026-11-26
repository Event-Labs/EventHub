import { useLanguage } from '@/i18n/LanguageContext.jsx'
import AnimatedNumber from '@/components/AnimatedNumber.jsx'

export function CheckinKpiCards({ overall }) {
  const { isEnglish } = useLanguage()
  const total = Number(overall?.total_tickets) || 0
  const checkedIn = Number(overall?.checked_in) || 0
  const notCheckedIn = Number(overall?.valid) || 0
  const rate = total > 0 ? Math.round((checkedIn / total) * 100) : 0
  const numLocale = isEnglish ? 'en-US' : 'vi-VN'

  const cards = [
    {
      id: 'total',
      label: isEnglish ? 'Total Tickets' : 'Tổng số vé',
      value: total.toLocaleString(numLocale),
      sub: isEnglish ? 'Valid tickets sold' : 'Vé đã bán hợp lệ',
      borderColor: 'border-blue-500/20 hover:border-blue-500/40',
    },
    {
      id: 'checked_in',
      label: isEnglish ? 'Checked In' : 'Đã check-in',
      value: checkedIn.toLocaleString(numLocale),
      sub: isEnglish ? `${rate}% of total tickets` : `${rate}% trên tổng số vé`,
      borderColor: 'border-emerald-500/20 hover:border-emerald-500/40',
    },
    {
      id: 'not_checked_in',
      label: isEnglish ? 'Not Checked In' : 'Chưa check-in',
      value: notCheckedIn.toLocaleString(numLocale),
      sub: isEnglish ? 'Valid tickets awaiting check-in' : 'Vé hợp lệ chờ soát',
      borderColor: 'border-amber-500/20 hover:border-amber-500/40',
    },
    {
      id: 'attendance_rate',
      label: isEnglish ? 'Attendance Rate' : 'Tỷ lệ tham dự',
      value: `${rate}%`,
      sub: `${checkedIn.toLocaleString(numLocale)} / ${total.toLocaleString(numLocale)} ${isEnglish ? 'tickets' : 'vé'}`,
      borderColor: 'border-cyan-500/20 hover:border-cyan-500/40',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.id}
          className={`group relative overflow-hidden rounded-2xl border bg-[#0d172e]/80 [html.light_&]:bg-white [html.light_&]:border-slate-200 p-4 sm:p-5 backdrop-blur-xl shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 ${c.borderColor}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">
              {c.label}
            </span>
          </div>
          <div className="mt-3">
            <span className="font-display text-2xl sm:text-3xl font-black tracking-tight text-white [html.light_&]:text-[#0D1B2A]">
              <AnimatedNumber value={c.value} />
            </span>
            <p className="mt-1 text-[11px] sm:text-xs font-medium text-slate-400 [html.light_&]:text-[#536b88]">
              {c.sub}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

