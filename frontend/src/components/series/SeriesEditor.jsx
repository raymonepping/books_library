import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Trash2, GripVertical, ChevronDown, ChevronUp } from 'lucide-react'
import { seriesApi } from '../../api/series.js'
import { useUIStore } from '../../store/useUIStore.js'
import Spinner from '../ui/Spinner.jsx'

const EMPTY_BOOK = () => ({
  _key: Math.random().toString(36).slice(2),
  seriesOrder: '',
  bookId: null,
  title: '',
  originalTitle: '',
  altTitles: '',   // comma-separated string in the form, converted to array on save
  isbn: '',
  publishedYear: '',
  owned: false,
})

export default function SeriesEditor({ series, onClose, onSaved }) {
  const addToast = useUIStore(s => s.addToast)

  const [name, setName] = useState('')
  const [authorId, setAuthorId] = useState(null)
  const [books, setBooks] = useState([])
  const [saving, setSaving] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState(new Set())

  // Initialise form from series prop
  useEffect(() => {
    if (!series) return
    setName(series.name ?? '')
    setAuthorId(series.authorId ?? null)
    setBooks(
      (series.books ?? [])
        .slice()
        .sort((a, b) => a.seriesOrder - b.seriesOrder)
        .map(b => ({
          _key: Math.random().toString(36).slice(2),
          seriesOrder: String(b.seriesOrder ?? ''),
          bookId: b.bookId ?? null,
          title: b.title ?? '',
          originalTitle: b.originalTitle ?? '',
          altTitles: (b.altTitles ?? []).join(', '),
          isbn: b.isbn ?? '',
          publishedYear: b.publishedYear ? String(b.publishedYear) : '',
          owned: Boolean(b.owned),
        }))
    )
    setExpandedKeys(new Set())
  }, [series?.id])

  function updateBook(key, field, value) {
    setBooks(prev => prev.map(b => b._key === key ? { ...b, [field]: value } : b))
  }

  function addBook() {
    const maxOrder = books.reduce((m, b) => Math.max(m, parseInt(b.seriesOrder) || 0), 0)
    const nb = EMPTY_BOOK()
    nb.seriesOrder = String(maxOrder + 1)
    setBooks(prev => [...prev, nb])
    setExpandedKeys(prev => new Set([...prev, nb._key]))
  }

  function removeBook(key) {
    setBooks(prev => prev.filter(b => b._key !== key))
  }

  function toggleExpand(key) {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleSave() {
    if (!name.trim()) { addToast('Series name is required', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        authorId,
        books: books.map(b => ({
          seriesOrder: parseInt(b.seriesOrder) || 0,
          bookId: b.bookId || null,
          title: b.title.trim(),
          originalTitle: b.originalTitle.trim(),
          altTitles: b.altTitles
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
          isbn: b.isbn.trim(),
          publishedYear: b.publishedYear ? parseInt(b.publishedYear) : null,
          owned: b.owned,
        })),
      }
      const updated = series?.id
        ? await seriesApi.update(series.id, payload)
        : await seriesApi.create({ ...payload, totalBooks: payload.books.length })
      addToast(`Series "${updated.name}" saved`, 'success')
      onSaved?.(updated)
      onClose()
    } catch (err) {
      addToast(err.message ?? 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const sortedBooks = books.slice().sort(
    (a, b) => (parseInt(a.seriesOrder) || 0) - (parseInt(b.seriesOrder) || 0)
  )

  return (
    <div className="flex flex-col h-full bg-noir">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-smoke-light shrink-0">
        <div className="flex-1 min-w-0">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Series name"
            className="w-full bg-transparent text-ice font-serif text-lg focus:outline-none placeholder:text-ice/30"
          />
          <p className="text-ice/30 text-xs mt-0.5">{books.length} book{books.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onClose} className="text-ice/40 hover:text-ice transition-colors cursor-pointer">
          <X size={18} />
        </button>
      </div>

      {/* Book list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {sortedBooks.map(book => (
          <BookRow
            key={book._key}
            book={book}
            expanded={expandedKeys.has(book._key)}
            onToggleExpand={() => toggleExpand(book._key)}
            onChange={(field, value) => updateBook(book._key, field, value)}
            onRemove={() => removeBook(book._key)}
          />
        ))}

        <button
          onClick={addBook}
          className="flex items-center gap-2 w-full px-4 py-3 rounded border border-dashed border-smoke-light text-ice/40 hover:text-ice hover:border-ice/30 transition-colors text-sm cursor-pointer"
        >
          <Plus size={14} />
          Add book
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-smoke-light shrink-0">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-ice/50 hover:text-ice transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-amber text-noir rounded font-medium hover:bg-amber/90 disabled:opacity-40 transition-colors cursor-pointer"
        >
          {saving && <Spinner size={14} />}
          Save series
        </button>
      </div>
    </div>
  )
}

/* ── Individual book row ─────────────────────────────────────────────────── */

function BookRow({ book, expanded, onToggleExpand, onChange, onRemove }) {
  return (
    <div className="bg-smoke rounded border border-smoke-light overflow-hidden">
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="text-ice/30 text-xs font-mono w-6 shrink-0 text-right">
          {book.seriesOrder || '?'}
        </span>

        <input
          value={book.title}
          onChange={e => onChange('title', e.target.value)}
          placeholder="Title"
          className="flex-1 min-w-0 bg-transparent text-sm text-ice placeholder:text-ice/30 focus:outline-none"
        />

        <button
          onClick={() => onChange('owned', !book.owned)}
          title={book.owned ? 'Owned' : 'Not owned'}
          className={[
            'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer',
            book.owned ? 'border-amber bg-amber' : 'border-smoke-light hover:border-steel',
          ].join(' ')}
        >
          {book.owned && (
            <svg viewBox="0 0 10 8" className="w-2.5 h-2 fill-noir">
              <path d="M1 4l3 3 5-6" stroke="#0d0d0d" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <button
          onClick={onToggleExpand}
          className="text-ice/30 hover:text-ice transition-colors cursor-pointer"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <button
          onClick={onRemove}
          className="text-ice/20 hover:text-blood transition-colors cursor-pointer"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded detail fields */}
      {expanded && (
        <div className="border-t border-smoke-light px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order #">
              <input
                type="number"
                value={book.seriesOrder}
                onChange={e => onChange('seriesOrder', e.target.value)}
                className="field-input"
                min="1"
              />
            </Field>
            <Field label="Published year">
              <input
                type="number"
                value={book.publishedYear}
                onChange={e => onChange('publishedYear', e.target.value)}
                className="field-input"
                min="1900"
                max="2100"
              />
            </Field>
          </div>

          <Field label="Original title">
            <input
              value={book.originalTitle}
              onChange={e => onChange('originalTitle', e.target.value)}
              placeholder="e.g. Rødstrupe"
              className="field-input"
            />
          </Field>

          <Field label="Alternate titles" hint="comma-separated">
            <input
              value={book.altTitles}
              onChange={e => onChange('altTitles', e.target.value)}
              placeholder="e.g. De roodborst, Nemesis"
              className="field-input"
            />
          </Field>

          <Field label="ISBN">
            <input
              value={book.isbn}
              onChange={e => onChange('isbn', e.target.value)}
              placeholder="978-…"
              className="field-input"
            />
          </Field>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs text-ice/40 mb-1">
        {label}
        {hint && <span className="ml-1 text-ice/25">({hint})</span>}
      </label>
      {children}
    </div>
  )
}
