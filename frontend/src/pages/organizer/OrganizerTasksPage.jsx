import { CheckCircle2, Clock, MoreHorizontal, Plus } from 'lucide-react'
import { AvatarInitials, Insight, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

const columns = [
  {
    title: 'To Do',
    cards: [
      ['Prepare VIP lounge signage', 'Sarah Chen', 'Today 14:00', 'Urgent'],
      ['Confirm vendor entry badges', 'Marcus Lee', 'Tomorrow', 'Normal'],
    ],
  },
  {
    title: 'In Progress',
    cards: [
      ['Brief event security team', 'Alex Rivera', 'Now', 'Urgent'],
      ['Verify stage lighting presets', 'Marcus Lee', '19:30', 'Normal'],
    ],
  },
  {
    title: 'Done',
    cards: [
      ['Distribute staff meal vouchers', 'Maya Gupta', 'Completed', 'Done'],
      ['Initial venue safety walkthrough', 'Alex Rivera', 'Completed', 'Done'],
    ],
  },
]

export function OrganizerTasksPage() {
  return (
    <OrganizerPage title="Staff Tasks" action="Create Task">
      <div className="mb-5 flex gap-2 rounded-md bg-[#eceef0] p-1 text-sm font-bold w-fit">
        <button className="rounded bg-white px-4 py-2 text-primary">Kanban</button>
        <button className="px-4 py-2 text-[#737686]">Table</button>
      </div>
      <div className="grid gap-5 xl:grid-cols-4">
        {columns.map((column) => (
          <div key={column.title} className="min-w-0">
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="font-bold text-[#191c1e]">{column.title}</h3>
              <span className="rounded bg-[#e0e3e5] px-2 py-0.5 text-xs font-bold text-[#434655]">
                {column.cards.length}
              </span>
            </div>
            <div className="space-y-4">
              {column.cards.map((card) => (
                <TaskCard key={card[0]} card={card} />
              ))}
            </div>
          </div>
        ))}
        <button className="min-h-32 rounded-md border border-dashed border-[#c3c6d7] bg-white text-sm font-bold text-[#737686] hover:border-primary hover:text-primary">
          <Plus className="mx-auto mb-2 size-5" />
          Add Column
        </button>
      </div>
      <div className="mt-8 max-w-sm">
        <Insight>
          Security briefing is currently urgent. Recommend assigning additional staff to assist Sarah Chen with VIP signage.
        </Insight>
      </div>
    </OrganizerPage>
  )
}

function TaskCard({ card }) {
  const done = card[3] === 'Done'
  const urgent = card[3] === 'Urgent'

  return (
    <OrganizerPanel className="min-h-32">
      <div className="flex items-start justify-between">
        <span
          className={`rounded px-2 py-1 text-xs font-bold uppercase ${
            done ? 'bg-green-100 text-green-700' : urgent ? 'bg-red-100 text-red-700' : 'bg-[#dbe1ff] text-[#003ea8]'
          }`}
        >
          {card[3]}
        </span>
        {done ? <CheckCircle2 className="size-4 text-primary" /> : <MoreHorizontal className="size-4 text-[#737686]" />}
      </div>
      <p className="mt-4 font-bold text-[#191c1e]">{card[0]}</p>
      <div className="mt-5 flex items-center justify-between text-xs text-[#565e74]">
        <span className="flex items-center gap-2">
          <AvatarInitials name={card[1]} className="size-6" />
          {card[1]}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {card[2]}
        </span>
      </div>
    </OrganizerPanel>
  )
}
