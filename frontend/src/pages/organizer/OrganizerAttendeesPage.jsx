import { Download, Filter } from 'lucide-react'
import {
  AvatarInitials,
  Badge,
  Insight,
  OrganizerPage,
  OrganizerPanel,
  OrganizerTable,
  SearchBar,
} from './OrganizerComponents.jsx'

const attendees = [
  ['Alex Rivers', 'alex.r@example.com', 'VIP', 'Row 12 / Seat 45', 'EVH-89234', 'Checked In'],
  ['Sarah Jenkins', 'sarah.j@eventhub.com', 'Standard', 'Zone A', 'EVH-12345', 'Not Checked In'],
  ['Michael Thorne', 'm.thorne@global.net', 'Early Bird', 'Zone B', 'EVH-44122', 'Checked In'],
]

export function OrganizerAttendeesPage() {
  return (
    <OrganizerPage
      title="Attendees"
      eyebrow="Operations / Attendees"
      action="Export Attendee List"
    >
      <OrganizerPanel className="mb-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <SearchBar placeholder="Search by name, email, or ticket code..." />
          <select className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm">
            <option>Ticket Type</option>
          </select>
          <select className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm">
            <option>Check-in Status</option>
          </select>
          <select className="h-10 rounded-md border border-[#c3c6d7] bg-white px-3 text-sm">
            <option>Seat / Zone</option>
          </select>
          <button className="admin-secondary">
            <Filter className="size-4" />
          </button>
        </div>
      </OrganizerPanel>
      <OrganizerTable
        headers={['Attendee Name', 'Email', 'Ticket Type', 'Seat/Zone', 'Code', 'Status', 'Actions']}
        rows={attendees.map((attendee) => [
          <div key="name" className="flex items-center gap-3">
            <AvatarInitials name={attendee[0]} />
            <span className="font-bold">{attendee[0]}</span>
          </div>,
          attendee[1],
          <Badge key="ticket" tone={attendee[2] === 'VIP' ? 'purple' : 'blue'}>{attendee[2]}</Badge>,
          attendee[3],
          <span key="code" className="font-mono text-xs">{attendee[4]}</span>,
          <Badge key="status" tone={attendee[5] === 'Checked In' ? 'green' : 'gray'}>{attendee[5]}</Badge>,
          <button key="action" className="text-sm font-bold text-primary">View Detail</button>,
        ])}
      />
      <div className="mt-5 flex items-center justify-between text-sm text-[#434655]">
        <span>Showing 1 - 3 of 1,248 attendees</span>
        <button className="admin-secondary">
          <Download className="size-4" />
          Export CSV
        </button>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {['Peak Arrival Forecast', 'VIP Retention', 'Check-in Trend'].map((title) => (
          <Insight key={title} title={title}>
            Live attendee activity suggests allocating one additional staff member to VIP and Zone B gates.
          </Insight>
        ))}
      </div>
    </OrganizerPage>
  )
}
