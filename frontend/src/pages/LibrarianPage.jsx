import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, BookOpen, User, Bot, Loader2, RotateCcw, Copy, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { streamLibrarianChat } from '../api/librarian.js'

const STARTERS = {
  recommendations: [
    'Ik hou van boeken van Chris Carter. Welke vergelijkbare auteurs staan er in mijn bibliotheek?',
    'Wat moet ik lezen als ik Doodvonnis van Andreas Gruber geweldig vond?',
  ],
  authors: [
    'Vertel me meer over de schrijfstijl van Jo Nesbø.',
    'Welke boeken van Dan Brown staan er in mijn bibliotheek?',
  ],
  themes: [
    'Welke boeken in mijn bibliotheek gaan over seriemoordenaars?',
    'Welke boeken in mijn bibliotheek spelen zich af in Scandinavië?',
  ],
  unread: [
    'Welke ongelezen thrillers heb ik op mijn wishlist staan?',
    'Wat zijn mijn best beoordeelde ongelezen boeken?',
  ],
}

function SourceCard({ source }) {
  const href = source.type === 'book'
    ? `/books/${encodeURIComponent(source.id)}`
    : `/authors/${encodeURIComponent(source.id)}`
  
  return (
    <Link
      to={href}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-white/[0.06] text-ice/60 hover:text-ice hover:bg-white/10 transition-colors border border-white/5"
    >
      {source.type === 'book' ? <BookOpen size={12} /> : <User size={12} />}
      <span className="font-medium">{source.type === 'book' ? source.title : source.name}</span>
      {source.author && <span className="text-ice/40">· {source.author}</span>}
    </Link>
  )
}

