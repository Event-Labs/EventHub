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
import { useLanguage } from '@/i18n/LanguageContext.jsx'

export function FavoriteEventsPage() {
  const { isEnglish } = useLanguage()
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
      toast.success(
        isFavorited
          ? isEnglish
            ? 'Event saved to favorites.'
            : 'Đã lưu sự kiện vào yêu thích.'
          : isEnglish
            ? 'Event removed from favorites.'
            : 'Đã bỏ sự kiện khỏi yêu thích.'
      )
      return { snapshots }
    },
    onSuccess: (data, event) => {
      if (data && typeof data.is_favorited === 'boolean') {
        optimisticallySetFavorite(queryClient, event, data.is_favorited)
      }
    },
    onError: (err, _event, context) => {
      restoreFavoriteSnapshots(queryClient, context?.snapshots)
      toast.error(
        getApiMessage(
          err,
          isEnglish ? 'Failed to update favorites.' : 'Không thể cập nhật danh sách yêu thích.'
        )
      )
    },
    onSettled: () => refreshFavoriteQueries(queryClient),
  })

  if (!isAuthenticated) return null

  const events = favoritesQuery.data || []

  return (
    <div className="mx-auto max-w-7xl px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-8 sm:pb-12">
      <SectionHeader
        title={isEnglish ? 'Favorite Events' : 'Sự kiện Yêu thích'}
        description={
          isEnglish
            ? 'Events you saved to revisit and book tickets later'
            : 'Các sự kiện bạn đã lưu để xem lại và đặt vé sau'
        }
      />

      {favoritesQuery.isLoading && (
        <StatePanel message={isEnglish ? 'Loading favorite events...' : 'Đang tải sự kiện yêu thích...'} />
      )}
      {favoritesQuery.isError && (
        <EmptyText isEnglish={isEnglish} />
      )}
      {!favoritesQuery.isLoading && !favoritesQuery.isError && events.length === 0 && (
        <EmptyText isEnglish={isEnglish} />
      )}

      <div className="mt-4 sm:mt-6 grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
    <div className="glass-panel mb-6 rounded-[24px] border-primary/20 p-8 text-center text-slate-400 shadow-[0_8px_32px_0_rgba(6,182,212,0.1)]">
      {message}
    </div>
  )
}

function EmptyText({ isEnglish = false }) {
  return (
    <div className="glass-panel mb-6 rounded-[24px] border-white/5 p-12 text-center italic text-slate-500 shadow-inner">
      {isEnglish ? 'No favorite events yet' : 'Không có sự kiện yêu thích nào'}
    </div>
  )
}
