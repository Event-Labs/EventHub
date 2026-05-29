import { BarChart3, Pencil, Trash2 } from 'lucide-react'
import {
  Badge,
  Insight,
  OrganizerPage,
  OrganizerPanel,
  OrganizerTable,
  SearchBar,
} from './OrganizerComponents.jsx'

const promos = [
  ['SUMMER20', '20% Off All Tickets', '45 / 100', 'Oct 01 - Oct 31, 2023', 'Active'],
  ['EARLYBIRD', '$15.00 Flat Discount', '250 / 250', 'Aug 15 - Sept 15, 2023', 'Expired'],
  ['WINTERSTORM', '10% Off Group Booking', '0 / 500', 'Dec 01 - Dec 31, 2023', 'Scheduled'],
]

export function OrganizerPromosPage() {
  return (
    <OrganizerPage
      title="Manage Promotions"
      description="Create and track performance of event discount codes."
      action="Create Promo Code"
    >
      <OrganizerPanel className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchBar placeholder="Search by code (e.g. SUMMER20)" />
          <span className="text-sm font-semibold text-[#434655]">Status:</span>
          <select className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm">
            <option>All Statuses</option>
          </select>
          <button className="admin-secondary">Advanced Filters</button>
          <button className="text-sm font-bold text-primary">Clear All</button>
        </div>
      </OrganizerPanel>
      <OrganizerTable
        headers={['Promo Code', 'Discount Type', 'Usage Tracking', 'Valid Period', 'Status', 'Actions']}
        rows={promos.map((promo) => [
          <span key="code" className="font-extrabold">{promo[0]}</span>,
          promo[1],
          <Usage key="usage" value={promo[2]} />,
          promo[3],
          <Badge key="status" tone={promo[4] === 'Active' ? 'green' : promo[4] === 'Expired' ? 'gray' : 'blue'}>{promo[4]}</Badge>,
          <div key="actions" className="flex items-center gap-3 text-[#737686]">
            <Pencil className="size-4" />
            <BarChart3 className="size-4" />
            <Trash2 className="size-4 text-error" />
          </div>,
        ])}
      />
      <div className="mt-6">
        <Insight>
          SUMMER20 is performing 34% better than your average campaign. Consider increasing the usage limit by 50 to maximize conversion before the early-bird window closes.
        </Insight>
      </div>
    </OrganizerPage>
  )
}

function Usage({ value }) {
  const [used, total] = value.split(' / ').map(Number)
  const percent = total ? Math.min(100, Math.round((used / total) * 100)) : 0

  return (
    <div className="w-32">
      <div className="mb-1 flex justify-between text-xs">
        <span>{value}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-1.5 rounded bg-[#e0e3e5]">
        <div className="h-full rounded bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
