import { isAuthenticated as hasAuthSession } from '@/lib/auth.js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { EventCard } from '@/components/EventCard.jsx'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchFavoriteEvents, toggleFavorite } from '@/services/events.js'
import { getApiMessage } from '@/lib/messages.js'
import { optimisticallySetFavorite, refreshFavoriteQueries, restoreFavoriteSnapshots } from '@/lib/favoriteCache.js'
import { useToast } from '@/providers/ToastProvider.jsx'

export function FavoriteEventsPage() {
  const toast = useToast()
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
    onMutate: (event) => {
      const isFavorited = !event.is_favorited
      const snapshots = optimisticallySetFavorite(queryClient, event, isFavorited)
      toast.success(isFavorited ? '\u0110\u00e3 l\u01b0u s\u1ef1 ki\u1ec7n v\u00e0o y\u00eau th\u00edch.' : '\u0110\u00e3 b\u1ecf s\u1ef1 ki\u1ec7n kh\u1ecfi y\u00eau th\u00edch.')
      return { snapshots }
    },
    onError: (err, _event, context) => {
      restoreFavoriteSnapshots(queryClient, context?.snapshots)
      toast.error(getApiMessage(err, 'Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt danh s\u00e1ch y\u00eau th\u00edch.'))
    },
    onSettled: () => refreshFavoriteQueries(queryClient),
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
