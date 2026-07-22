const FAVORITE_QUERY_ROOTS = new Set([
  'events',
  'home-events',
  'event-detail',
  'favorite-events',
])

function updateEvent(event, eventId, isFavorited) {
  if (!event || String(event.id) !== String(eventId)) return event
  return { ...event, is_favorited: isFavorited }
}

function updateQueryData(data, queryKey, event, isFavorited) {
  if (!data) return data
  const eventId = event.id

  if (queryKey[0] === 'favorite-events' && Array.isArray(data)) {
    if (!isFavorited) {
      return data.filter((item) => String(item.id) !== String(eventId))
    }
    const exists = data.some((item) => String(item.id) === String(eventId))
    return exists
      ? data.map((item) => updateEvent(item, eventId, true))
      : [{ ...event, is_favorited: true }, ...data]
  }

  if (Array.isArray(data)) {
    return data.map((item) => updateEvent(item, eventId, isFavorited))
  }

  if (Array.isArray(data.items)) {
    return {
      ...data,
      items: data.items.map((item) => updateEvent(item, eventId, isFavorited)),
    }
  }

  return updateEvent(data, eventId, isFavorited)
}

export function optimisticallySetFavorite(queryClient, event, isFavorited) {
  const predicate = (query) => FAVORITE_QUERY_ROOTS.has(query.queryKey[0])
  const snapshots = queryClient.getQueriesData({ predicate })

  queryClient.cancelQueries({ predicate })
  snapshots.forEach(([queryKey]) => {
    queryClient.setQueryData(queryKey, (data) =>
      updateQueryData(data, queryKey, event, isFavorited),
    )
  })

  return snapshots
}

export function restoreFavoriteSnapshots(queryClient, snapshots = []) {
  snapshots.forEach(([queryKey, data]) => queryClient.setQueryData(queryKey, data))
}

export function refreshFavoriteQueries(queryClient) {
  FAVORITE_QUERY_ROOTS.forEach((root) => {
    queryClient.invalidateQueries({ queryKey: [root] })
  })
}