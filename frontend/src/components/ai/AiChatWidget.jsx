import { useMutation, useQuery } from '@tanstack/react-query'
import { Bot, Loader2, MessageCircle, Send, ShieldCheck, User } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchAiChatMeta, sendAiChatMessage } from '@/services/aiChat.js'

const MODE_LABELS = {
  gemini_grounded: 'Gemini grounded',
  agent_rag: 'Tool-first RAG',
  grounded_llm: 'RAG + LLM (grounded)',
  extractive_rag: 'RAG trích xuất',
  refusal: 'Từ chối ngoài phạm vi',
}

const WELCOME_MESSAGE = {
  role: 'assistant',
  content:
    'Xin chào! Tôi là EventHub AI. Bạn có thể hỏi nhanh về sự kiện, vé, đơn hàng, thanh toán, check-in hoặc tài khoản.',
  mode: 'system',
}

const LAUNCHER_SIZE = 64
const PANEL_WIDTH = 430
const PANEL_HEIGHT = 660
const EDGE_PADDING = 16

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

export function AiChatWidget() {
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('eventhub-ai-session') || '')
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [animationState, setAnimationState] = useState('closed')
  const [launcherPosition, setLauncherPosition] = useState(getDefaultLauncherPosition)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)
  const movedRef = useRef(false)
  const closeTimerRef = useRef(null)
  const bottomRef = useRef(null)

  const metaQuery = useQuery({
    queryKey: ['ai-chat-meta'],
    queryFn: fetchAiChatMeta,
    enabled: open,
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
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) movedRef.current = true

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
    }
  }

  const handleLauncherClick = () => {
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
    if (!message || chatMutation.isPending) return

    setMessages((current) => [...current, { role: 'user', content: message }])
    setInput('')
    chatMutation.mutate({
      message,
      session_id: sessionId || undefined,
      history: messages
        .filter((item) => ['user', 'assistant'].includes(item.role) && item.mode !== 'system')
        .slice(-10)
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

  return (
    <>
      {visible && (
        <section
          className={`fixed z-[70] flex max-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-[20px] border border-primary/20 bg-panel shadow-[0_28px_80px_rgba(3,8,24,0.48)] ${panelAnimationClass}`}
          style={{
            left: panelPosition.left,
            top: panelPosition.top,
            width: panelPosition.width,
            height: panelPosition.height,
            transformOrigin:
              launcherPosition.y + LAUNCHER_SIZE > window.innerHeight / 2
                ? 'bottom right'
                : 'top right',
          }}
          aria-label="EventHub AI Chatbox"
          aria-hidden={!open}
        >
          <div
            className="flex cursor-grab items-center gap-3 border-b border-primary/15 bg-[#081126] px-4 py-3.5 active:cursor-grabbing"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-ai),var(--color-secondary))] text-white shadow-lg shadow-ai/25">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-extrabold text-white">EventHub AI</p>
              <p className="truncate text-xs font-semibold text-muted">
                {chatMutation.isPending ? 'Đang trả lời...' : capabilities?.technique || 'Sẵn sàng hỗ trợ'}
              </p>
            </div>
          </div>

          <div className="ai-chat-scroll min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(18,33,85,0.22),rgba(12,20,70,0.78))] px-4 py-4">
            <div className="space-y-3.5">
              {messages.map((msg, index) => (
                <MessageBubble key={`${msg.role}-${index}`} message={msg} />
              ))}
              {chatMutation.isPending && (
                <div className="flex items-center gap-2 text-sm font-semibold text-ai">
                  <span className="grid size-8 place-items-center rounded-full bg-ai/15">
                    <Loader2 className="size-4 animate-spin" />
                  </span>
                  EventHub AI đang soạn trả lời...
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t border-primary/15 bg-[#081126] p-3.5">
            {suggested.length > 0 && (
              <div className="ai-chat-suggestion-scroll mb-3 flex gap-2 overflow-x-auto pb-1.5">
                {suggested.slice(0, 4).map((item, index) => (
                  <button
                    key={item.question || index}
                    type="button"
                    onClick={() => sendMessage(item.question)}
                    className="max-w-[260px] shrink-0 rounded-full border border-primary/25 bg-panel-soft px-3.5 py-2 text-left text-xs font-bold leading-4 text-subtle shadow-sm transition hover:border-ai/60 hover:bg-ai/10 hover:text-white"
                  >
                    {item.question}
                  </button>
                ))}
              </div>
            )}

            {error && <p className="mb-2 text-xs text-error">{error}</p>}

            <form
              className="flex items-end gap-2 rounded-[18px] border border-primary/15 bg-panel-soft p-2"
              onSubmit={(event) => {
                event.preventDefault()
                sendMessage(input)
              }}
            >
              <textarea
                className="max-h-28 min-h-10 flex-1 resize-none border-none bg-transparent px-2 py-2 text-sm leading-5 text-content outline-none placeholder:text-neutral"
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
        className={`fixed z-[71] grid size-16 place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-ai),var(--color-secondary))] text-white shadow-[0_18px_45px_rgba(3,8,24,0.5)] transition hover:brightness-110 ${
          dragging ? 'cursor-grabbing ring-4 ring-ai/30' : 'cursor-grab'
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
        {!open && <span className="absolute -right-1 -top-1 size-4 rounded-full border-2 border-panel bg-success" />}
      </button>
    </>
  )
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const isError = message.mode === 'error'

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`grid size-8 shrink-0 place-items-center rounded-full shadow-sm ${
          isUser ? 'bg-primary text-[#081126]' : isError ? 'bg-error/15 text-error' : 'bg-ai/20 text-ai'
        }`}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={`max-w-[78%] px-3.5 py-2.5 text-sm leading-5 shadow-sm ${
          isUser
            ? 'rounded-[18px] rounded-br-md bg-primary text-[#081126]'
            : isError
              ? 'rounded-[18px] rounded-bl-md border border-error/30 bg-error/10 text-error'
              : 'rounded-[18px] rounded-bl-md bg-[#17245c] text-subtle'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>

        {!isUser && message.mode && message.mode !== 'system' && (
          <div className="mt-2 space-y-2 border-t border-border-soft/60 pt-2 text-xs text-muted">
            <p className="inline-flex flex-wrap items-center gap-1">
              <ShieldCheck className="size-3" />
              {MODE_LABELS[message.mode] || message.mode}
              {message.confidence != null && ` · ${Math.round(message.confidence * 100)}%`}
              {message.intent && ` · intent: ${message.intent}`}
            </p>
            {message.sources?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {message.sources.map((source, index) => (
                  <span
                    key={source.id || `${source.title}-${index}`}
                    className="rounded-full bg-ai/10 px-2 py-0.5 text-ai"
                    title={source.title}
                  >
                    {source.category === 'events'
                      ? 'Event'
                      : source.category === 'event_categories'
                        ? 'Category'
                        : 'Source'}
                    :{source.id || source.title}
                  </span>
                ))}
              </div>
            )}
            {message.personalization?.hints?.[0] && (
              <p className="text-primary">{message.personalization.hints[0]}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