function Message({ msg, onRetry, onCopy }) {
  const isUser = msg.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white
        ${isUser ? 'bg-blood/80' : 'bg-amber/20 text-amber'}`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? 'bg-blood/30 text-ice rounded-tr-sm'
            : 'bg-white/[0.06] text-ice/90 rounded-tl-sm'}`}>
          {msg.content}
        </div>

        {/* Actions & Sources */}
        {!isUser && (
          <div className="flex flex-wrap items-center gap-2 px-1">
            {msg.sources?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {msg.sources.map((s, i) => <SourceCard key={i} source={s} />)}
              </div>
            )}
            <div className="flex gap-1 ml-auto">
              {onCopy && (
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded hover:bg-white/5 text-ice/40 hover:text-ice/60 transition-colors"
                  title="Kopieer antwoord"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              )}
              {msg.error && onRetry && (
                <button
                  onClick={onRetry}
                  className="p-1.5 rounded hover:bg-white/5 text-ice/40 hover:text-ice/60 transition-colors"
                  title="Probeer opnieuw"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TypingIndicator({ status }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-8 h-8 rounded-full bg-amber/20 text-amber flex items-center justify-center">
        <Bot size={14} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/[0.06] flex items-center gap-2">
          <Loader2 size={14} className="text-ice/40 animate-spin" />
          <span className="text-xs text-ice/40">{status}</span>
        </div>
      </div>
    </div>
  )
}

export default function LibrarianPage() {
  const [messages, setMessages] = useState([{
    id: 'welcome',
    role: 'assistant',
    content: 'Hoi! Ik ben je persoonlijke bibliothecaris. Vraag me alles over je collectie — ik kan vergelijkbare boeken aanbevelen, je meer vertellen over auteurs of je helpen je volgende boek te vinden.',
  }])
  
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingStatus, setStreamingStatus] = useState('')
  const [retryMessage, setRetryMessage] = useState(null)
  
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const abortControllerRef = useRef(null)
  const messageIdCounter = useRef(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, streamingContent])

  const send = useCallback(async (text, isRetry = false) => {
    const message = (text ?? input).trim()
    if (!message || loading) return

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    setInput('')
    setStreamingContent('')
    setStreamingStatus('Zoeken in collectie...')
    
    const userMsgId = `user-${++messageIdCounter.current}`
    const assistantMsgId = `assistant-${++messageIdCounter.current}`
    
    if (!isRetry) {
      setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: message }])
    }
    
    setLoading(true)
    setRetryMessage(message)

    // Build history (exclude welcome message and current user message)
    const history = messages
      .filter(m => m.id !== 'welcome' && m.id !== userMsgId)
      .map(m => ({ role: m.role, content: m.content }))

    abortControllerRef.current = new AbortController()
    let accumulatedContent = ''
    let sources = []

    try {
      await streamLibrarianChat(
        message,
        history,
        // onToken
        (token) => {
          accumulatedContent += token
          setStreamingContent(accumulatedContent)
          setStreamingStatus('Schrijven...')
        },
        // onDone
        (receivedSources) => {
          sources = receivedSources
          setMessages(prev => [...prev, {
            id: assistantMsgId,
            role: 'assistant',
            content: accumulatedContent,
            sources,
          }])
          setStreamingContent('')
          setLoading(false)
          setRetryMessage(null)
          inputRef.current?.focus()
        },
        // onError
        (error) => {
          setMessages(prev => [...prev, {
            id: assistantMsgId,
            role: 'assistant',
            content: error.message,
            error: true,
          }])
          setStreamingContent('')
          setLoading(false)
          inputRef.current?.focus()
        },
        abortControllerRef.current.signal
      )
    } catch (err) {
      if (err.name === 'AbortError') {
        setStreamingContent('')
        setLoading(false)
        return
      }
      
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: err.message || 'Er ging iets mis. Probeer het opnieuw.',
        error: true,
      }])
      setStreamingContent('')
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, messages])

  const handleRetry = useCallback(() => {
    if (retryMessage) {
      // Remove last error message
      setMessages(prev => prev.slice(0, -1))
      send(retryMessage, true)
    }
  }, [retryMessage, send])

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const showStarters = messages.length === 1 && !loading

  return (
    <div className="flex flex-col h-full bg-[#141414]">

      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-white/[0.06]">
        <h1 className="font-serif text-ice text-xl font-semibold">Librarian</h1>
        <p className="text-ice/40 text-xs mt-0.5">Stel vragen over je boeken, auteurs, of vraag om een aanbeveling</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.map((msg) => (
          <Message
            key={msg.id}
            msg={msg}
            onRetry={msg.error ? handleRetry : null}
            onCopy={msg.role === 'assistant' && !msg.error ? true : null}
          />
        ))}
        
        {loading && streamingContent && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-amber/20 text-amber flex items-center justify-center">
              <Bot size={14} />
            </div>
            <div className="max-w-[75%] flex flex-col gap-2">
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/[0.06] text-ice/90 text-sm leading-relaxed whitespace-pre-wrap">
                {streamingContent}
                <span className="inline-block w-1 h-4 bg-amber/60 animate-pulse ml-0.5" />
              </div>
            </div>
          </div>
        )}
        
        {loading && !streamingContent && <TypingIndicator status={streamingStatus} />}
        <div ref={bottomRef} />
      </div>

      {/* Starters */}
      {showStarters && (
        <div className="px-6 pb-3 space-y-3">
          {Object.entries(STARTERS).map(([category, prompts]) => (
            <div key={category} className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-ice/30 font-medium px-1">
                {category === 'recommendations' && 'Aanbevelingen'}
                {category === 'authors' && 'Auteurs'}
                {category === 'themes' && "Thema's"}
                {category === 'unread' && 'Ongelezen'}
              </div>
              <div className="flex flex-wrap gap-2">
                {prompts.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-ice/50 hover:text-ice hover:border-white/20 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
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
            maxLength={2000}
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
        <p className="text-ice/20 text-[10px] mt-2 text-center">
          Enter to send · Shift+Enter for newline · powered by {import.meta.env.VITE_CHAT_MODEL ?? 'llama3.2:1b'}
        </p>
      </div>

    </div>
  )
}

// Made with Bob
