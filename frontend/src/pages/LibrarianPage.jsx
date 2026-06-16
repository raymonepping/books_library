import { useState, useRef, useEffect } from 'react'
import { Send, BookOpen, User, Bot, Loader2 } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

const STARTERS = [
  'Ik hou van boeken van Chris Carter. Welke vergelijkbare auteurs staan er in mijn bibliotheek?',
  'Vertel me meer over de schrijfstijl van Jo Nesbø.',
  'Welke boeken in mijn bibliotheek gaan over seriemoordenaars?',
  'Wat moet ik lezen als ik Doodvonnis van Andreas Gruber geweldig vond?',
  'Welke boeken in mijn bibliotheek spelen zich af in Scandinavië?',
]

function SourceBadge({ source }) {
  const href = source.type === 'book'
    ? `/books?highlight=${encodeURIComponent(source.id)}`
    : `/authors/${encodeURIComponent(source.id)}`
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white/[0.06] text-ice/60 hover:text-ice hover:bg-white/10 transition-colors"
    >
      {source.type === 'book' ? <BookOpen size={10} /> : <User size={10} />}
      {source.type === 'book' ? source.title : source.name}
    </a>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white
        ${isUser ? 'bg-blood/80' : 'bg-amber/20 text-amber'}`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? 'bg-blood/30 text-ice rounded-tr-sm'
            : 'bg-white/[0.06] text-ice/90 rounded-tl-sm'}`}>
          {msg.content}
        </div>
        {msg.sources?.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {msg.sources.map((s, i) => <SourceBadge key={i} source={s} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-8 h-8 rounded-full bg-amber/20 text-amber flex items-center justify-center">
        <Bot size={14} />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/[0.06]">
        <Loader2 size={14} className="text-ice/40 animate-spin" />
      </div>
    </div>
  )
}

export default function LibrarianPage() {
  const [messages, setMessages] = useState([
    {
      role:    'assistant',
      content: 'Hoi! Ik ben je persoonlijke bibliothecaris. Vraag me alles over je collectie — ik kan vergelijkbare boeken aanbevelen, je meer vertellen over auteurs of je helpen je volgende boek te vinden.',
    },
  ])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const message = (text ?? input).trim()
    if (!message || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: message }])
    setLoading(true)

    try {
      // Build history from current messages (excluding welcome message)
      const history = messages
        .filter(m => m.role === 'user' || (m.role === 'assistant' && m !== messages[0]))
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch(`${API_BASE}/librarian/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message, history }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Unknown error')

      setMessages(prev => [...prev, {
        role:    'assistant',
        content: json.data.reply,
        sources: json.data.sources ?? [],
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: `Sorry, something went wrong: ${err.message}`,
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const showStarters = messages.length === 1

  return (
    <div className="flex flex-col h-full bg-[#141414]">

      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-white/[0.06]">
        <h1 className="font-serif text-ice text-xl font-semibold">Librarian</h1>
        <p className="text-ice/40 text-xs mt-0.5">Stel vragen over je boeken, auteurs, of vraag om een aanbeveling</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Starters */}
      {showStarters && (
        <div className="px-6 pb-3 flex flex-wrap gap-2">
          {STARTERS.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-ice/50 hover:text-ice hover:border-white/20 transition-colors cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 focus-within:border-amber/40 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Stel je bibliothecaris een vraag…"
            rows={1}
            className="flex-1 bg-transparent text-ice text-sm resize-none outline-none placeholder:text-ice/25 leading-relaxed max-h-32"
            style={{ fieldSizing: 'content' }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="shrink-0 p-1.5 rounded-lg bg-amber text-[#141414] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber/90 transition-colors cursor-pointer"
          >
            <Send size={14} strokeWidth={2.5} />
          </button>
        </div>
        <p className="text-ice/20 text-[10px] mt-2 text-center">Enter to send · Shift+Enter for newline · powered by {import.meta.env.VITE_CHAT_MODEL ?? 'llama3.2'}</p>
      </div>

    </div>
  )
}
