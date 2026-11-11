import { CheckCircle2, Clock3, Ticket, TrendingUp } from 'lucide-react'
import { useLanguage } from '@/i18n/LanguageContext.jsx'

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
      icon: Ticket,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]',
      borderColor: 'border-blue-500/20 hover:border-blue-500/40',
      valueColor: 'text-white [html.light_&]:text-[#0D1B2A]',
    },
    {
      id: 'checked_in',
      label: isEnglish ? 'Checked In' : 'Đã check-in',
      value: checkedIn.toLocaleString(numLocale),
      sub: isEnglish ? `${rate}% of total tickets` : `${rate}% trên tổng số vé`,
      icon: CheckCircle2,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
      borderColor: 'border-emerald-500/20 hover:border-emerald-500/40',
      valueColor: 'text-emerald-400 [html.light_&]:text-emerald-600',
    },
    {
      id: 'not_checked_in',
      label: isEnglish ? 'Not Checked In' : 'Chưa check-in',
      value: notCheckedIn.toLocaleString(numLocale),
      sub: isEnglish ? 'Valid tickets awaiting check-in' : 'Vé hợp lệ chờ soát',
      icon: Clock3,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
      borderColor: 'border-amber-500/20 hover:border-amber-500/40',
      valueColor: 'text-amber-400 [html.light_&]:text-amber-600',
    },
    {
      id: 'attendance_rate',
      label: isEnglish ? 'Attendance Rate' : 'Tỷ lệ tham dự',
      value: `${rate}%`,
      sub: `${checkedIn.toLocaleString(numLocale)} / ${total.toLocaleString(numLocale)} ${isEnglish ? 'tickets' : 'vé'}`,
      icon: TrendingUp,
      iconColor: 'text-cyan-400',
      iconBg: 'bg-cyan-500/10 border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]',
      borderColor: 'border-cyan-500/20 hover:border-cyan-500/40',
      valueColor: 'text-cyan-400 [html.light_&]:text-cyan-600',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <div
            key={c.id}
            className={`group relative overflow-hidden rounded-2xl border bg-[#0d172e]/80 [html.light_&]:bg-white [html.light_&]:border-slate-200 p-4 sm:p-5 backdrop-blur-xl shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 ${c.borderColor}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400 [html.light_&]:text-[#536b88]">
                {c.label}
              </span>
              <div className={`grid size-9 sm:size-10 shrink-0 place-items-center rounded-xl border ${c.iconBg}`}>
                <Icon className={`size-4 sm:size-5 ${c.iconColor}`} />
              </div>
            </div>
            <div className="mt-3">
              <span className={`font-display text-2xl sm:text-3xl font-black tracking-tight ${c.valueColor}`}>
                {c.value}
              </span>
              <p className="mt-1 text-[11px] sm:text-xs font-medium text-slate-400 [html.light_&]:text-[#536b88]">
                {c.sub}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

