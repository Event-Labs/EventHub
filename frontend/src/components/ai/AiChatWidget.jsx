import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, MessageCircle, Send, User } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchAiChatMeta, sendAiChatMessage } from '@/services/aiChat.js'

const MODE_LABELS = {
  eventhub_assistant: 'Đã kiểm tra thông tin',
  refusal: 'Ngoài phạm vi hỗ trợ',
  error: 'Tạm thời gián đoạn',
}

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    'Xin chào! Tôi là EventHub AI. Bạn có thể hỏi nhanh về sự kiện, vé, đơn hàng, thanh toán, check-in hoặc tài khoản.',
  mode: 'system',
}

const LAUNCHER_SIZE = 64
const PANEL_WIDTH = 390
const PANEL_HEIGHT = 580
const EDGE_PADDING = 16
const LOGO_SRC = '/images/ava.png'

function getDefaultLauncherPosition() {
  if (typeof window === 'undefined') return { x: 24, y: 24 }

  return {
    x: Math.max(EDGE_PADDING, window.innerWidth - LAUNCHER_SIZE - 24),
    y: Math.max(EDGE_PADDING, window.innerHeight - LAUNCHER_SIZE - 24),
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function AiChatWidget({ enabled = true }) {
  // Hard guard: only render when user has a valid session token
  const isLoggedIn = Boolean(localStorage.getItem('eventhub-token'))

  const [sessionId, setSessionId] = useState(() => localStorage.getItem('eventhub-ai-session') || '')
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [animationState, setAnimationState] = useState('closed')
  const [launcherPosition, setLauncherPosition] = useState(getDefaultLauncherPosition)
  const [dragging, setDragging] = useState(false)
  const [dragCollapsed, setDragCollapsed] = useState(false)
  // Re-check auth reactively (e.g. logout in another tab)
  const [authValid, setAuthValid] = useState(isLoggedIn)
  const dragRef = useRef(null)
  const movedRef = useRef(false)
  const closeTimerRef = useRef(null)
  const bottomRef = useRef(null)

  const metaQuery = useQuery({
    queryKey: ['ai-chat-meta'],
    queryFn: fetchAiChatMeta,
    enabled: enabled && open && authValid,
  })

  const chatMutation = useMutation({
    mutationFn: sendAiChatMessage,
    onSuccess: (data) => {
      if (data.session_id) {
        setSessionId(data.session_id)
        localStorage.setItem('eventhub-ai-session', data.session_id)
      }
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: data.answer,
          mode: data.mode,
          confidence: data.confidence,
          intent: data.intent,
          sources: data.sources,
          personalization: data.personalization,
        },
      ])
      setError('')
    },
    onError: (err) => {
      const message = err.response?.data?.message || 'Không thể gửi câu hỏi. Vui lòng thử lại.'
      setError(message)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: message,
          mode: 'error',
        },
      ])
    },
  })

  const panelPosition = useMemo(() => {
    if (typeof window === 'undefined') return { left: 16, top: 16 }

    const width = Math.min(PANEL_WIDTH, window.innerWidth - EDGE_PADDING * 2)
    const height = Math.min(PANEL_HEIGHT, window.innerHeight - EDGE_PADDING * 2)
    const alignRight = launcherPosition.x + LAUNCHER_SIZE > window.innerWidth / 2
    const alignBottom = launcherPosition.y + LAUNCHER_SIZE > window.innerHeight / 2
    const left = alignRight ? launcherPosition.x + LAUNCHER_SIZE - width : launcherPosition.x
    const top = alignBottom ? launcherPosition.y - height - 12 : launcherPosition.y + LAUNCHER_SIZE + 12

    return {
      left: clamp(left, EDGE_PADDING, window.innerWidth - width - EDGE_PADDING),
      top: clamp(top, EDGE_PADDING, window.innerHeight - height - EDGE_PADDING),
      width,
      height,
    }
  }, [launcherPosition])

  useEffect(() => {
    const handleAuthChange = () => {
      setAuthValid(Boolean(localStorage.getItem('eventhub-token')))
    }
    window.addEventListener('eventhub-auth', handleAuthChange)
    window.addEventListener('storage', handleAuthChange)
    return () => {
      window.removeEventListener('eventhub-auth', handleAuthChange)
      window.removeEventListener('storage', handleAuthChange)
    }
  }, [])

  useEffect(() => {
    const keepInsideViewport = () => {
      setLauncherPosition((current) => ({
        x: clamp(current.x, EDGE_PADDING, window.innerWidth - LAUNCHER_SIZE - EDGE_PADDING),
        y: clamp(current.y, EDGE_PADDING, window.innerHeight - LAUNCHER_SIZE - EDGE_PADDING),
      }))
    }

    window.addEventListener('resize', keepInsideViewport)
    return () => window.removeEventListener('resize', keepInsideViewport)
  }, [])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, messages, chatMutation.isPending])

  const startDrag = (event) => {
    if (event.button !== 0) return

    movedRef.current = false
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: launcherPosition.x,
      originY: launcherPosition.y,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event) => {
    const dragState = dragRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    const deltaX = event.clientX - dragState.startX
    const deltaY = event.clientY - dragState.startY
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      movedRef.current = true
      if (open) setDragCollapsed(true)
    }

    setLauncherPosition({
      x: clamp(dragState.originX + deltaX, EDGE_PADDING, window.innerWidth - LAUNCHER_SIZE - EDGE_PADDING),
      y: clamp(dragState.originY + deltaY, EDGE_PADDING, window.innerHeight - LAUNCHER_SIZE - EDGE_PADDING),
    })
  }

  const endDrag = (event) => {
    const dragState = dragRef.current
    if (dragState?.pointerId === event.pointerId) {
      dragRef.current = null
      setDragging(false)
      setDragCollapsed(false)
    }
  }

  const handleLauncherClick = () => {
    if (!enabled) return

    if (movedRef.current) {
      movedRef.current = false
      return
    }

    if (open) {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
      setAnimationState('closing')
      setOpen(false)
      closeTimerRef.current = window.setTimeout(() => {
        setVisible(false)
        setAnimationState('closed')
      }, 270)
      return
    }

    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    setVisible(true)
    setOpen(true)
    setAnimationState('opening')
    closeTimerRef.current = window.setTimeout(() => setAnimationState('open'), 430)
  }

  const sendMessage = (text) => {
    const message = text.trim()
    if (!enabled || !message || chatMutation.isPending) return

    setMessages((current) => [...current, { role: 'user', content: message }])
    setInput('')
    chatMutation.mutate({
      message,
      session_id: sessionId || undefined,
      history: messages
        .filter((item) => ['user', 'assistant'].includes(item.role) && !['system', 'error'].includes(item.mode))
        .slice(-8)
        .map((item) => ({ role: item.role, content: item.content })),
    })
  }

  const suggested = metaQuery.data?.suggested_questions || []
  const capabilities = metaQuery.data?.capabilities
  const panelAnimationClass =
    animationState === 'opening'
      ? 'ai-chat-genie-open'
      : animationState === 'closing'
        ? 'ai-chat-genie-close pointer-events-none'
        : 'ai-chat-genie-ready'

  if (!enabled || !isLoggedIn || !authValid) return null

  return (
    <>
      {visible && (
        <section
          className={`fixed z-[70] flex max-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-2xl border border-primary/20 bg-panel shadow-[0_24px_60px_rgba(3,8,24,0.46)] ${panelAnimationClass}`}
          style={{
            left: panelPosition.left,
            top: panelPosition.top,
            width: panelPosition.width,
            height: panelPosition.height,
            opacity: dragCollapsed ? 0 : 1,
            transition: 'opacity 140ms ease',
            transformOrigin:
              launcherPosition.y + LAUNCHER_SIZE > window.innerHeight / 2
                ? 'bottom right'
                : 'top right',
          }}
          aria-label="EventHub AI Chatbox"
          aria-hidden={!open || dragCollapsed}
        >
          <div
            className="flex cursor-grab items-center gap-2.5 border-b border-primary/15 bg-[#081126] px-3.5 py-3 active:cursor-grabbing"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <EventHubLogoMark className="size-9 shadow-lg shadow-tertiary/20" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-extrabold text-white">EventHub AI</p>
              <p className="truncate text-[11px] font-semibold text-muted">
                {chatMutation.isPending ? 'Đang trả lời...' : capabilities?.technique || 'Sẵn sàng hỗ trợ'}
              </p>
            </div>
          </div>

          <div className="ai-chat-scroll min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(18,33,85,0.22),rgba(12,20,70,0.78))] px-3 py-3">
            <div className="space-y-3">
              {messages.map((msg, index) => (
                <MessageBubble key={`${msg.role}-${index}`} message={msg} />
              ))}
              {chatMutation.isPending && (
                <div className="flex items-center gap-2 text-xs font-semibold text-ai">
                  <span className="grid size-7 place-items-center rounded-full bg-ai/15">
                    <Loader2 className="size-3.5 animate-spin" />
                  </span>
                  EventHub AI đang soạn trả lời...
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t border-primary/15 bg-[#081126] p-3">
            {suggested.length > 0 && (
              <div className="ai-chat-suggestion-scroll mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {suggested.slice(0, 4).map((item, index) => (
                  <button
                    key={item.question || index}
                    type="button"
                    onClick={() => sendMessage(item.question)}
                    className="shrink-0 rounded-full border border-primary/25 bg-panel-soft px-2.5 py-1 text-left text-[11px] font-semibold leading-4 text-subtle shadow-sm transition hover:border-ai/60 hover:bg-ai/10 hover:text-white whitespace-nowrap"
                    title={item.question}
                  >
                    {item.question}
                  </button>
                ))}
              </div>
            )}

            {error && <p className="mb-2 text-xs text-error">{error}</p>}

            <form
              className="flex items-end gap-2 rounded-2xl border border-primary/15 bg-panel-soft p-1.5"
              onSubmit={(event) => {
                event.preventDefault()
                sendMessage(input)
              }}
            >
              <textarea
                className="max-h-20 min-h-9 flex-1 resize-none border-none bg-transparent px-2.5 py-2 text-[13px] leading-5 text-content outline-none placeholder:text-neutral"
                placeholder="Hỏi về sự kiện, vé, đơn hàng, check-in..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    sendMessage(input)
                  }
                }}
                maxLength={1000}
              />
              <button
                type="submit"
                disabled={chatMutation.isPending || !input.trim()}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-ai text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Gửi tin nhắn"
                title="Gửi"
              >
                <Send className="size-4" />
              </button>
            </form>
          </div>
        </section>
      )}

      <button
        type="button"
        className={`fixed z-[71] grid size-16 place-items-center rounded-full bg-tertiary text-white shadow-[0_18px_45px_rgba(255,113,18,0.35)] transition hover:bg-orange-500 ${
          dragging ? 'cursor-grabbing ring-4 ring-tertiary/30' : 'cursor-grab'
        }`}
        style={{ left: launcherPosition.x, top: launcherPosition.y, touchAction: 'none' }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={handleLauncherClick}
        aria-label="Mở EventHub AI Chatbox"
        title="EventHub AI Chatbox"
      >
        <MessageCircle className="size-7" />
        {!open && <span className="absolute -right-1 -top-1 size-4 rounded-full border-2 border-panel bg-tertiary" />}
      </button>
    </>
  )
}

