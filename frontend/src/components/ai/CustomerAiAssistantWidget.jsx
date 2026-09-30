import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Loader2, Bot, User, Sparkles, Menu, Plus, Trash2, Clock, ChevronLeft } from 'lucide-react'
import { sendChatMessage } from '@/services/aiAssistant.js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate, Link } from 'react-router-dom'
import { fetchEventDetail } from '@/services/events.js'
import { getProfile } from '@/services/user.service.js'

function ActionMessage({ content, navigate }) {
  const actionRegex = /\[ACTION:([A-Z_]+):?([^\]]*)\]/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = actionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.substring(lastIndex, match.index) });
    }
    parts.push({ type: 'action', action: match[1], args: match[2].split(':') });
    lastIndex = actionRegex.lastIndex;
  }
  
  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.substring(lastIndex) });
  }

  // Navigation handler for BOOKING action
  const handleBookingNavigate = async (args) => {
    const [eventId, sessionId] = args || [];
    if (!eventId) return;

    try {
      const event = await fetchEventDetail(eventId);
      if (event) {
        const session = event.sessions?.find(s => String(s.id) === String(sessionId)) || event.sessions?.[0];
        const hasSeatMap = Boolean(
          session?.seat_map_id || 
          session?.has_seat_map ||
          event.ticket_types?.some(t => t.is_seated === true)
        );
        if (hasSeatMap && session) {
          const firstVenue = event.venues?.[0];
          const venueSummaryText = event.venue?.summary || (firstVenue ? [firstVenue.name, firstVenue.address_line].filter(Boolean).join(', ') : '');
          let userProfile = null;
          try {
            userProfile = await getProfile();
          } catch {}

          const cart = {
            eventId: event.id,
            eventTitle: event.title,
            eventSlug: event.slug,
            eventStartTime: event.start_time,
            eventEndTime: event.end_time,
            venueSummary: venueSummaryText,
            selectedSession: session,
            availableTicketTypes: event.ticket_types || [],
            seatingRules: event.seating_rules || {},
            additionalTerms: event.additional_terms || '',
            requireAttendeeInfo: Boolean(event.require_attendee_info),
            buyer: {
              name: userProfile?.full_name || '',
              email: userProfile?.email || '',
              phone: userProfile?.phone || '',
            },
            items: [],
          };
          window.sessionStorage.setItem('eventhub-booking-draft', JSON.stringify(cart));
          navigate('/booking/seats', { state: { cart } });
          return;
        }
      }
    } catch (e) {
      console.warn('Fallback booking navigate', e);
    }

    const url = `/events/${encodeURIComponent(eventId)}${sessionId ? `?session=${sessionId}` : ''}#booking-section`;
    if (window.location.pathname === `/events/${eventId}` || window.location.pathname === `/events/${encodeURIComponent(eventId)}`) {
      const el = document.getElementById('booking-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    navigate(url);
  };

  // Navigation handler for PREFILL_BOOKING action
  const handlePrefillNavigate = async (args) => {
    const [
      eventId,
      sessionId,
      ticketTypeId,
      quantityStr,
      buyerPhoneEnc,
      buyerNameEnc,
      buyerEmailEnc,
      attendeeNameEnc,
      attendeeEmailEnc,
    ] = args || [];
    if (!eventId) return;
    const quantity = parseInt(quantityStr, 10) || 1;
    const safeDecode = (str) => {
      try { return decodeURIComponent(str || '').trim(); } catch { return String(str || '').trim(); }
    };
    const buyerPhone = safeDecode(buyerPhoneEnc);
    const buyerName = safeDecode(buyerNameEnc);
    const buyerEmail = safeDecode(buyerEmailEnc);
    const attendeeName = safeDecode(attendeeNameEnc);
    const attendeeEmail = safeDecode(attendeeEmailEnc);

    try {
      const event = await fetchEventDetail(eventId);
      if (!event) {
        navigate(`/events/${encodeURIComponent(eventId)}#booking-section`);
        return;
      }

      const session = event.sessions?.find(s => String(s.id) === String(sessionId)) || event.sessions?.[0];
      if (!session) {
        navigate(`/events/${encodeURIComponent(event.slug || event.id)}#booking-section`);
        return;
      }

      const firstVenue = event.venues?.[0];
      const venueSummaryText = event.venue?.summary || (firstVenue ? [firstVenue.name, firstVenue.address_line].filter(Boolean).join(', ') : '');

      let items = [];
      if (ticketTypeId && (ticketTypeId.includes('*') || ticketTypeId.includes(','))) {
        // Multi-ticket format: id1*qty1,id2*qty2
        const parts = ticketTypeId.split(',');
        for (const p of parts) {
          const [tId, qStr] = p.split('*');
          const tType = event.ticket_types?.find(t => String(t.id) === String(tId));
          const q = parseInt(qStr, 10) || 1;
          if (tType) {
            items.push({ ticketType: tType, quantity: q, sessionSeatIds: [] });
          }
        }
      } else {
        const ticketType = event.ticket_types?.find(t => String(t.id) === String(ticketTypeId)) || event.ticket_types?.[0];
        if (ticketType) {
          items.push({ ticketType, quantity, sessionSeatIds: [] });
        }
      }

      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0) || quantity;

      const hasSeatMap = Boolean(
        session?.seat_map_id || 
        session?.has_seat_map ||
        event.ticket_types?.some(t => t.is_seated === true)
      );

      // Decode attendee list if serialized as Name1|Email1;Name2|Email2...
      let attendeeList = [];
      const decodedAttendeeData = safeDecode(attendeeNameEnc);
      if (decodedAttendeeData.includes('|') || decodedAttendeeData.includes(';')) {
        attendeeList = decodedAttendeeData.split(';').map(part => {
          const [n, e] = part.split('|');
          return { name: (n || '').trim(), email: (e || '').trim() };
        }).filter(a => a.name || a.email);
      } else if (attendeeName || attendeeEmail) {
        attendeeList = [{ name: attendeeName, email: attendeeEmail }];
      }

      // Build attendees map matching expandAttendeeSlots for /booking/review
      const attendees = {};
      let runningSlotsLength = 0;
      items.forEach(item => {
        for (let i = 0; i < item.quantity; i++) {
          const slotId = `${item.ticketType.id}-${i}-${runningSlotsLength}`;
          const slotAttendee = attendeeList[runningSlotsLength] || {};
          attendees[slotId] = {
            name: slotAttendee.name || '',
            email: slotAttendee.email || ''
          };
          runningSlotsLength++;
        }
      });

      const cart = {
        eventId: event.id,
        eventTitle: event.title,
        eventSlug: event.slug,
        eventStartTime: event.start_time,
        eventEndTime: event.end_time,
        venueSummary: venueSummaryText,
        selectedSession: session,
        availableTicketTypes: event.ticket_types || [],
        seatingRules: event.seating_rules || {},
        additionalTerms: event.additional_terms || '',
        requireAttendeeInfo: Boolean(event.require_attendee_info),
        buyer: {
          name: buyerName || '',
          email: buyerEmail || '',
          phone: buyerPhone || '',
        },
        attendees,
        prefilledAttendees: Array.from({ length: totalQuantity }, (_, idx) => ({
          name: attendeeList[idx]?.name || '',
          email: attendeeList[idx]?.email || '',
        })),
        items,
      };

      try {
        window.sessionStorage.setItem('eventhub-booking-draft', JSON.stringify(cart));
      } catch (e) {
        console.warn('Could not save draft to sessionStorage', e);
      }

      if (hasSeatMap) {
        navigate('/booking/seats', { state: { cart } });
      } else {
        // Sự kiện không có chỗ ngồi -> Chuyển thẳng đến trang xác nhận vé
        navigate('/booking/review', { state: { cart } });
      }
    } catch (err) {
      console.error('Failed to prepare booking cart, falling back to event page:', err);
      navigate(`/events/${encodeURIComponent(eventId)}#booking-section`);
    }
  };


  // Auto-navigation for PREFILL_BOOKING action
  const prefillAction = parts.find(p => p.type === 'action' && p.action === 'PREFILL_BOOKING');
  const prefillKey = prefillAction ? prefillAction.args.join(',') : null;
  const hasPrefilled = useRef(false);

  useEffect(() => {
    if (prefillAction && !hasPrefilled.current) {
      hasPrefilled.current = true;
      const timer = setTimeout(() => {
        handlePrefillNavigate(prefillAction.args);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [prefillKey]);

  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>;
        }

        if (part.action === 'BOOKING') {
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleBookingNavigate(part.args)}
              className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-cyan-500/60 bg-[#0e2744] px-4 py-2.5 text-sm font-bold text-cyan-300 shadow-md hover:bg-[#14375f] hover:border-cyan-400 transition-all cursor-pointer group"
            >
              <span>🪑 Nhấn vào đây để chọn ghế trên sơ đồ</span>
              <span className="transition-transform group-hover:translate-x-1">➔</span>
            </button>
          )
        }

        if (part.action === 'PREFILL_BOOKING') {
          const isSeatBooking = content.toLowerCase().includes('ghế') || content.toLowerCase().includes('sơ đồ');
          return (
            <button
              key={i}
              type="button"
              onClick={() => handlePrefillNavigate(part.args)}
              className={`mt-2 flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-md transition-all cursor-pointer group ${
                isSeatBooking
                  ? 'border-cyan-500/60 bg-[#0e2744] text-cyan-300 hover:bg-[#14375f] hover:border-cyan-400'
                  : 'border-emerald-500/60 bg-[#0c3124] text-emerald-300 hover:bg-[#124533] hover:border-emerald-400'
              }`}
            >
              <span>{isSeatBooking ? '🪑 Nhấn vào đây để chọn ghế trên sơ đồ' : '🎟️ Nhấn vào đây để xem lại & xác nhận vé'}</span>
              <span className="transition-transform group-hover:translate-x-1">➔</span>
            </button>
          )
        }

        return null;
      })}
    </div>
  );
}

