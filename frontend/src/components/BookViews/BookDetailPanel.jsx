import { useState, useEffect } from 'react'
import { X, Star, BookOpen, BookMarked, BookCheck, BookX, Trash2, Pencil, Check } from 'lucide-react'
import Badge from '../ui/Badge.jsx'
import { booksApi } from '../../api/books.js'
import { useLibraryStore } from '../../store/useLibraryStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import { spineColor } from './spineUtils.js'
import { authorNames } from '../../utils/authors.js'

const STATUS_ACTIONS = [
  { status: 'read',           icon: BookCheck,  label: 'Read'         },
  { status: 'reading',        icon: BookOpen,   label: 'Reading'      },
  { status: 'want-to-read',   icon: BookMarked, label: 'Want to read' },
  { status: 'did-not-finish', icon: BookX,      label: 'DNF'          },
]

export default function BookDetailPanel({ book, onClose }) {
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const upsertBook = useLibraryStore(s => s.upsertBook)
  const removeBook = useLibraryStore(s => s.removeBook)
  const addToast = useUIStore(s => s.addToast)

  // Reset edit mode when the selected book changes
  useEffect(() => {
    setEditMode(false)
    setConfirmDelete(false)
  }, [book?.id])

  if (!book) return null

  const { bg, fg } = spineColor(book)

  async function setStatus(status) {
    if (saving || book.readStatus === status) return
    setSaving(true)
    try {
      const updated = await booksApi.updateStatus(book.id, { readStatus: status })
      upsertBook({ ...book, ...updated })
      addToast(`Marked as "${status}"`, 'success')
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
      const updated = await booksApi.updateStatus(book.id, { rating })
      upsertBook({ ...book, ...updated })
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setSaving(true)
    try {
      await booksApi.delete(book.id)
      removeBook(book.id)
      addToast(`"${book.title}" removed`, 'info')
      onClose()
    } catch (err) {
      addToast(err.message, 'error')
      setSaving(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-noir/60 backdrop-blur-[2px]" onClick={onClose} />

      <aside className="fixed right-0 inset-y-0 w-80 z-40 flex flex-col bg-smoke border-l border-smoke-light shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-smoke-light shrink-0">
          <span className="text-ice/40 text-xs uppercase tracking-widest">
            {editMode ? 'Edit book' : 'Book details'}
          </span>
          <div className="flex items-center gap-2">
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                title="Edit book"
                className="text-ice/40 hover:text-amber transition-colors cursor-pointer"
              >
                <Pencil size={15} />
              </button>
            )}
            <button onClick={onClose} className="text-ice/40 hover:text-ice transition-colors cursor-pointer">
              <X size={18} />
            </button>
          </div>
        </div>

        {editMode ? (
          <EditForm
            book={book}
            bg={bg}
            fg={fg}
            onSave={async (data) => {
              setSaving(true)
              try {
                const updated = await booksApi.update(book.id, data)
                upsertBook({ ...book, ...updated })
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
            book={book}
            bg={bg}
            fg={fg}
            saving={saving}
            confirmDelete={confirmDelete}
            onStatus={setStatus}
            onRating={setRating}
            onDelete={handleDelete}
            onCancelDelete={() => setConfirmDelete(false)}
          />
        )}
      </aside>
    </>
  )
}

/* ── View mode ───────────────────────────────────────────────────────────────── */

function ViewPanel({ book, bg, fg, saving, confirmDelete, onStatus, onRating, onDelete, onCancelDelete }) {
  return (
    <>
      {/* Cover */}
      <div
        className="shrink-0 flex items-end justify-start px-5 py-6 relative"
        style={{
          background: book.coverUrl ? 'transparent' : `linear-gradient(135deg, ${bg} 0%, ${bg}cc 100%)`,
          minHeight: 180,
        }}
      >
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.title} className="w-28 h-auto rounded shadow-xl object-cover" />
        ) : (
          <div
            className="w-28 rounded shadow-xl flex items-center justify-center p-3"
            style={{ height: 168, backgroundColor: bg }}
          >
            <span className="font-serif text-sm font-semibold text-center leading-tight" style={{ color: fg }}>
              {book.title}
            </span>
          </div>
        )}
        <div className="absolute top-4 right-4">
          <Badge status={book.readStatus} />
        </div>
      </div>

      {/* Meta */}
      <div className="px-5 py-4 border-b border-smoke-light space-y-1">
        <h2 className="font-serif text-ice text-lg leading-snug">{book.title}</h2>
        {book.subtitle && <p className="font-serif text-ice/50 text-sm italic">{book.subtitle}</p>}
        {book.authors?.length > 0 && (
          <p className="text-ice/60 text-sm">{authorNames(book.authors).join(', ')}</p>
        )}
        <div className="flex flex-wrap gap-x-3 text-ice/50 text-xs mt-1">
          {book.publishedYear && <span>{book.publishedYear}</span>}
          {book.pageCount && <span>{book.pageCount} pages</span>}
          {book.language && <span>{book.language.toUpperCase()}</span>}
        </div>
        {book.genres?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {book.genres.map(g => <Badge key={g} label={g} color="steel" />)}
          </div>
        )}
      </div>

      {/* Rating */}
      <div className="px-5 py-4 border-b border-smoke-light">
        <p className="text-ice/40 text-xs uppercase tracking-widest mb-2">Rating</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => onRating(book.rating === n ? null : n)} disabled={saving} className="cursor-pointer transition-colors disabled:opacity-50">
              <Star size={22} className={n <= (book.rating ?? 0) ? 'text-amber fill-amber' : 'text-ice/20'} />
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="px-5 py-4 border-b border-smoke-light">
        <p className="text-ice/40 text-xs uppercase tracking-widest mb-2">Status</p>
        <div className="flex flex-col gap-1">
          {STATUS_ACTIONS.map(({ status, icon: Icon, label }) => (
            <button
              key={status}
              onClick={() => onStatus(status)}
              disabled={saving}
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
        <div className="px-5 py-4 border-b border-smoke-light">
          <p className="text-ice/40 text-xs uppercase tracking-widest mb-2">About</p>
          <p className="text-ice/70 text-sm leading-relaxed line-clamp-6">{book.description}</p>
        </div>
      )}

      {/* Notes */}
      {book.notes && (
        <div className="px-5 py-4 border-b border-smoke-light">
          <p className="text-ice/40 text-xs uppercase tracking-widest mb-2">Notes</p>
          <p className="text-ice/70 text-sm leading-relaxed">{book.notes}</p>
        </div>
      )}

      {book.isbn && <div className="px-5 pt-3"><p className="text-ice/20 text-xs font-mono">{book.isbn}</p></div>}

      {/* Delete */}
      <div className="px-5 pb-6 mt-auto pt-4">
        <button
          onClick={onDelete}
          disabled={saving}
          className={[
            'flex items-center gap-2 w-full px-3 py-2 rounded text-sm transition-colors cursor-pointer disabled:opacity-40',
            confirmDelete
              ? 'bg-blood text-ice hover:bg-blood/80'
              : 'text-blood/60 hover:text-blood hover:bg-blood/10 border border-transparent hover:border-blood/20',
          ].join(' ')}
        >
          <Trash2 size={14} className="shrink-0" />
          {confirmDelete ? 'Confirm — remove from library' : 'Remove from library'}
        </button>
        {confirmDelete && (
          <button onClick={onCancelDelete} className="text-ice/30 text-xs mt-1 hover:text-ice/60 transition-colors cursor-pointer w-full text-center">
            Cancel
          </button>
        )}
      </div>
    </>
  )
}