function EventHubLogoMark({ className = 'size-8' }) {
  return (
    <div
      className={`${className} grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface ring-2 ring-tertiary/30`}
      aria-hidden="true"
    >
      <img
        src={LOGO_SRC}
        alt=""
        className="h-full w-full object-cover object-center mix-blend-screen"
      />
    </div>
  )
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const isError = message.mode === 'error'

  return (
    <div className={`flex items-end gap-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`grid size-7 shrink-0 place-items-center rounded-full shadow-sm ${
          isUser ? 'bg-primary text-[#081126]' : isError ? 'bg-error/15 text-error' : ''
        }`}
      >
        {isUser ? <User className="size-3.5" /> : <EventHubLogoMark className="size-7" />}
      </div>
      <div
        className={`max-w-[82%] px-3 py-2 text-[13px] leading-5 shadow-sm ${
          isUser
            ? 'rounded-2xl rounded-br-md bg-primary text-[#081126]'
            : isError
              ? 'rounded-2xl rounded-bl-md border border-error/30 bg-error/10 text-error'
              : 'rounded-2xl rounded-bl-md bg-[#17245c] text-subtle'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>

        {!isUser && message.mode && !['system', 'eventhub_assistant'].includes(message.mode) && (
          <p className="mt-1.5 border-t border-border-soft/60 pt-1.5 text-[11px] font-semibold text-muted">
            {MODE_LABELS[message.mode] || 'Tôi chưa thể hỗ trợ nội dung này.'}
          </p>
        )}
      </div>
    </div>
  )
}
