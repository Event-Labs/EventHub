import { Filter, Search } from 'lucide-react'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { events } from '@/data/events.js'

export function EventsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="glass-panel mb-8 rounded-lg p-5">
        <div className="grid gap-4 md:grid-cols-[1.3fr_1fr_1fr_auto]">
          {['Search events...', 'All Cities', 'Date'].map(
            (placeholder, index) => (
              <label key={placeholder} className="space-y-2">
                <span className="text-sm font-semibold text-muted">
                  {index === 0 ? 'Keyword' : index === 1 ? 'Location' : 'Date'}
                </span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral" />
                  <input
                    type={index === 2 ? 'date' : 'text'}
                    placeholder={placeholder}
                    className="w-full rounded-md border border-border-soft bg-surface py-3 pl-10 pr-3 text-content outline-none focus:border-primary"
                  />
                </div>
              </label>
            ),
          )}
          <button className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 font-bold text-slate-950">
            <Filter className="size-4" />
            Tìm sự kiện
          </button>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="glass-panel sticky top-28 rounded-lg p-5">
            <h2 className="font-display text-xl font-bold text-primary">
              Bộ lọc
            </h2>
            {['Tech & AI', 'Music Festivals', 'Digital Art', 'Business'].map(
              (item) => (
                <label
                  key={item}
                  className="mt-4 flex items-center gap-3 text-sm text-muted"
                >
                  <input type="checkbox" className="size-4 accent-primary" />
                  {item}
                </label>
              ),
            )}
            <div className="mt-6">
              <p className="mb-3 text-sm font-semibold text-content">
                Khoảng giá
              </p>
              <input type="range" className="w-full accent-primary" />
            </div>
          </div>
        </aside>

        <section>
          <SectionHeader
            title="Danh sách sự kiện"
            description="248 events found nearby"
          />
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
