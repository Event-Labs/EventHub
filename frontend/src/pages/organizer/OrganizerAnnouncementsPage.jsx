import { Bold, Image, Italic, List, Send } from 'lucide-react'
import { Badge, Insight, OrganizerPage, OrganizerPanel } from './OrganizerComponents.jsx'

export function OrganizerAnnouncementsPage() {
  return (
    <OrganizerPage title="Engagement: Announcements">
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <OrganizerPanel>
            <h3 className="mb-5 text-lg font-extrabold text-[#191c1e]">New Announcement</h3>
            <div className="grid gap-4">
              <Field label="Announcement Title" value="Welcome to Neon Horizon!" />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold text-[#434655]">Target Audience</span>
                  <select className="mt-2 h-11 w-full rounded border border-[#c3c6d7] bg-white px-3 text-sm">
                    <option>All Attendees</option>
                    <option>VIP Only</option>
                  </select>
                </label>
                <div>
                  <p className="text-xs font-bold text-[#434655]">Delivery Channel</p>
                  <div className="mt-3 flex gap-5 text-sm font-semibold">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked className="accent-primary" />
                      Email
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" defaultChecked className="accent-primary" />
                      In-app
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <span className="text-xs font-bold text-[#434655]">Message Body</span>
                <div className="mt-2 overflow-hidden rounded-md border border-[#c3c6d7]">
                  <div className="flex gap-3 border-b border-[#e0e3e5] bg-[#f2f4f6] px-3 py-2 text-[#434655]">
                    <Bold className="size-4" />
                    <Italic className="size-4" />
                    <List className="size-4" />
                    <Image className="size-4" />
                  </div>
                  <textarea
                    className="min-h-44 w-full resize-none p-4 text-sm outline-none"
                    defaultValue="Draft your event update here... Use @ to tag speakers or # for schedule sessions."
                  />
                </div>
              </div>
              <button className="admin-primary ml-auto">
                <Send className="size-4" />
                Send Announcement Now
              </button>
            </div>
          </OrganizerPanel>
          <Insight>
            Based on your last 3 events, announcements sent between 10:00 AM and 11:30 AM receive 42% higher open rates.
          </Insight>
        </div>
        <aside className="space-y-5">
          <OrganizerPanel>
            <h3 className="mb-4 text-sm font-extrabold uppercase text-[#434655]">Real-time Preview</h3>
            <div className="mx-auto max-w-64 rounded-[2rem] bg-[#111827] p-4 text-white shadow-xl">
              <div className="rounded-[1.5rem] bg-gradient-to-br from-slate-900 via-blue-900 to-fuchsia-700 p-5">
                <p className="text-xs font-bold text-primary">EventHub App</p>
                <p className="mt-8 text-lg font-bold">Welcome to Neon Horizon!</p>
                <p className="mt-2 text-xs text-slate-200">We are thrilled to have you here.</p>
                <p className="mt-16 text-center text-3xl font-extrabold">12:45</p>
              </div>
            </div>
            <p className="mt-3 text-center text-xs italic text-[#737686]">
              Mobile in-app notification preview
            </p>
          </OrganizerPanel>
          <OrganizerPanel>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-extrabold uppercase text-[#434655]">Announcement History</h3>
              <button className="text-xs font-bold text-primary">View All</button>
            </div>
            {['Venue Change Notice', 'Early Bird Extension', 'Speaker Spotlight: Dr. Aris'].map((item, index) => (
              <div key={item} className="border-t border-[#e0e3e5] py-4 first:border-t-0">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{item}</p>
                  <Badge tone={index === 2 ? 'blue' : 'green'}>{index === 2 ? 'Draft' : 'Sent'}</Badge>
                </div>
                <p className="mt-1 text-xs text-[#737686]">All Attendees - {index + 2}h ago</p>
              </div>
            ))}
          </OrganizerPanel>
        </aside>
      </div>
    </OrganizerPage>
  )
}

function Field({ label, value }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-[#434655]">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded border border-[#c3c6d7] bg-white px-3 text-sm outline-none focus:border-primary"
        defaultValue={value}
      />
    </label>
  )
}
