import { Calendar, Megaphone, Settings2, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Insight, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

const shortcuts = [
  ['Attendees', '/organizer/attendees', Users, 'Review check-ins and ticket holders.'],
  ['Staff Tasks', '/organizer/staff-tasks', Settings2, 'Coordinate onsite team work.'],
  ['Promo Codes', '/organizer/promotions', Megaphone, 'Manage event discounts.'],
  ['Announcements', '/organizer/announcements', Calendar, 'Send updates to attendees.'],
]

export function OrganizerDashboardPage() {
  return (
    <OrganizerPage
      title="Organizer Dashboard"
      description="Monitor and operate your live event workspace."
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map(([label, href, Icon, text]) => (
          <Link key={label} to={href}>
            <OrganizerPanel className="h-full transition hover:border-primary">
              <Icon className="size-5 text-primary" />
              <h3 className="mt-4 text-lg font-extrabold">{label}</h3>
              <p className="mt-2 text-sm text-[#434655]">{text}</p>
            </OrganizerPanel>
          </Link>
        ))}
      </div>
      <div className="mt-6">
        <Insight>
          Neon Horizon has high operational activity today. Start with staff tasks, then review attendee check-in velocity.
        </Insight>
      </div>
    </OrganizerPage>
  )
}
