import {
  Calendar,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  UserCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import { events } from '@/data/events.js'

export function EventDetailPage() {
  const { eventId } = useParams()
  const event = useMemo(
    () => events.find((item) => item.id === eventId) ?? events[0],
    [eventId],
  )
  const [quantity, setQuantity] = useState(1)

  return (
    <>
      <section className="relative h-[620px] overflow-hidden">
        <img
          src={event.image}
          alt={event.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="relative mx-auto flex h-full max-w-7xl items-end px-4 pb-14 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <span className="rounded-full border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-bold text-primary">
              {event.category}
            </span>
            <h1 className="mt-5 font-display text-5xl font-extrabold text-white md:text-7xl">
              {event.title}: {event.subtitle}
            </h1>
            <div className="mt-6 flex flex-wrap gap-5 text-muted">
              <Info
                icon={UserCircle}
                text={`Ban tổ chức: ${event.organizer}`}
              />
              <Info icon={Calendar} text={`${event.date} - ${event.time}`} />
              <Info icon={MapPin} text={event.venue} />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_380px] lg:px-8">
        <section className="space-y-10">
          <div className="border-b border-border-soft">
            {[
              'Tổng quan',
              'Lịch trình',
              'Địa điểm',
              'Sơ đồ ghế',
              'Chính sách',
              'Đánh giá',
            ].map((tab, index) => (
              <button
                key={tab}
                className={`mr-6 border-b-2 pb-4 text-sm font-bold ${index === 0 ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-white'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <article>
            <h2 className="font-display text-3xl font-bold text-white">
              Trải nghiệm sự kiện thế hệ mới
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted">
              {event.description}
            </p>
            <p className="mt-4 text-lg leading-8 text-muted">
              Trang chi tiết hiển thị mô tả, lịch trình, địa điểm, sơ đồ ghế,
              chính sách vé và đánh giá để khách hàng quyết định đặt vé nhanh.
            </p>
          </article>
          <section>
            <h2 className="mb-5 font-display text-2xl font-bold text-white">
              Sự kiện liên quan
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {events
                .filter((item) => item.id !== event.id)
                .slice(0, 3)
                .map((item) => (
                  <EventCard key={item.id} event={item} compact />
                ))}
            </div>
          </section>
        </section>

        <aside className="glass-panel h-fit rounded-lg p-6 lg:sticky lg:top-28">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">
                Đặt vé
              </h2>
              <p className="mt-1 text-sm text-muted">Chỉ còn 15 vé VIP.</p>
            </div>
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-semibold text-muted">
              Chọn hạng vé
            </span>
            <select className="w-full rounded-md border border-border-soft bg-surface p-3 text-content outline-none focus:border-primary">
              <option>Vé thường - ${event.price}.00</option>
              <option>Vé VIP - $199.00</option>
              <option>Gói hậu trường AI - $450.00</option>
            </select>
          </label>
          <div className="mt-5 flex items-center justify-between rounded-md bg-panel-soft p-4">
            <span className="font-semibold">Số lượng</span>
            <div className="flex items-center gap-3">
              <button
                className="grid size-8 place-items-center rounded-full border border-border-soft"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                <Minus className="size-4" />
              </button>
              <span className="font-display text-xl font-bold text-primary">
                {quantity}
              </span>
              <button
                className="grid size-8 place-items-center rounded-full border border-border-soft"
                onClick={() => setQuantity((value) => value + 1)}
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
          <div className="mt-6 border-t border-border-soft pt-6">
            <div className="flex justify-between">
              <span className="text-muted">Tạm tính</span>
              <span className="font-display text-2xl font-bold text-primary">
                ${(quantity * event.price).toFixed(2)}
              </span>
            </div>
            <Link
              to="/booking"
              className="mt-6 flex w-full items-center justify-center rounded-md bg-tertiary py-4 font-bold text-white transition hover:bg-orange-600"
            >
              Đặt vé
            </Link>
          </div>
        </aside>
      </div>
    </>
  )
}

function Info({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-5 text-primary" />
      <span>{text}</span>
    </div>
  )
}
