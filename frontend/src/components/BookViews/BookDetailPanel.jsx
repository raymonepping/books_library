import { useState, useEffect, useRef } from 'react'
import { X, Star, BookOpen, BookMarked, BookCheck, BookX, Trash2, Pencil, Loader2, Check, ImagePlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Badge from '../ui/Badge.jsx'
import { booksApi } from '../../api/books.js'
import { seriesApi } from '../../api/series.js'
import { useLibraryStore } from '../../store/useLibraryStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import { coverPlaceholder } from '../../utils/coverPlaceholder.js'
import { authorNames } from '../../utils/authors.js'
import { useFocusTrap } from '../../hooks/useFocusTrap.js'
import { useScrollLock } from '../../hooks/useScrollLock.js'

const STATUS_ACTIONS = [
  { status: 'read',           icon: BookCheck,  label: 'Read'         },
  { status: 'reading',        icon: BookOpen,   label: 'Reading'      },
  { status: 'want-to-read',   icon: BookMarked, label: 'Want to read' },
  { status: 'did-not-finish', icon: BookX,      label: 'DNF'          },
]

export default function BookDetailPanel({ book, onClose, onBookSelect, onFetchCover }) {
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving]     = useState(false)
  const panelRef = useRef(null)

  const upsertBook    = useLibraryStore(s => s.upsertBook)
  const scheduleDelete = useLibraryStore(s => s.scheduleDelete)
  const undoDelete    = useLibraryStore(s => s.undoDelete)
  const addToast      = useUIStore(s => s.addToast)

  // Always use the live version from the store so status/rating updates reflect immediately.
  // Falls back to the prop for similar-book navigation (books not in the current filtered list).
  const liveBook = useLibraryStore(s => s.books.find(b => b.id === book?.id)) ?? book

  useFocusTrap(panelRef, !!book)
  useScrollLock(!!book)

  // Reset edit mode when selected book changes
  useEffect(() => { setEditMode(false) }, [liveBook?.id])

  // Escape key closes
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  if (!liveBook) return null

  const { bg, fg, initials } = coverPlaceholder(liveBook)

  async function setStatus(status) {
    if (saving || liveBook.readStatus === status) return
    setSaving(true)
    try {
      const updated = await booksApi.updateStatus(liveBook.id, { readStatus: status })
      upsertBook({ ...liveBook, ...updated })
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function setRating(rating) {
    if (saving) return
    setSaving(true)
    try {
      const updated = await booksApi.updateStatus(liveBook.id, { rating })
      upsertBook({ ...liveBook, ...updated })
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleDelete() {
    const deletedTitle = liveBook.title
    scheduleDelete(liveBook)
    onClose()
    addToast(`"${deletedTitle}" removed`, 'info', {
      label: 'Undo',
      onClick: () => undoDelete(),
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-noir/60 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel — bottom sheet on mobile, right sidebar on md+, wider two-column on lg+ */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={editMode ? 'Edit book' : 'Book details'}
        className={[
          // Mobile: slide-up sheet from bottom
          'fixed inset-x-0 bottom-0 z-40 max-h-[92dvh] rounded-t-2xl overflow-y-auto flex flex-col',
          'bg-smoke border-t border-smoke-light shadow-2xl',
          // md+: right-side panel
          'md:inset-x-auto md:right-0 md:inset-y-0 md:max-h-none md:h-full md:w-96 md:rounded-none md:border-t-0 md:border-l',
          // lg+: wider with room for two-column layout
          'lg:w-[500px]',
        ].join(' ')}
      >
        {/* Drag handle — mobile only */}
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-smoke-light" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-smoke-light shrink-0">
          <span className="text-ice/40 text-xs uppercase tracking-widest">
            {editMode ? 'Edit book' : 'Book details'}
          </span>
          <div className="flex items-center gap-2">
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                title="Edit book"
                className="text-ice/40 hover:text-amber transition-colors cursor-pointer p-1"
              >
                <Pencil size={15} />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close panel"
              className="text-ice/40 hover:text-ice transition-colors cursor-pointer p-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {editMode ? (
          <EditForm
            book={liveBook}
            bg={bg} fg={fg} initials={initials}
            onSave={async (data) => {
              setSaving(true)
              try {
                const updated = await booksApi.update(liveBook.id, data)
                upsertBook({ ...liveBook, ...updated })
                addToast('Book updated', 'success')
                setEditMode(false)
              } catch (err) {
                addToast(err.message, 'error')
              } finally {
                setSaving(false)
              }
            }}
            onCancel={() => setEditMode(false)}
            saving={saving}
          />
        ) : (
          <ViewPanel
            book={liveBook}
            bg={bg} fg={fg} initials={initials}
            saving={saving}
            onStatus={setStatus}
            onRating={setRating}
            onDelete={handleDelete}
            onClose={onClose}
            onBookSelect={onBookSelect}
            onFetchCover={onFetchCover}
          />
        )}
      </aside>
    </>
  )
}

/* ── View mode ───────────────────────────────────────────────────────────────── */

function ViewPanel({ book, bg, fg, initials, saving, onStatus, onRating, onDelete, onClose, onBookSelect, onFetchCover }) {
  const [imgError, setImgError] = useState(false)
  const [fetchingCover, setFetchingCover] = useState(false)
  const showCover = book.coverUrl && !imgError
  const navigate  = useNavigate()

  async function handleFetchCover() {
    if (fetchingCover || !onFetchCover) return
    setFetchingCover(true)
    try { await onFetchCover(book.id) } finally { setFetchingCover(false) }
  }

  return (
    <>
      {/* Cover band — two-column on lg+ */}
      <div className="shrink-0 border-b border-smoke-light">
        <div className="lg:flex lg:gap-5 lg:items-start px-5 py-5">
          {/* Cover */}
          <div
            className="w-24 rounded-lg overflow-hidden shadow-xl shrink-0 flex items-center justify-center mx-auto lg:mx-0 mb-4 lg:mb-0 relative group/cover"
            style={{ aspectRatio: '2/3', backgroundColor: bg }}
          >
            {showCover ? (
              <img
                src={book.coverUrl}
                alt={book.title}
                loading="lazy"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <span className="font-serif font-bold text-xl select-none" style={{ color: fg }}>
                  {initials}
                </span>
                {onFetchCover && (
                  <button
                    onClick={handleFetchCover}
                    disabled={fetchingCover}
                    title="Find cover image"
                    className="absolute inset-0 flex items-end justify-center pb-2 bg-noir/0 hover:bg-noir/40 transition-colors cursor-pointer opacity-0 group-hover/cover:opacity-100 disabled:opacity-50"
                  >
                    {fetchingCover
                      ? <Loader2 size={14} className="text-white animate-spin" />
                      : <ImagePlus size={14} className="text-white/80" />}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Meta */}
          <div className="flex-1 min-w-0 text-center lg:text-left">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-serif text-ice text-lg leading-snug flex-1">{book.title}</h2>
              <Badge status={book.readStatus} />
            </div>
            {book.subtitle && <p className="font-serif text-ice/50 text-sm italic mt-0.5">{book.subtitle}</p>}
            {book.authors?.length > 0 && (
              <p className="text-ice/60 text-sm mt-1">{authorNames(book.authors).join(', ')}</p>
            )}
            <div className="flex flex-wrap gap-x-3 text-ice/40 text-xs mt-1.5 justify-center lg:justify-start">
              {book.publishedYear && <span>{book.publishedYear}</span>}
              {book.pageCount && <span>{book.pageCount} pages</span>}
              {book.language && <span>{book.language.toUpperCase()}</span>}
            </div>
            {book.genres?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 justify-center lg:justify-start">
                {book.genres.map(g => <Badge key={g} label={g} color="steel" />)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rating */}
      <div className="px-5 py-3 border-b border-smoke-light">
        <p className="text-ice/40 text-xs uppercase tracking-widest mb-2">Rating</p>
        <div className="flex gap-1" role="group" aria-label="Rating">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => onRating(book.rating === n ? null : n)}
              disabled={saving}
              aria-label={`${n} star${n !== 1 ? 's' : ''}`}
              aria-pressed={n <= (book.rating ?? 0)}
              className="cursor-pointer transition-colors disabled:opacity-50"
            >
              <Star size={22} className={n <= (book.rating ?? 0) ? 'text-amber fill-amber' : 'text-ice/20 hover:text-ice/40'} />
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="px-5 py-3 border-b border-smoke-light">
        <p className="text-ice/40 text-xs uppercase tracking-widest mb-2">Status</p>
        <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-col">
          {STATUS_ACTIONS.map(({ status, icon: Icon, label }) => (
            <button
              key={status}
              onClick={() => onStatus(status)}
              disabled={saving}
              aria-pressed={book.readStatus === status}
              className={[
                'flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors cursor-pointer disabled:opacity-40',
                book.readStatus === status ? 'bg-smoke-light text-amber' : 'text-ice/60 hover:text-ice hover:bg-smoke-light',
              ].join(' ')}
            >
              <Icon size={14} className="shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      {book.description && (
        <div className="px-5 py-3 border-b border-smoke-light">
          <p className="text-ice/40 text-xs uppercase tracking-widest mb-2">About</p>
          <p className="text-ice/70 text-sm leading-relaxed line-clamp-6">{book.description}</p>
        </div>
      )}

      {/* Notes */}
      {book.notes && (
        <div className="px-5 py-3 border-b border-smoke-light">
          <p className="text-ice/40 text-xs uppercase tracking-widest mb-2">Notes</p>
          <p className="text-ice/70 text-sm leading-relaxed">{book.notes}</p>
        </div>
      )}

      {book.isbn && (
        <div className="px-5 pt-3">
          <p className="text-ice/20 text-xs font-mono">{book.isbn}</p>
        </div>
      )}

      {/* Similar books */}
      <SimilarBooks book={book} onBookSelect={onBookSelect} />

      {/* Delete — no confirm, just instant with undo toast */}
      <div className="px-5 pb-6 pt-2">
        <button
          onClick={onDelete}
          disabled={saving}
          className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm transition-colors cursor-pointer disabled:opacity-40 text-blood/60 hover:text-blood hover:bg-blood/10 border border-transparent hover:border-blood/20"
        >
          <Trash2 size={14} className="shrink-0" />
          Remove from library
        </button>
        <p className="text-ice/20 text-[11px] mt-1 text-center">You can undo this for 5 seconds</p>
      </div>
    </>
  )
}

/* ── Similar books ───────────────────────────────────────────────────────────── */

function MiniCover({ book }) {
  const { bg, fg, initials } = coverPlaceholder(book)
  const [imgError, setImgError] = useState(false)
  const showCover = book.coverUrl && !imgError
  return (
    <div
      className="w-7 shrink-0 rounded overflow-hidden shadow flex items-center justify-center"
      style={{ height: 42, backgroundColor: bg }}
    >
      {showCover ? (
        <img src={book.coverUrl} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
      ) : (
        <span className="font-serif font-bold text-[9px] select-none" style={{ color: fg }}>{initials}</span>
      )}
    </div>
  )
}

function SimilarBooks({ book, onBookSelect }) {
  const [recs, setRecs]     = useState(null)
  const [failed, setFailed] = useState(false)
  const prevIdRef = useRef(null)
  const navigate  = useNavigate()

  useEffect(() => {
    let cancelled = false
    const isNewBook = prevIdRef.current !== book.id
    prevIdRef.current = book.id

    if (isNewBook) {
      // Switching to a different book — show spinner immediately
      setRecs(null)
      setFailed(false)
    }
    // For same-book updates (edit saved): keep current recs visible while waiting

    // Delay: quick for new book, longer for same-book edit so background
    // re-enrichment and FTS index update have time to settle (~10 s).
    const delay = isNewBook ? 300 : 10_000

    const t = setTimeout(async () => {
      try {
        const data = await booksApi.recommend(book.id, 5)
        if (!cancelled) {
          setRecs(data.recommendations ?? [])
          setFailed(false)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }, delay)

    return () => { cancelled = true; clearTimeout(t) }
  }, [book.id, book.updatedAt])

  async function handleSelect(rec) {
    if (onBookSelect) {
      try {
        const full = await booksApi.get(rec.id)
        onBookSelect(full)
      } catch {
        onBookSelect(rec)
      }
    }
  }

  if (failed) return null

  return (
    <div className="px-5 py-3 border-b border-smoke-light">
      <div className="flex items-center justify-between mb-2">
        <p className="text-ice/40 text-xs uppercase tracking-widest">Similar books</p>
        <button
          onClick={() => navigate('/discover', { state: { seedBook: book } })}
          className="text-ice/30 hover:text-steel text-[11px] transition-colors cursor-pointer"
        >
          Open in Discover →
        </button>
      </div>

      {recs === null ? (
        <div className="flex items-center gap-2 text-ice/30 text-xs py-1">
          <Loader2 size={12} className="animate-spin" />
          Finding similar…
        </div>
      ) : recs.length === 0 ? (
        <p className="text-ice/30 text-xs py-1">No similar books found</p>
      ) : (
        <div className="space-y-0.5">
          {recs.map(r => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="flex items-center gap-2.5 w-full text-left rounded px-2 py-1.5 hover:bg-smoke-light transition-colors group cursor-pointer"
            >
              <MiniCover book={r} />
              <div className="flex-1 min-w-0">
                <p className="text-ice/85 text-xs font-medium truncate group-hover:text-amber transition-colors">{r.title}</p>
                <p className="text-ice/40 text-[11px] truncate">{authorNames(r.authors)?.join(', ')}</p>
              </div>
              {r.matchedGenres?.length > 0 && (
                <span className="text-[10px] text-steel/60 shrink-0">{r.matchedGenres[0]}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Edit mode ───────────────────────────────────────────────────────────────── */

function EditForm({ book, bg, fg, initials, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    title:         book.title ?? '',
    subtitle:      book.subtitle ?? '',
    authors:       authorNames(book.authors).join(', '),
    genres:        (book.genres ?? []).join(', '),
    publishedYear: book.publishedYear ?? '',
    pageCount:     book.pageCount ?? '',
    language:      book.language ?? '',
    isbn:          book.isbn ?? '',
    description:   book.description ?? '',
    notes:         book.notes ?? '',
    owned:         book.owned ?? false,
    coverUrl:      book.coverUrl ?? '',
    seriesId:      book.seriesId ?? '',
    seriesOrder:   book.seriesOrder ?? '',
  })
  const [coverPreview, setCoverPreview] = useState(book.coverUrl ?? '')
  const [imgError, setImgError] = useState(false)
  const [seriesList, setSeriesList] = useState([])

  useEffect(() => {
    seriesApi.list({ limit: 100 }).then(d => setSeriesList(d.series ?? [])).catch(() => {})
  }, [])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function handleCoverChange(e) {
    set('coverUrl', e.target.value)
    const v = e.target.value.trim()
    if (!v || v.startsWith('http')) { setCoverPreview(v); setImgError(false) }
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      authors:       splitList(form.authors),
      genres:        splitList(form.genres),
      publishedYear: form.publishedYear ? parseInt(form.publishedYear) : null,
      pageCount:     form.pageCount     ? parseInt(form.pageCount)     : null,
      seriesId:      form.seriesId || null,
      seriesOrder:   form.seriesOrder   ? parseInt(form.seriesOrder)   : null,
    })
  }

  const showCoverPreview = coverPreview && !imgError

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1">
      <div className="flex-1 overflow-y-auto">

        {/* Cover */}
        <div className="px-5 py-4 border-b border-smoke-light space-y-3">
          <p className="text-ice/40 text-xs uppercase tracking-widest">Cover</p>
          <div className="flex gap-3 items-start">
            <div
              className="w-16 shrink-0 rounded overflow-hidden shadow-lg flex items-center justify-center"
              style={{ height: 96, backgroundColor: bg }}
            >
              {showCoverPreview ? (
                <img src={coverPreview} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
              ) : (
                <span className="font-serif font-bold text-sm select-none" style={{ color: fg }}>{initials}</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <textarea
                value={form.coverUrl}
                onChange={handleCoverChange}
                placeholder="https://covers.openlibrary.org/…"
                rows={3}
                className="w-full bg-smoke-dark border border-smoke-light rounded px-2.5 py-2 text-xs text-ice placeholder-ice/25 focus:outline-none focus:border-steel transition-colors resize-none font-mono"
              />
              {form.coverUrl && (
                <button type="button" onClick={() => { set('coverUrl', ''); setCoverPreview('') }}
                  className="text-blood/50 text-[11px] hover:text-blood transition-colors cursor-pointer">
                  Clear cover
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Core fields */}
        <div className="px-5 py-4 space-y-3 border-b border-smoke-light">
          <Field label="Title *">
            <TextInput value={form.title} onChange={e => set('title', e.target.value)} required />
          </Field>
          <Field label="Subtitle">
            <TextInput value={form.subtitle} onChange={e => set('subtitle', e.target.value)} />
          </Field>
          <Field label="Authors" hint="comma-separated">
            <TextInput value={form.authors} onChange={e => set('authors', e.target.value)} placeholder="Jo Nesbø" />
          </Field>
          <Field label="Genres" hint="comma-separated">
            <TextInput value={form.genres} onChange={e => set('genres', e.target.value)} placeholder="crime, nordic noir" />
          </Field>
        </div>

        {/* Publication */}
        <div className="px-5 py-4 space-y-3 border-b border-smoke-light">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year">
              <TextInput type="number" value={form.publishedYear} onChange={e => set('publishedYear', e.target.value)} placeholder="2007" min="1000" max="2100" />
            </Field>
            <Field label="Pages">
              <TextInput type="number" value={form.pageCount} onChange={e => set('pageCount', e.target.value)} placeholder="374" min="1" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language">
              <TextInput value={form.language} onChange={e => set('language', e.target.value)} placeholder="nl" />
            </Field>
            <Field label="ISBN">
              <TextInput value={form.isbn} onChange={e => set('isbn', e.target.value)} placeholder="978…" />
            </Field>
          </div>
        </div>

        {/* Description + notes */}
        <div className="px-5 py-4 space-y-3 border-b border-smoke-light">
          <Field label="Description">
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4}
              className="w-full bg-smoke-dark border border-smoke-light rounded px-3 py-2 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors resize-none" />
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Personal notes…"
              className="w-full bg-smoke-dark border border-smoke-light rounded px-3 py-2 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors resize-none" />
          </Field>
        </div>

        <div className="px-5 py-4 border-b border-smoke-light">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={form.owned} onChange={e => set('owned', e.target.checked)} className="accent-amber w-4 h-4" />
            <span className="text-ice/70 text-sm">I own this book</span>
          </label>
        </div>

        {/* Series */}
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <Field label="Series">
              <select
                value={form.seriesId}
                onChange={e => set('seriesId', e.target.value)}
                className="w-full bg-smoke-dark border border-smoke-light rounded px-3 py-2 text-sm text-ice focus:outline-none focus:border-steel transition-colors cursor-pointer"
              >
                <option value="">— none —</option>
                {seriesList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Order #">
              <TextInput
                type="number"
                value={form.seriesOrder}
                onChange={e => set('seriesOrder', e.target.value)}
                placeholder="1"
                min="1"
                disabled={!form.seriesId}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-smoke-light flex gap-2 shrink-0">
        <button type="submit" disabled={saving || !form.title.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 bg-amber text-noir text-sm font-semibold rounded py-2 hover:bg-amber/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          <Check size={14} />
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}
          className="px-4 py-2 text-sm text-ice/50 hover:text-ice border border-smoke-light rounded transition-colors cursor-pointer disabled:opacity-40">
          Cancel
        </button>
      </div>
    </form>
  )
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-ice/40 text-[10px] uppercase tracking-widest mb-1">
        {label}
        {hint && <span className="normal-case tracking-normal ml-1 text-ice/25">({hint})</span>}
      </label>
      {children}
    </div>
  )
}

function TextInput({ className = '', ...props }) {
  return (
    <input
      className={[
        'w-full bg-smoke-dark border border-smoke-light rounded px-3 py-2',
        'text-sm text-ice placeholder-ice/30',
        'focus:outline-none focus:border-steel transition-colors',
        className,
      ].join(' ')}
      {...props}
    />
  )
}

function splitList(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean)
}
