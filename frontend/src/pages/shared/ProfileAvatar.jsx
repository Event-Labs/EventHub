import { useMemo, useState } from 'react'

function getInitials(name = '', fallback = 'EH') {
  const initials = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return initials || fallback
}

function normalizeSources(sources) {
  return (Array.isArray(sources) ? sources : [sources])
    .map((source) => (typeof source === 'string' ? source.trim() : ''))
    .filter(Boolean)
    .filter((source, index, list) => list.indexOf(source) === index)
}

export function ProfileAvatar({
  sources,
  name,
  alt = 'Avatar',
  className = 'size-7',
  fallbackClassName = '',
  fallback = 'EH',
}) {
  const urls = useMemo(() => normalizeSources(sources), [sources])
  const sourceKey = urls.join('|')
  const [failed, setFailed] = useState({ key: '', urls: [] })
  const failedUrls = failed.key === sourceKey ? failed.urls : []
  const currentUrl = urls.find((url) => !failedUrls.includes(url))

  if (!currentUrl) {
    return (
      <span
        className={`${className} ${fallbackClassName} grid shrink-0 place-items-center rounded-full bg-tertiary/15 text-sm font-extrabold text-tertiary ring-2 ring-tertiary/20`}
      >
        {getInitials(name, fallback)}
      </span>
    )
  }

  return (
    <img
      src={currentUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      className={`${className} shrink-0 rounded-full object-cover`}
      onError={() => {
        setFailed((current) => ({
          key: sourceKey,
          urls: current.key === sourceKey ? [...current.urls, currentUrl] : [currentUrl],
        }))
      }}
    />
  )
}