/* ── Edit mode ───────────────────────────────────────────────────────────────── */

function EditForm({ book, bg, fg, onSave, onCancel, saving }) {
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
  })

  // Preview the cover as the user types a URL
  const [coverPreview, setCoverPreview] = useState(book.coverUrl ?? '')

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function handleCoverChange(e) {
    set('coverUrl', e.target.value)
    // Only preview http URLs or clear
    const v = e.target.value.trim()
    if (!v || v.startsWith('http')) setCoverPreview(v)
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSave({
      ...form,
      authors:       splitList(form.authors),
      genres:        splitList(form.genres),
      publishedYear: form.publishedYear ? parseInt(form.publishedYear) : null,
      pageCount:     form.pageCount     ? parseInt(form.pageCount)     : null,
    })
  }

  const previewSrc = coverPreview || null

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1">
      <div className="flex-1 overflow-y-auto">

        {/* Cover preview + URL input */}
        <div className="px-5 py-5 border-b border-smoke-light space-y-3">
          <p className="text-ice/40 text-xs uppercase tracking-widest">Cover</p>

          {/* Preview */}
          <div className="flex gap-3 items-start">
            <div
              className="w-20 shrink-0 rounded overflow-hidden shadow-lg"
              style={{ height: 120, backgroundColor: bg }}
            >
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={() => setCoverPreview('')}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2">
                  <span className="font-serif text-[10px] text-center leading-tight" style={{ color: fg }}>
                    {form.title || book.title}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2">
              <textarea
                value={form.coverUrl}
                onChange={handleCoverChange}
                placeholder="https://covers.openlibrary.org/..."
                rows={3}
                className="w-full bg-smoke-dark border border-smoke-light rounded px-2.5 py-2 text-xs text-ice placeholder-ice/25 focus:outline-none focus:border-steel transition-colors resize-none font-mono"
              />
              {form.coverUrl && form.coverUrl !== book.coverUrl && (
                <p className="text-ice/35 text-[10px] leading-tight">
                  New URL will be downloaded and cached when saved.
                </p>
              )}
              {form.coverUrl && (
                <button
                  type="button"
                  onClick={() => { set('coverUrl', ''); setCoverPreview('') }}
                  className="text-blood/50 text-[11px] hover:text-blood transition-colors cursor-pointer"
                >
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
            <TextInput
              value={form.authors}
              onChange={e => set('authors', e.target.value)}
              placeholder="Jo Nesbø, Anne Goldthwaite"
            />
          </Field>
          <Field label="Genres" hint="comma-separated">
            <TextInput
              value={form.genres}
              onChange={e => set('genres', e.target.value)}
              placeholder="crime, nordic noir"
            />
          </Field>
        </div>

        {/* Publication info */}
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
              <TextInput value={form.isbn} onChange={e => set('isbn', e.target.value)} placeholder="978..." />
            </Field>
          </div>
        </div>

        {/* Description + notes */}
        <div className="px-5 py-4 space-y-3 border-b border-smoke-light">
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={4}
              className="w-full bg-smoke-dark border border-smoke-light rounded px-3 py-2 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors resize-none"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className="w-full bg-smoke-dark border border-smoke-light rounded px-3 py-2 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors resize-none"
              placeholder="Personal notes..."
            />
          </Field>
        </div>

        {/* Owned toggle */}
        <div className="px-5 py-4">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.owned}
              onChange={e => set('owned', e.target.checked)}
              className="accent-amber w-4 h-4"
            />
            <span className="text-ice/70 text-sm">I own this book</span>
          </label>
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-5 py-4 border-t border-smoke-light flex gap-2 shrink-0">
        <button
          type="submit"
          disabled={saving || !form.title.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 bg-amber text-noir text-sm font-semibold rounded py-2 hover:bg-amber/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} />
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm text-ice/50 hover:text-ice border border-smoke-light rounded transition-colors cursor-pointer disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/* ── Shared helpers ──────────────────────────────────────────────────────────── */

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
