import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchFavoriteEvents, removeFavorite } from '@/services/events.js'

export function FavoriteEventsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const isAuthenticated = Boolean(localStorage.getItem('eventhub-token'))

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

  const removeMutation = useMutation({
    mutationFn: (event) => removeFavorite(event.id),
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
        description="Các sự kiện bạn đã lưu để xem lại và đặt vé sau."
      />

      {favoritesQuery.isLoading && (
        <StatePanel message="Đang tải sự kiện yêu thích..." />
      )}
      {favoritesQuery.isError && (
        <StatePanel message="Không thể tải danh sách yêu thích." tone="error" />
      )}
      {!favoritesQuery.isLoading && !favoritesQuery.isError && events.length === 0 && (
        <StatePanel message="Bạn chưa lưu sự kiện yêu thích nào." />
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <div key={event.id}>
            <EventCard event={event} compact />
            <button
              type="button"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate(event)}
              className="mt-3 w-full rounded-md border border-error/40 py-2 text-sm font-bold text-error transition hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Xóa khỏi yêu thích
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatePanel({ message, tone = 'default' }) {
  return (
    <div className={`mb-6 rounded-lg border p-6 text-center ${tone === 'error' ? 'border-error/40 bg-error/10 text-error' : 'border-border-soft bg-panel text-muted'}`}>
      {message}
    </div>
  )
}
