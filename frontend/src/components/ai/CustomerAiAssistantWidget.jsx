import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Loader2, Bot, User, Sparkles } from 'lucide-react'
import { sendChatMessage } from '@/services/aiAssistant.js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function CustomerAiAssistantWidget({ enabled = true }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Xin chào! Tôi là trợ lý AI của EventHub. Tôi có thể giúp bạn tìm kiếm sự kiện, kiểm tra giá vé, trạng thái đơn hàng và các chính sách khác.' }
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  if (!enabled) return null

  const handleSend = async (e) => {
    e?.preventDefault()
    if (!input.trim() || isTyping) return

    const userMessage = input.trim()
    setInput('')
    
    const newHistory = [...messages, { role: 'user', content: userMessage }]
    setMessages(newHistory)
    setIsTyping(true)

    try {
      // Send history excluding the initial greeting if it's the only one
      const apiHistory = messages.length === 1 && messages[0].role === 'assistant' 
        ? [] 
        : messages.map(m => ({ role: m.role, content: m.content }))
        
      const response = await sendChatMessage(userMessage, apiHistory)
      
      setMessages(prev => [...prev, { role: 'assistant', content: response.content }])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng thử lại sau.' }])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full bg-gradient-to-r from-primary to-indigo-500 text-white shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-xl ${isOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
        aria-label="Mở trợ lý AI"
      >
        <Sparkles className="size-6" />
      </button>

      <div
        className={`fixed bottom-6 right-6 z-50 flex h-[600px] w-[400px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-2xl border border-border-soft bg-panel shadow-2xl transition-all duration-300 ${
          isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-10 opacity-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-border-soft bg-gradient-to-r from-[#081126] to-indigo-900/40 p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-primary/20 text-primary">
              <Bot className="size-6" />
            </div>
            <div>
              <h3 className="font-display font-bold text-white">EventHub AI</h3>
              <p className="text-xs text-primary">Trợ lý hỗ trợ sự kiện & vé</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="grid size-8 place-items-center rounded-full text-subtle hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border-soft hover:scrollbar-thumb-primary/50">
          <div className="flex flex-col gap-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex max-w-[85%] items-end gap-2 ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
              >
                <div className={`grid size-7 shrink-0 place-items-center rounded-full ${msg.role === 'user' ? 'bg-primary text-[#081126]' : 'bg-surface text-primary'}`}>
                  {msg.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
                </div>
                <div
                  className={`rounded-2xl px-4 py-2 ${
                    msg.role === 'user'
                      ? 'bg-primary text-[#081126] rounded-br-sm'
                      : 'bg-surface text-content rounded-bl-sm prose prose-sm prose-invert max-w-none prose-p:leading-snug prose-pre:bg-black/20'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  )}
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex max-w-[85%] self-start items-end gap-2">
                <div className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-primary">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl rounded-bl-sm bg-surface px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="size-2 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: '0ms' }} />
                    <span className="size-2 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: '150ms' }} />
                    <span className="size-2 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-border-soft bg-surface p-3">
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <div className="relative flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Hỏi về sự kiện, giá vé..."
                className="w-full resize-none rounded-xl border border-border-soft bg-background py-3 pl-4 pr-3 text-sm text-content placeholder-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '120px' }}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-[#081126] transition-colors hover:bg-white disabled:opacity-50"
            >
              <Send className="size-5" />
            </button>
          </form>
          <div className="mt-2 text-center text-[10px] text-muted">
            AI có thể mắc lỗi. Vui lòng kiểm tra lại thông tin quan trọng.
          </div>
        </div>
      </div>
    </>
  )
}
