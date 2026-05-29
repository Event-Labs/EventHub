import {
  Badge,
  Insight,
  KpiGrid,
  Page,
  Panel,
  PlanCard,
  Status,
  Table,
} from './AdminComponents.jsx'

export function AdminPlansPage() {
  const plans = [
    ['Free', '$0 / mo', '1 Active Event', '100 Attendees / Event', '450 active organizers'],
    ['Basic', '$29 / mo', '5 Active Events', '500 Attendees / Event', '312 active organizers'],
    ['Pro', '$99 / mo', 'Unlimited Events', '2,500 Attendees / Event', '428 active organizers'],
    ['Enterprise', 'Custom Pricing', 'White-labeling', 'Dedicated Account Mgr', '50 enterprise clients'],
  ]

  return (
    <Page
      title="Subscription Plans"
      description="Manage platform tiers, pricing, and feature limits."
      action="Create New Plan"
    >
      <KpiGrid
        items={[
          ['Total Subscribers', '1,240', '+8%'],
          ['Active Plans', '4', 'No change'],
          ['Monthly Revenue (MRR)', '$42,500', '+12%'],
          ['Conversion Rate', '12.5%', '+2%'],
        ]}
      />
      <Insight
        title="AI Business Insight"
        text='Pro Plan usage is up 15% this month. Higher tier migrations are accelerating; consider adding a "Team" middle tier to capture small agencies between Pro and Enterprise.'
      />
      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <PlanCard key={plan[0]} plan={plan} featured={plan[0] === 'Pro'} />
        ))}
      </div>
      <Panel className="mt-6">
        <h3 className="mb-4 text-lg font-bold">Recent Subscriptions</h3>
        <Table
          compact
          headers={['User / Organization', 'Current Plan', 'Renewal Date', 'MRR Contribution', 'Status']}
          rows={[
            ['Global Design Expo', <Badge key="p">Pro</Badge>, 'Oct 24, 2024', '$99.00', <Status key="s" value="Active" />],
            ['Metropolis Tech', <Badge key="e">Enterprise</Badge>, 'Nov 12, 2024', '$1,200.00', <Status key="s" value="Active" />],
            ['Solo Artists Assoc.', <Badge key="b">Basic</Badge>, 'Oct 05, 2024', '$29.00', <Status key="s" value="Pending" />],
          ]}
        />
      </Panel>
    </Page>
  )
}
