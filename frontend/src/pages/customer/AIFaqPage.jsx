import { useMutation, useQuery } from '@tanstack/react-query'
import { Bot, Loader2, Send, ShieldCheck, Sparkles, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SectionHeader } from '@/components/SectionHeader.jsx'
import { fetchAiFaqMeta, sendAiFaqMessage } from '@/services/aiFaq.js'

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
    'Xin chào! Tôi là EventHub AI Chatbox - trợ lý Gemini được giới hạn trong dữ liệu hệ thống EventHub. ' +
    'Bạn có thể hỏi linh hoạt về sự kiện, vé, đơn hàng, thanh toán, check-in hoặc tài khoản.',
  mode: 'system',
}

export function AIFaqPage() {
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('eventhub-ai-session') || '')
  const [messages, setMessages] = useState([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  const metaQuery = useQuery({
    queryKey: ['ai-faq-meta'],
    queryFn: fetchAiFaqMeta,
  })

  const chatMutation = useMutation({
    mutationFn: sendAiFaqMessage,
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatMutation.isPending])

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeader
        title="EventHub AI Chatbox"
        description="Trợ lý Gemini sử dụng dữ liệu hệ thống EventHub và từ chối nội dung ngoài phạm vi"
      />

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="glass-panel rounded-lg p-4 text-sm text-muted">
          <p className="inline-flex items-center gap-2 font-semibold text-ai">
            <Sparkles className="size-4" />
            {capabilities?.technique || 'RAG pipeline'}
          </p>
          <p className="mt-2">
            Câu trả lời được giới hạn bởi dữ liệu sự kiện, vé, đơn hàng và trạng thái hệ thống hiện có.
          </p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-sm">
          <p className="font-semibold text-white">Phạm vi hỗ trợ</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
            {(capabilities?.can_help_with || []).slice(0, 4).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="glass-panel rounded-lg p-4 sm:p-6">
        <div className="mb-4 max-h-[420px] space-y-4 overflow-y-auto pr-1">
          {messages.map((msg, index) => (
            <MessageBubble key={`${msg.role}-${index}`} message={msg} />
          ))}
          {chatMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-ai">
              <Loader2 className="size-4 animate-spin" />
              Đang gửi context hệ thống tới Gemini...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {suggested.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {suggested.map((item, index) => (
              <button
                key={item.question || index}
                type="button"
                onClick={() => sendMessage(item.question)}
                className="rounded-full border border-ai/40 px-3 py-2 text-sm text-ai hover:bg-ai/10"
              >
                {item.question}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mb-3 text-sm text-error">{error}</p>}

        <form
          className="flex gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            sendMessage(input)
          }}
        >
          <input
            className="flex-1 rounded-md border border-border-soft bg-surface p-3 outline-none focus:border-ai"
            placeholder="Hỏi linh hoạt về sự kiện, vé, đơn hàng, check-in..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={chatMutation.isPending || !input.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-ai px-5 py-3 font-bold text-white disabled:opacity-60"
          >
            <Send className="size-4" />
            Gửi
          </button>
        </form>
      </div>
    </div>
  )
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const isError = message.mode === 'error'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`grid size-9 shrink-0 place-items-center rounded-full ${
          isUser ? 'bg-primary/20 text-primary' : isError ? 'bg-error/15 text-error' : 'bg-ai/20 text-ai'
        }`}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
          isUser
            ? 'bg-primary/15 text-white'
            : isError
              ? 'border border-error/30 bg-error/10 text-error'
              : 'bg-panel-soft text-subtle'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {!isUser && message.mode && message.mode !== 'system' && (
          <div className="mt-3 space-y-2 border-t border-border-soft/60 pt-2 text-xs text-muted">
            <p className="inline-flex items-center gap-1">
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
