import { isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchFavoriteEvents, toggleFavorite } from '@/services/events.js'

export function FavoriteEventsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const isAuthenticated = hasAuthSession()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
    }
  }, [isAuthenticated, location.pathname, navigate])

  const favoritesQuery = useQuery({
    queryKey: ['favorite-events'],
    queryFn: fetchFavoriteEvents,
    enabled: isAuthenticated,
  })

  const favoriteMutation = useMutation({
    mutationFn: (event) => toggleFavorite(event.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorite-events'] })
      queryClient.invalidateQueries({ queryKey: ['events'] })
    },
  })

  if (!isAuthenticated) return null

  const events = favoritesQuery.data || []

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeader
        title="Sự kiện yêu thích"
        description="Các sự kiện bạn đã lưu để xem lại và đặt vé sau"
      />

      {favoritesQuery.isLoading && (
        <StatePanel message="Đang tải sự kiện yêu thích..." />
      )}
      {favoritesQuery.isError && (
        <EmptyText />
      )}
      {!favoritesQuery.isLoading && !favoritesQuery.isError && events.length === 0 && (
        <EmptyText />
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={{ ...event, is_favorited: true }}
            compact
            onFavoriteToggle={(selectedEvent) => favoriteMutation.mutate(selectedEvent)}
            favoriteBusy={favoriteMutation.isPending}
          />
        ))}
      </div>
    </div>
  )
}

function StatePanel({ message }) {
  return (
    <div className="mb-6 rounded-lg border border-border-soft bg-panel p-6 text-center text-muted">
      {message}
    </div>
  )
}

function EmptyText() {
  return (
    <p className="mb-6 text-sm italic text-muted text-center">
      Không có sự kiện yêu thích nào 
    </p>
  )
}
