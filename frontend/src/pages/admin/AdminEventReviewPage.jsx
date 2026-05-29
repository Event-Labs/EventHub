import { ChevronRight, Filter } from 'lucide-react'
import { Badge, ImagePlaceholder, Insight, Page, Table } from './AdminComponents.jsx'

export function AdminEventReviewPage() {
  const rows = [
    {
      name: 'Cyber Summit 2024',
      organizer: 'Future Systems Inc.',
      category: 'Technology',
      eventDate: 'Oct 24, 2024',
      submittedDate: 'Sept 12, 2024',
      imageUrl: null,
    },
    {
      name: 'Gala for Good',
      organizer: 'Red Cross Global',
      category: 'Charity',
      eventDate: 'Nov 02, 2024',
      submittedDate: 'Sept 14, 2024',
      imageUrl: null,
    },
    {
      name: 'Metropolitan Jazz Festival',
      organizer: 'Harmony Group',
      category: 'Entertainment',
      eventDate: 'Oct 30, 2024',
      submittedDate: 'Sept 15, 2024',
      imageUrl: null,
    },
  ]

  return (
    <Page
      title="Event Review Queue"
      description="Audit and approve submitted events for the platform."
    >
      <div className="mb-5 flex justify-end gap-2">
        <button className="admin-secondary">
          <Filter className="size-4" /> Filter
        </button>
        <button className="admin-secondary">Export</button>
      </div>
      <Insight text='AI Assistant: 3 events detected with potentially high risk scores based on policy alignment. Prioritize review for "Cyber Summit 2024".' />
      <Table
        headers={['Event Image', 'Event Name', 'Organizer', 'Category', 'Event Date', 'Submitted', 'Status', '']}
        rows={rows.map((row, index) => [
          row.imageUrl ? (
            <img
              key="img"
              src={row.imageUrl}
              alt={row.name}
              className="h-12 w-20 rounded object-cover"
            />
          ) : (
            <ImagePlaceholder key="img" label="Event" />
          ),
          <div key="name">
            <p className="font-semibold">{row.name}</p>
            <p className="text-xs text-[#737686]">EVT-{9201 + index}</p>
          </div>,
          row.organizer,
          <Badge key="cat" tone="blue">{row.category}</Badge>,
          row.eventDate,
          row.submittedDate,
          <span key="status" className="font-semibold text-[#6a1edb]">
            Pending Review
          </span>,
          <ChevronRight key="go" className="size-4 text-[#737686]" />,
        ])}
      />
    </Page>
  )
}