const SESSIONS_STORAGE_KEY = 'eventhub_ai_chat_sessions';
const ACTIVE_SESSION_STORAGE_KEY = 'eventhub_ai_active_session_id';

const DEFAULT_GREETING = {
  role: 'assistant',
  content: 'Xin chào! Tôi là trợ lý AI của EventHub. Tôi có thể giúp bạn tìm kiếm sự kiện, kiểm tra giá vé, trạng thái đơn hàng và các chính sách khác.'
};

function createNewSession() {
  const id = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  return {
    id,
    title: 'Đoạn chat mới',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [DEFAULT_GREETING]
  };
}

function loadInitialSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading AI chat sessions from localStorage', e);
  }
  return [createNewSession()];
}

function loadInitialActiveId(sessions) {
  try {
    const activeId = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (activeId && sessions.some(s => s.id === activeId)) {
      return activeId;
    }
  } catch (e) {}
  return sessions[0]?.id;
}

export function CustomerAiAssistantWidget({ enabled = true }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState(loadInitialSessions);
  const [activeSessionId, setActiveSessionId] = useState(() => loadInitialActiveId(sessions));
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();

  // Find active session or fallback to first
  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0] || createNewSession();
  const messages = activeSession.messages || [DEFAULT_GREETING];

  // Save sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {}
  }, [sessions]);

  // Save activeSessionId to localStorage
  useEffect(() => {
    try {
      if (activeSessionId) {
        localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
      }
    } catch (e) {}
  }, [activeSessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, showHistoryDrawer]);

  if (!enabled) return null;

  const handleCreateNewChat = () => {
    const newSession = createNewSession();
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setShowHistoryDrawer(false);
    setInput('');
  };

  const handleSelectSession = (sessionId) => {
    setActiveSessionId(sessionId);
    setShowHistoryDrawer(false);
  };

  const handleDeleteSession = (e, sessionId) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== sessionId);
    if (updated.length === 0) {
      const fresh = createNewSession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
    } else {
      setSessions(updated);
      if (activeSessionId === sessionId) {
        setActiveSessionId(updated[0].id);
      }
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setInput('');

    // Determine updated title if still default
    const isFirstUserMessage = !activeSession.messages.some(m => m.role === 'user');
    const newTitle = (isFirstUserMessage || activeSession.title === 'Đoạn chat mới')
      ? (userMessage.length > 28 ? userMessage.substring(0, 28) + '...' : userMessage)
      : activeSession.title;

    const updatedMessagesWithUser = [...messages, { role: 'user', content: userMessage }];

    // Immediately update session in state and localStorage
    setSessions(prev => prev.map(s => {
      if (s.id === activeSession.id) {
        return {
          ...s,
          title: newTitle,
          updatedAt: Date.now(),
          messages: updatedMessagesWithUser
        };
      }
      return s;
    }));
    setIsTyping(true);

    try {
      const apiHistory = messages.length === 1 && messages[0].role === 'assistant'
        ? []
        : messages.map(m => ({ role: m.role, content: m.content }));

      const response = await sendChatMessage(userMessage, apiHistory);

      setSessions(prev => prev.map(s => {
        if (s.id === activeSession.id) {
          return {
            ...s,
            updatedAt: Date.now(),
            messages: [...updatedMessagesWithUser, { role: 'assistant', content: response.content }]
          };
        }
        return s;
      }));
    } catch (error) {
      setSessions(prev => prev.map(s => {
        if (s.id === activeSession.id) {
          return {
            ...s,
            messages: [...updatedMessagesWithUser, { role: 'assistant', content: 'Xin lỗi, tôi đang gặp sự cố kết nối. Vui lòng thử lại sau.' }]
          };
        }
        return s;
      }));
    } finally {
      setIsTyping(false);
    }
  };

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
        className={`fixed bottom-6 right-6 z-50 flex h-[600px] w-[400px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#090f1f] shadow-[0_20px_50px_rgba(0,0,0,0.85)] transition-all duration-300 ${
          isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-10 opacity-0'
        }`}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-slate-800 bg-[#0d162e] px-3 py-3 z-10">
          <div className="flex items-center gap-1.5">
            {/* 3-bar hamburger icon for chat history */}
            <button
              onClick={() => setShowHistoryDrawer(prev => !prev)}
              className={`grid size-8 place-items-center rounded-lg transition-colors ${
                showHistoryDrawer ? 'bg-primary/20 text-primary' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
              title="Lịch sử đoạn chat"
            >
              <Menu className="size-5" />
            </button>

            {/* Plus icon to create new chat */}
            <button
              onClick={handleCreateNewChat}
              className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              title="Tạo đoạn chat mới"
            >
              <Plus className="size-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-full bg-primary/20 text-primary">
              <Bot className="size-5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-white leading-tight">EventHub AI</h3>
              <p className="text-[11px] text-primary leading-tight max-w-[140px] truncate">
                {activeSession.title && activeSession.title !== 'Đoạn chat mới' ? activeSession.title : 'Trợ lý hỗ trợ sự kiện & vé'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* History Drawer Overlay */}
        <div
          className={`absolute inset-0 z-20 flex flex-col bg-[#090f1f] transition-all duration-300 ${
            showHistoryDrawer ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'
          }`}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-[#0d162e]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistoryDrawer(false)}
                className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                title="Quay lại"
              >
                <ChevronLeft className="size-5" />
              </button>
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Clock className="size-4 text-primary" />
                Lịch sử trò chuyện
              </h4>
            </div>

            <button
              onClick={handleCreateNewChat}
              className="flex items-center gap-1 rounded-lg bg-primary/20 border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/30 transition-colors"
            >
              <Plus className="size-3.5" />
              <span>Mới</span>
            </button>
          </div>

          {/* Drawer Session List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#090f1f] scrollbar-thin scrollbar-thumb-slate-700">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const formattedTime = new Date(session.updatedAt || session.createdAt).toLocaleDateString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit'
              });

              return (
                <div
                  key={session.id}
                  onClick={() => handleSelectSession(session.id)}
                  className={`group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-primary/20 border border-primary/50 text-white font-medium shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                      : 'border border-slate-800 bg-[#121c38] text-slate-300 hover:bg-[#18254b] hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <MessageSquare className={`size-4 shrink-0 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-white font-medium">{session.title || 'Đoạn chat mới'}</p>
                      <p className="text-[10px] text-slate-400">{formattedTime}</p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    className="grid size-6 shrink-0 place-items-center rounded text-slate-400 opacity-60 hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 transition-all"
                    title="Xóa đoạn chat này"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#090f1f] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700 hover:scrollbar-thumb-primary/50">
          <div className="flex flex-col gap-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex max-w-[88%] items-end gap-2 ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
              >
                <div className={`grid size-7 shrink-0 place-items-center rounded-full ${msg.role === 'user' ? 'bg-primary text-[#081126]' : 'bg-[#152042] border border-slate-700 text-primary'}`}>
                  {msg.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
                </div>
                <div
                  className={`rounded-2xl px-4 py-2.5 shadow-md ${
                    msg.role === 'user'
                      ? 'bg-primary text-[#081126] font-medium rounded-br-sm'
                      : 'bg-[#131d38] border border-slate-700/80 text-slate-100 rounded-bl-sm prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/30'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                  ) : (
                    <ActionMessage content={msg.content} navigate={navigate} />
                  )}
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex max-w-[85%] self-start items-end gap-2">
                <div className="grid size-7 shrink-0 place-items-center rounded-full bg-[#152042] border border-slate-700 text-primary">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl rounded-bl-sm bg-[#131d38] border border-slate-700/80 px-4 py-3 shadow-md">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '0ms' }} />
                    <span className="size-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '150ms' }} />
                    <span className="size-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Form */}
        <div className="border-t border-slate-800 bg-[#0d162e] p-3">
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <div className="relative flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Hỏi về sự kiện, giá vé..."
                className="w-full resize-none rounded-xl border border-slate-700 bg-[#131d38] py-3 pl-4 pr-3 text-sm text-slate-100 placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary focus:bg-[#162244]"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '120px' }}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-[#081126] font-bold transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Send className="size-5" />
            </button>
          </form>
          <div className="mt-2 text-center text-[11px] text-slate-400">
            AI có thể mắc lỗi. Vui lòng kiểm tra lại thông tin quan trọng.
          </div>
        </div>
      </div>
    </>
  );
}
