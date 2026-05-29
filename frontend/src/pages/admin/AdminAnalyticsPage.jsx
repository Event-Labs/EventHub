import { Insight, KpiGrid, Legend, Page, Panel } from './AdminComponents.jsx'

export function AdminAnalyticsPage() {
  return (
    <Page
      title="Admin Analytics"
      description="Monitor platform growth, revenue, and review pressure."
    >
      <KpiGrid
        items={[
          ['Total Users', '142.8k', '+12%'],
          ['Total Organizers', '8.4k', '+5%'],
          ['Total Revenue', '$1.2M', '+24%'],
          ['Platform Fees', '$180K', '+18%'],
          ['Published Events', '12,504', ''],
          ['Pending Reviews', '142', 'Urgent'],
          ['Organizer Requests', '89', 'Urgent'],
        ]}
      />
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        <Panel className="min-h-[310px]">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-lg font-bold">Revenue Trend</h3>
            <div className="rounded bg-[#eceef0] p-1 text-xs font-bold">
              <button className="rounded bg-primary px-3 py-1 text-slate-950">Weekly</button>
              <button className="px-3 py-1 text-[#737686]">Monthly</button>
            </div>
          </div>
          <div className="flex h-56 items-end gap-3 border-b border-[#e0e3e5]">
            {[44, 60, 52, 78, 70, 92, 100].map((height, index) => (
              <div
                key={index}
                className="flex-1 rounded-t bg-[#cdd9f4]"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-7 text-center text-xs font-semibold text-[#8a8d99]">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
        </Panel>
        <Panel>
          <h3 className="text-sm font-bold">Event Distribution</h3>
          <div className="mx-auto my-8 grid size-36 place-items-center rounded-lg border-[10px] border-primary border-r-ai border-t-ai text-2xl font-bold text-[#191c1e]">
            75%
          </div>
          <Legend rows={[['Tech', '45%'], ['Music', '30%'], ['Business', '25%']]} />
        </Panel>
      </div>
      <Insight text="Organizer verification requests increased by 22% this week. Consider prioritizing pending reviews." />
    </Page>
  )
}
