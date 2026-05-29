import {
  Badge,
  Field,
  Insight,
  Page,
  Panel,
  Row,
  ImagePlaceholder,
} from './AdminComponents.jsx'

export function AdminFinancePage() {
  const auditImageUrl = null

  return (
    <Page title="Fee Architecture" description="Finance / Platform Fees" action="Publish Changes">
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Panel>
          <p className="text-xs font-bold uppercase text-[#737686]">Current Live Fee</p>
          <p className="mt-3 text-4xl font-extrabold text-primary">2.5% + $1.00</p>
          <p className="mt-4 text-sm text-[#5c647a]">
            Mixed model calculated per ticket sold across all global events.
          </p>
          <Badge tone="green" className="mt-5">Active</Badge>
        </Panel>
        <Insight
          title="AI Revenue Insight"
          text="Based on last 30 days of traffic, switching to a 3.0% flat fee could increase platform revenue by 12.4% without significantly impacting organizers."
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel>
          <h3 className="mb-5 text-lg font-bold">Modify Configuration</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fee Type" value="Mixed (Percentage + Fixed)" />
            <Field label="Percentage Value" value="2.5%" />
            <Field label="Fixed Value" value="$ 1.00" />
          </div>
          <label className="mt-5 flex items-center justify-between text-sm font-semibold">
            Apply Globally
            <input type="checkbox" defaultChecked className="size-5 accent-primary" />
          </label>
          <button className="admin-primary mt-5 w-full max-w-md">
            Update Fee Structure
          </button>
        </Panel>
        <Panel>
          <h3 className="text-lg font-bold">Fee Simulation</h3>
          <Field label="Input Ticket Price" value="$ 100.00" className="mt-4" />
          <div className="mt-4 rounded bg-[#e0e3e5] p-4 text-sm">
            <Row label="Calculated Platform Fee" value="$3.50" strong />
            <Row label="Organizer Payout" value="$96.50" />
            <Row label="Customer Total" value="$100.00" strong />
          </div>
          {auditImageUrl ? (
            <img
              src={auditImageUrl}
              alt="Audit Trail"
              className="mt-5 h-32 w-full rounded object-cover"
            />
          ) : (
            <ImagePlaceholder label="Audit Trail" className="mt-5 h-32 w-full" />
          )}
        </Panel>
      </div>
      <Panel className="mt-6">
        <h3 className="mb-4 text-lg font-bold">Automatic Approval Rules</h3>
        {[
          'Refunds requested within 24 hours of purchase',
          'Events cancelled by organizer',
          'Partial refunds for ticketing errors',
        ].map((rule, index) => (
          <label
            key={rule}
            className="mt-2 flex items-center gap-3 rounded bg-[#eceef0] px-4 py-3 text-sm text-[#191c1e]"
          >
            <input
              type="checkbox"
              defaultChecked={index < 2}
              className="accent-primary"
            />
            {rule}
          </label>
        ))}
      </Panel>
    </Page>
  )
}
