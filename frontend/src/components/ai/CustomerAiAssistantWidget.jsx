import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Loader2, Bot, User, Sparkles, Menu, Plus, Trash2, Clock, ChevronLeft, Mic, Square } from 'lucide-react'
import { sendChatMessage, getAiChatSessions, saveAiChatSession, syncAiChatSessions, deleteAiChatSession } from '@/services/aiAssistant.js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate, Link } from 'react-router-dom'
import { fetchEventDetail } from '@/services/events.js'
import { getProfile } from '@/services/user.service.js'
import { isAuthenticated, getStoredUser, getStoredUserKey } from '@/lib/auth.js'

function ActionMessage({ content, navigate, setInput }) {
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


  const handleProposalConfirm = async (proposal) => {
    if (!proposal) return;
    try {
      const attendees = {};
      let runningSlotsLength = 0;
      const attendeeList = proposal.attendees || [];
      const totalQuantity = proposal.quantity || 1;

      (proposal.items || []).forEach(item => {
        for (let i = 0; i < item.quantity; i++) {
          const slotId = `${item.ticketType?.id || item.ticket_type_id}-${i}-${runningSlotsLength}`;
          const slotAttendee = attendeeList[runningSlotsLength] || {};
          attendees[slotId] = {
            name: slotAttendee.name || (!proposal.requireAttendeeInfo ? proposal.buyer?.name : ''),
            email: slotAttendee.email || (!proposal.requireAttendeeInfo ? proposal.buyer?.email : '')
          };
          runningSlotsLength++;
        }
      });

      let eventDetail = null;
      try {
        eventDetail = await fetchEventDetail(proposal.eventSlug || proposal.eventId);
      } catch {}

      const cart = {
        eventId: proposal.eventId,
        eventTitle: proposal.eventTitle,
        eventSlug: proposal.eventSlug,
        eventStartTime: proposal.eventStartTime,
        eventEndTime: proposal.eventEndTime,
        venueSummary: proposal.venueSummary,
        selectedSession: proposal.session,
        availableTicketTypes: eventDetail?.ticket_types || [],
        seatingRules: proposal.rulesApplied || eventDetail?.seating_rules || {},
        additionalTerms: eventDetail?.additional_terms || '',
        refundPolicy: eventDetail?.refund_policy || null,
        requireAttendeeInfo: Boolean(proposal.requireAttendeeInfo),
        buyer: proposal.buyer || {},
        attendees,
        prefilledAttendees: Array.from({ length: totalQuantity }, (_, idx) => ({
          name: attendeeList[idx]?.name || '',
          email: attendeeList[idx]?.email || ''
        })),
        selectedSeatIds: proposal.selectedSeatIds || [],
        items: proposal.items || [],
        holdExpiresAt: proposal.holdExpiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        hold_expires_at: proposal.holdExpiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        hasSeatMap: proposal.hasSeatMap
      };

      try {
        window.sessionStorage.setItem('eventhub-booking-draft', JSON.stringify(cart));
      } catch (e) {
        console.warn('Could not save draft to sessionStorage', e);
      }

      if (proposal.requireAttendeeInfo && !proposal.isAttendeesComplete) {
        navigate('/booking/attendees', { state: { cart } });
      } else {
        navigate('/booking/review', { state: { cart } });
      }
    } catch (err) {
      console.error('Error confirming proposal:', err);
    }
  };

  const handleProposalManualSeat = async (proposal) => {
    if (!proposal) return;
    try {
      let eventDetail = null;
      try {
        eventDetail = await fetchEventDetail(proposal.eventSlug || proposal.eventId);
      } catch {}

      const cart = {
        eventId: proposal.eventId,
        eventTitle: proposal.eventTitle,
        eventSlug: proposal.eventSlug,
        eventStartTime: proposal.eventStartTime,
        eventEndTime: proposal.eventEndTime,
        venueSummary: proposal.venueSummary,
        selectedSession: proposal.session,
        availableTicketTypes: eventDetail?.ticket_types || [],
        seatingRules: proposal.rulesApplied || eventDetail?.seating_rules || {},
        additionalTerms: eventDetail?.additional_terms || '',
        requireAttendeeInfo: Boolean(proposal.requireAttendeeInfo),
        buyer: proposal.buyer || {},
        selectedSeatIds: proposal.selectedSeatIds || [],
        items: proposal.items || [],
        hasSeatMap: true
      };

      try {
        window.sessionStorage.setItem('eventhub-booking-draft', JSON.stringify(cart));
      } catch (e) {}

      navigate('/booking/seats', { state: { cart } });
    } catch (err) {
      console.error('Error opening manual seat map:', err);
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

        if (part.action === 'BOOKING_PROPOSAL') {
          let proposal = null;
          try {
            proposal = JSON.parse(decodeURIComponent(part.args[0] || ''));
          } catch (e) {
            console.error('Could not parse BOOKING_PROPOSAL payload', e);
          }

          if (!proposal) return null;

          const seatsList = proposal.seats || [];
          const hasSeatList = seatsList.length > 0;
          const attendeeCount = (proposal.attendees || []).length;
          const isComplete = proposal.isAttendeesComplete;

          return (
            <div key={i} className="mt-3 overflow-hidden rounded-2xl border border-cyan-500/40 bg-gradient-to-b from-[#0b2038] via-[#091728] to-[#06101c] p-4 text-white shadow-xl backdrop-blur-md transition-all">
              {/* Header Badge */}
              <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                    Đề xuất đặt vé thông minh
                  </span>
                </div>
                <span className="text-[11px] font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/30">
                  {proposal.hasSeatMap ? 'Tạm giữ chỗ' : 'Sẵn sàng đặt'}
                </span>
              </div>

              {/* Event & Session Details */}
              <div className="mt-3 space-y-2 text-xs">
                <div className="font-bold text-sm text-white line-clamp-1">{proposal.eventTitle}</div>
                {proposal.session?.name && (
                  <div className="text-slate-300 flex items-center gap-1.5">
                    <span>🎭 {proposal.session.name}</span>
                    {proposal.session.start_time && (
                      <span className="text-slate-400">({new Date(proposal.session.start_time).toLocaleDateString('vi-VN')})</span>
                    )}
                  </div>
                )}
                {proposal.venueSummary && (
                  <div className="text-slate-400 line-clamp-1">📍 {proposal.venueSummary}</div>
                )}

                {/* Seat Badges or Ticket Types */}
                <div className="pt-1.5">
                  <div className="text-[11px] text-slate-400 mb-1">
                    {proposal.hasSeatMap ? 'Vị trí ghế đề xuất:' : 'Hạng vé:'}
                  </div>
                  {hasSeatList ? (
                    <div className="flex flex-wrap gap-1.5">
                      {seatsList.map((s, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-2.5 py-1 text-xs font-bold text-cyan-200 shadow-sm"
                        >
                          <span>🪑 {s.label}</span>
                          {s.ticketTypeName && (
                            <span className="text-[10px] text-cyan-300/80 font-normal">({s.ticketTypeName})</span>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {(proposal.items && proposal.items.length > 0) ? (
                        proposal.items.map((it, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs bg-emerald-950/40 border border-emerald-500/25 px-2.5 py-1.5 rounded-lg text-emerald-200"
                          >
                            <span className="font-semibold">🎟️ {it.quantity} vé {it.ticketType?.name || ''}</span>
                            <span className="font-bold text-emerald-300">
                              {Number((it.ticketType?.price || 0) * (it.quantity || 1)).toLocaleString('vi-VN')} đ
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-emerald-300 font-semibold">
                          🎟️ {proposal.quantity} vé
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Organizer note / alternative row note */}
                {proposal.note && (
                  <div className="rounded-lg bg-blue-950/60 border border-blue-500/30 p-2 text-[11px] text-blue-200">
                    ℹ️ {proposal.note}
                  </div>
                )}

                {/* Attendee Status if required */}
                {proposal.requireAttendeeInfo && (
                  <div className={`rounded-lg p-2 text-[11px] border ${
                    isComplete 
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                      : 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                  }`}>
                    {isComplete ? (
                      <div>✅ Đã đủ thông tin người tham gia ({attendeeCount}/{proposal.quantity} người)</div>
                    ) : (
                      <div>⚠️ Cần bổ sung thông tin {proposal.quantity - attendeeCount} người tham gia còn lại (nhắn Eve trong chat)</div>
                    )}
                  </div>
                )}

                {/* Total Price */}
                <div className="flex items-baseline justify-between pt-2 border-t border-slate-700/60 mt-2">
                  <span className="text-slate-400">Tổng thanh toán:</span>
                  <span className="text-base font-black text-emerald-400">
                    {Number(proposal.totalAmount || 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-3.5 space-y-2">
                <button
                  type="button"
                  onClick={() => handleProposalConfirm(proposal)}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <span>✓ Xác nhận & Đi tới Thanh toán</span>
                  <span className="transition-transform group-hover:translate-x-1">➔</span>
                </button>

                <div className="flex items-center justify-between text-[11px] px-1 text-slate-400">
                  {proposal.hasSeatMap ? (
                    <button
                      type="button"
                      onClick={() => handleProposalManualSeat(proposal)}
                      className="hover:text-cyan-300 underline transition-colors cursor-pointer"
                    >
                      🪑 Tôi muốn tự chọn trên sơ đồ
                    </button>
                  ) : <span />}
                  
                  {setInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setInput(proposal.hasSeatMap ? 'Đổi sang hàng ghế ' : 'Tôi muốn đổi sang vé ');
                      }}
                      className="hover:text-amber-300 underline transition-colors cursor-pointer"
                    >
                      {proposal.hasSeatMap ? '✏️ Đổi hàng ghế khác' : '✏️ Đổi loại vé / số lượng'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
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

const SESSIONS_STORAGE_KEY_PREFIX = 'eventhub_ai_chat_sessions_';
const ACTIVE_SESSION_STORAGE_KEY_PREFIX = 'eventhub_ai_active_session_id_';

function getSessionsStorageKey(userKey) {
  return userKey ? `${SESSIONS_STORAGE_KEY_PREFIX}${userKey}` : null;
}

function getActiveSessionStorageKey(userKey) {
  return userKey ? `${ACTIVE_SESSION_STORAGE_KEY_PREFIX}${userKey}` : null;
}

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

function loadInitialSessions(userKey) {
  const storageKey = getSessionsStorageKey(userKey);
  if (!storageKey) return [createNewSession()];
  try {
    const raw = localStorage.getItem(storageKey);
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

function loadInitialActiveId(userKey, sessions) {
  const storageKey = getActiveSessionStorageKey(userKey);
  if (!storageKey) return sessions[0]?.id;
  try {
    const activeId = localStorage.getItem(storageKey);
    if (activeId && sessions.some(s => s.id === activeId)) {
      return activeId;
    }
  } catch (e) {}
  return sessions[0]?.id;
}

export function CustomerAiAssistantWidget({ enabled = true }) {
  const currentUser = getStoredUser();
  const userKey = getStoredUserKey(currentUser);

  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState(() => loadInitialSessions(userKey));
  const [activeSessionId, setActiveSessionId] = useState(() => loadInitialActiveId(userKey, sessions));
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState(null);
  const [isPendingAutoSend, setIsPendingAutoSend] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  const isTypingRef = useRef(false);
  const recognitionRef = useRef(null);
  const initialInputRef = useRef('');
  const silenceTimerRef = useRef(null);
  const latestFullTextRef = useRef('');
  const handleSendMessageRef = useRef(null);
  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);

  // Synchronize isTypingRef with isTyping state
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  // Speech Recognition support check
  const isSpeechSupported = typeof window !== 'undefined' && Boolean(
    window.SpeechRecognition || window.webkitSpeechRecognition
  );

  // Auto-resize textarea to fit text fluidly without scrollbar flicker
  useEffect(() => {
    if (textareaRef.current) {
      if (!input.trim()) {
        textareaRef.current.style.height = '44px';
        textareaRef.current.style.overflowY = 'hidden';
      } else {
        textareaRef.current.style.height = 'auto';
        const scrollH = textareaRef.current.scrollHeight;
        const newHeight = Math.min(Math.max(scrollH, 44), 120);
        textareaRef.current.style.height = `${newHeight}px`;
        textareaRef.current.style.overflowY = scrollH > 120 ? 'auto' : 'hidden';
      }
    }
  }, [input]);

  const startRecording = () => {
    if (isTypingRef.current || isTyping) {
      return;
    }

    if (!isSpeechSupported) {
      setSpeechError('Trình duyệt hiện tại chưa hỗ trợ nhận diện giọng nói (khuyên dùng Chrome hoặc Edge).');
      return;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsPendingAutoSend(false);

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      const baseText = input ? input.trim() + ' ' : '';
      initialInputRef.current = baseText;
      latestFullTextRef.current = baseText;

      recognition.onstart = () => {
        setIsRecording(true);
        setSpeechError(null);
        textareaRef.current?.focus();
      };

      recognition.onresult = (event) => {
        // Nếu đã dừng ghi âm hoặc AI đang bận xử lý, tuyệt đối bỏ qua sự kiện trễ
        if (!recognitionRef.current || isTypingRef.current) {
          return;
        }

        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0].transcript;
          if (res.isFinal) {
            finalTranscript += text + ' ';
          } else {
            interimTranscript += text;
          }
        }

        const transcribed = (finalTranscript + interimTranscript).trim();
        if (transcribed) {
          if (!recognitionRef.current || isTypingRef.current) {
            return;
          }

          const fullText = initialInputRef.current ? `${initialInputRef.current}${transcribed}` : transcribed;

          // Cập nhật DOM trực tiếp không có độ trễ (Zero-delay synchronous update)
          if (textareaRef.current) {
            textareaRef.current.value = fullText;
            textareaRef.current.style.height = 'auto';
            const scrollH = textareaRef.current.scrollHeight;
            const newHeight = Math.min(Math.max(scrollH, 44), 120);
            textareaRef.current.style.height = `${newHeight}px`;
            textareaRef.current.style.overflowY = scrollH > 120 ? 'auto' : 'hidden';
            textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
            try {
              textareaRef.current.setSelectionRange(fullText.length, fullText.length);
            } catch (e) {}
          }

          setInput(fullText);
          latestFullTextRef.current = fullText;

          // Xóa timer trước đó nếu người dùng đang tiếp tục nói
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          setIsPendingAutoSend(true);

          // Tự động kích hoạt gửi sau 2 giây ngừng nói
          silenceTimerRef.current = setTimeout(() => {
            setIsPendingAutoSend(false);
            silenceTimerRef.current = null;
            if (isTypingRef.current) return;
            const textToSend = latestFullTextRef.current.trim();
            if (textToSend) {
              stopRecording();
              if (handleSendMessageRef.current) {
                handleSendMessageRef.current(textToSend);
              }
            }
          }, 2000);
        }
      };

      recognition.onerror = (event) => {
        console.warn('[SpeechRecognition] error:', event.error);
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        setIsPendingAutoSend(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setSpeechError('Vui lòng cấp quyền micro cho trình duyệt để sử dụng nhận diện giọng nói.');
        } else if (event.error === 'network') {
          setSpeechError('Lỗi kết nối dịch vụ giọng nói. Vui lòng thử lại!');
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        if (!silenceTimerRef.current) {
          setIsRecording(false);
          setIsPendingAutoSend(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsRecording(false);
      setIsPendingAutoSend(false);
    }
  };

  const stopRecording = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setIsPendingAutoSend(false);
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.onstart = null;
        rec.abort();
      } catch (e) {
        try {
          rec.stop();
        } catch (err) {}
      }
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isTypingRef.current || isTyping) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const stopAiGeneration = () => {
    stopRecording();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isTypingRef.current = false;
    setIsTyping(false);

    // Xóa sạch dữ liệu ô nhập và bộ đệm để tránh gửi dư âm sau khi bấm dừng
    setInput('');
    latestFullTextRef.current = '';
    initialInputRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = '44px';
      textareaRef.current.style.overflowY = 'hidden';
    }
  };

  useEffect(() => {
    return () => {
      stopRecording();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Find active session or fallback to first
  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0] || createNewSession();
  const messages = activeSession.messages || [DEFAULT_GREETING];

  // Clean up legacy un-scoped storage keys once
  useEffect(() => {
    try {
      localStorage.removeItem('eventhub_ai_chat_sessions');
      localStorage.removeItem('eventhub_ai_active_session_id');
    } catch (e) {}
  }, []);

  // When userKey changes (e.g. account switch), reload sessions for that specific user and sync with Database
  useEffect(() => {
    if (!userKey || !isAuthenticated()) {
      setSessions([createNewSession()]);
      setActiveSessionId(null);
      return;
    }

    // 1. Initial instant load from localStorage cache
    const cachedSessions = loadInitialSessions(userKey);
    setSessions(cachedSessions);
    setActiveSessionId(loadInitialActiveId(userKey, cachedSessions));

    // 2. Fetch remote sessions from PostgreSQL database
    let isMounted = true;
    getAiChatSessions()
      .then(async (dbSessions) => {
        if (!isMounted) return;
        const safeDbSessions = Array.isArray(dbSessions) ? dbSessions : [];
        const dbSessionIds = new Set(safeDbSessions.map((s) => s.id));

        // Find any local cached sessions that are not in the DB yet
        const unsyncedLocal = cachedSessions.filter(
          (local) => !dbSessionIds.has(local.id) && Array.isArray(local.messages) && local.messages.length > 1,
        );

        if (unsyncedLocal.length > 0) {
          try {
            const syncedSessions = await syncAiChatSessions(unsyncedLocal);
            if (isMounted && Array.isArray(syncedSessions) && syncedSessions.length > 0) {
              setSessions(syncedSessions);
              setActiveSessionId((prev) => (prev && syncedSessions.some((s) => s.id === prev) ? prev : syncedSessions[0]?.id));
              const storageKey = getSessionsStorageKey(userKey);
              if (storageKey) {
                try {
                  localStorage.setItem(storageKey, JSON.stringify(syncedSessions));
                } catch (e) {}
              }
              return;
            }
          } catch (e) {
            console.warn('[CustomerAiAssistantWidget] Auto-sync local sessions to DB warning:', e);
          }
        }

        if (safeDbSessions.length > 0) {
          setSessions(safeDbSessions);
          setActiveSessionId((prev) => {
            if (prev && safeDbSessions.some((s) => s.id === prev)) return prev;
            return safeDbSessions[0]?.id || null;
          });
          const storageKey = getSessionsStorageKey(userKey);
          if (storageKey) {
            try {
              localStorage.setItem(storageKey, JSON.stringify(safeDbSessions));
            } catch (e) {}
          }
        } else if (cachedSessions.length > 0 && cachedSessions.some((s) => s.messages?.length > 1)) {
          // If DB is completely empty for this user, push all cached sessions to DB
          syncAiChatSessions(cachedSessions).catch(() => {});
        }
      })
      .catch((err) => {
        console.warn('[CustomerAiAssistantWidget] Failed to sync sessions from DB:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [userKey]);

  // Save sessions to user-scoped localStorage
  useEffect(() => {
    const storageKey = getSessionsStorageKey(userKey);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessions));
    } catch (e) {}
  }, [sessions, userKey]);

  // Save activeSessionId to user-scoped localStorage
  useEffect(() => {
    const storageKey = getActiveSessionStorageKey(userKey);
    if (!storageKey || !activeSessionId) return;
    try {
      localStorage.setItem(storageKey, activeSessionId);
    } catch (e) {}
  }, [activeSessionId, userKey]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, showHistoryDrawer]);

  if (!enabled || !isAuthenticated()) return null;

  const handleCreateNewChat = () => {
    const newSession = createNewSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setShowHistoryDrawer(false);
    setInput('');
    saveAiChatSession(newSession).catch(() => {});
  };

  const handleSelectSession = (sessionId) => {
    setActiveSessionId(sessionId);
    setShowHistoryDrawer(false);
  };

  const handleDeleteSession = (e, sessionId) => {
    e.stopPropagation();
    deleteAiChatSession(sessionId).catch(() => {});
    const updated = sessions.filter((s) => s.id !== sessionId);
    if (updated.length === 0) {
      const fresh = createNewSession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      saveAiChatSession(fresh).catch(() => {});
    } else {
      setSessions(updated);
      if (activeSessionId === sessionId) {
        setActiveSessionId(updated[0].id);
      }
    }
  };

  const handleSendMessage = async (textOverride) => {
    stopRecording();

    if (isTypingRef.current || isTyping) return;

    const userMessage = typeof textOverride === 'string' 
      ? textOverride.trim() 
      : (input.trim() || latestFullTextRef.current.trim());

    if (!userMessage) return;

    // Xóa triệt để và đồng bộ nội dung nhập trên cả React state, refs và DOM textarea
    setInput('');
    latestFullTextRef.current = '';
    initialInputRef.current = '';
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = '44px';
      textareaRef.current.style.overflowY = 'hidden';
    }

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
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    isTypingRef.current = true;
    setIsTyping(true);

    try {
      const apiHistory = messages.length === 1 && messages[0].role === 'assistant'
        ? []
        : messages.map(m => ({ role: m.role, content: m.content }));

      const response = await sendChatMessage(
        userMessage,
        apiHistory,
        { signal: abortController.signal },
        { sessionId: activeSession.id, title: newTitle }
      );

      const assistantText = response?.content || 'Eve đã tiếp nhận thông tin của bạn!';

      setSessions(prev => prev.map(s => {
        if (s.id === activeSession.id) {
          return {
            ...s,
            updatedAt: Date.now(),
            messages: [...updatedMessagesWithUser, { role: 'assistant', content: assistantText }]
          };
        }
        return s;
      }));
    } catch (error) {
      const isCanceled = error?.name === 'CanceledError' || 
                         error?.code === 'ERR_CANCELED' || 
                         error?.message === 'canceled' ||
                         abortController.signal.aborted;

      if (isCanceled) {
        const stoppedMessages = [...updatedMessagesWithUser, { role: 'assistant', content: '_⏹️ Đã dừng phản hồi theo yêu cầu của bạn._' }];
        saveAiChatSession({
          id: activeSession.id,
          title: newTitle,
          messages: stoppedMessages,
          updatedAt: Date.now()
        }).catch(() => {});

        setSessions(prev => prev.map(s => {
          if (s.id === activeSession.id) {
            return {
              ...s,
              updatedAt: Date.now(),
              messages: stoppedMessages
            };
          }
          return s;
        }));
        return;
      }

      const serverMessage = error?.response?.data?.message || error?.response?.data?.error;
      const fallbackMsg = serverMessage && !serverMessage.toLowerCase().includes('network error')
        ? `Dạ hệ thống thông báo: ${serverMessage}. Bạn vui lòng thử lại nhé! 🥺`
        : 'Xin lỗi, kết nối mạng tạm thời bị gián đoạn. Bạn vui lòng kiểm tra kết nối internet và thử lại nhé! 🔄';

      setSessions(prev => prev.map(s => {
        if (s.id === activeSession.id) {
          return {
            ...s,
            messages: [...updatedMessagesWithUser, { role: 'assistant', content: fallbackMsg }]
          };
        }
        return s;
      }));
    } finally {
      isTypingRef.current = false;
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  handleSendMessageRef.current = handleSendMessage;

  const handleSend = (e) => {
    e?.preventDefault();
    if (isTypingRef.current || isTyping) return;
    handleSendMessage();
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
                    <ActionMessage content={msg.content} navigate={navigate} setInput={setInput} />
                  )}
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex max-w-[85%] self-start items-end gap-2 animate-in fade-in">
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
          {/* Speech Recognition Error Alert */}
          {speechError && (
            <div className="mb-2.5 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-950/70 px-3 py-2 text-xs text-amber-200 animate-in fade-in">
              <div className="flex items-center gap-1.5">
                <span>⚠️</span>
                <span>{speechError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSpeechError(null)}
                className="text-amber-400 hover:text-white ml-2 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className="flex items-center gap-2">
            {/* Mic / Voice Recording Button */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isTyping}
              className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-all ${
                isTyping
                  ? 'border border-slate-800 bg-[#10172d] text-slate-600 opacity-40 cursor-not-allowed'
                  : isRecording
                    ? isPendingAutoSend
                      ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-pulse cursor-pointer'
                      : 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse cursor-pointer'
                    : 'border border-slate-700 bg-[#131d38] text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 hover:bg-[#18254b] cursor-pointer'
              }`}
              title={isTyping ? 'Đang đợi AI trả lời...' : isRecording ? 'Dừng thu âm' : 'Nhập bằng giọng nói (Tiếng Việt)'}
            >
              {isRecording ? <Square className="size-4 fill-white" /> : <Mic className="size-5" />}
              {isRecording && !isTyping && (
                <span className={`absolute -inset-1 rounded-xl animate-ping -z-10 ${
                  isPendingAutoSend ? 'bg-amber-500/30' : 'bg-rose-500/30'
                }`} />
              )}
            </button>

            <div className="relative flex-1 flex items-center">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  latestFullTextRef.current = e.target.value;
                  if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                    silenceTimerRef.current = null;
                    setIsPendingAutoSend(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!isTyping && !isTypingRef.current) {
                      handleSend();
                    }
                  }
                }}
                placeholder={isRecording ? 'Đang lắng nghe... Nói vào micro...' : 'Hỏi về sự kiện, giá vé...'}
                className={`no-scrollbar w-full resize-none rounded-xl border bg-[#131d38] py-2.5 pl-3.5 pr-3 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:bg-[#162244] transition-all leading-normal ${
                  isRecording 
                    ? 'border-rose-500/60 focus:border-rose-400 focus:ring-rose-500/40 ring-1 ring-rose-500/20' 
                    : 'border-slate-700/80 hover:border-slate-600 focus:border-primary focus:ring-primary/40'
                }`}
                rows={1}
                style={{
                  height: '44px',
                  minHeight: '44px',
                  maxHeight: '120px',
                  overflowY: 'hidden',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }}
              />
            </div>
            {isTyping ? (
              <button
                type="button"
                onClick={stopAiGeneration}
                className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-500 text-white font-bold transition-all hover:bg-rose-600 active:scale-95 shadow-[0_0_15px_rgba(244,63,94,0.5)] cursor-pointer"
                title="Dừng tiến trình AI"
              >
                <Square className="size-4 fill-white" />
                <span className="absolute -inset-1 rounded-xl bg-rose-500/30 animate-ping -z-10" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-[#081126] font-bold transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:hover:brightness-100 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                title="Gửi tin nhắn"
              >
                <Send className="size-4.5 -ml-0.5" />
              </button>
            )}
          </form>
          <div className="mt-2 text-center text-[11px] text-slate-400/80">
            AI có thể mắc lỗi. Vui lòng kiểm tra lại thông tin quan trọng.
          </div>
        </div>
      </div>
    </>
  );
}
