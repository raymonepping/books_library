import { useState, useRef, useEffect } from 'react'
import { X, Search, Star, BookOpen } from 'lucide-react'
import { booksApi } from '../../api/books.js'
import { useLibraryStore } from '../../store/useLibraryStore.js'
import { useUIStore } from '../../store/useUIStore.js'
import Button from '../ui/Button.jsx'
import Spinner from '../ui/Spinner.jsx'
import { spineColor } from '../BookViews/spineUtils.js'

const TABS = ['ISBN search', 'Manual']

const STATUS_OPTIONS = [
  { value: 'want-to-read', label: 'Want to read' },
  { value: 'reading',      label: 'Currently reading' },
  { value: 'read',         label: 'Read' },
  { value: 'did-not-finish', label: 'Did not finish' },
]

const EMPTY_MANUAL = {
  title: '', subtitle: '', authors: '', genres: '',
  publishedYear: '', pageCount: '', isbn: '', description: '',
  coverUrl: '', readStatus: 'want-to-read', owned: false, rating: null,
}

export default function AddBookModal() {
  const addBookOpen = useUIStore(s => s.addBookOpen)
  const setAddBookOpen = useUIStore(s => s.setAddBookOpen)
  const upsertBook = useLibraryStore(s => s.upsertBook)
  const addToast = useUIStore(s => s.addToast)

  const [tab, setTab] = useState('ISBN search')
  const [isbn, setIsbn] = useState('')
  const [searchState, setSearchState] = useState('idle') // idle | searching | found | not-found
  const [preview, setPreview] = useState(null)
  const [overrides, setOverrides] = useState({ readStatus: 'want-to-read', owned: false, rating: null })
  const [manual, setManual] = useState(EMPTY_MANUAL)
  const [saving, setSaving] = useState(false)
  const isbnRef = useRef(null)

  // Reset when modal opens
  useEffect(() => {
    if (addBookOpen) {
      setTab('ISBN search')
      setIsbn('')
      setSearchState('idle')
      setPreview(null)
      setOverrides({ readStatus: 'want-to-read', owned: false, rating: null })
      setManual(EMPTY_MANUAL)
      setSaving(false)
      setTimeout(() => isbnRef.current?.focus(), 50)
    }
  }, [addBookOpen])

  // Escape to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setAddBookOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [setAddBookOpen])

  if (!addBookOpen) return null

  /* ── ISBN search ── */

  async function handleSearch(e) {
    e.preventDefault()
    const q = isbn.trim()
    if (!q) return
    setSearchState('searching')
    setPreview(null)
    try {
      const data = await booksApi.enrich(q)
      if (!data) {
        setSearchState('not-found')
      } else {
        setPreview(data)
        setSearchState('found')
        setOverrides(o => ({ ...o, readStatus: 'want-to-read', rating: null, owned: false }))
      }
    } catch {
      setSearchState('not-found')
    }
  }

  async function handleSaveFromIsbn() {
    if (!preview) return
    setSaving(true)
    try {
      const book = await booksApi.create({
        title:         preview.title,
        subtitle:      preview.subtitle,
        authors:       preview.authors,
        genres:        preview.genres,
        publishedYear: preview.publishedYear,
        pageCount:     preview.pageCount,
        isbn:          preview.isbn || preview.isbn13,
        description:   preview.description,
        coverUrl:      preview.coverUrl,
        language:      preview.language,
        publishers:    preview.publishers,
        sources:       preview.sources,
        readStatus:    overrides.readStatus,
        owned:         overrides.owned,
        rating:        overrides.rating,
      })
      upsertBook(book)
      addToast(`"${book.title}" added`, 'success')
      setAddBookOpen(false)
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ── Manual entry ── */

  async function handleSaveManual(e) {
    e.preventDefault()
    if (!manual.title.trim()) return
    setSaving(true)
    try {
      const book = await booksApi.create({
        title:         manual.title.trim(),
        subtitle:      manual.subtitle.trim(),
        authors:       splitList(manual.authors),
        genres:        splitList(manual.genres),
        publishedYear: manual.publishedYear ? parseInt(manual.publishedYear) : null,
        pageCount:     manual.pageCount ? parseInt(manual.pageCount) : null,
        isbn:          manual.isbn.trim(),
        description:   manual.description.trim(),
        coverUrl:      manual.coverUrl.trim(),
        readStatus:    manual.readStatus,
        owned:         manual.owned,
        rating:        manual.rating,
      })
      upsertBook(book)
      addToast(`"${book.title}" added`, 'success')
      setAddBookOpen(false)
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-noir/70 backdrop-blur-[2px]"
        onClick={() => setAddBookOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-smoke border border-smoke-light rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col pointer-events-auto">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-smoke-light shrink-0">
            <h2 className="font-serif text-ice text-lg">Add book</h2>
            <button
              onClick={() => setAddBookOpen(false)}
              className="text-ice/40 hover:text-ice transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-smoke-light shrink-0">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={[
                  'flex-1 py-2.5 text-sm transition-colors cursor-pointer',
                  tab === t
                    ? 'text-amber border-b-2 border-amber -mb-px'
                    : 'text-ice/40 hover:text-ice',
                ].join(' ')}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'ISBN search' ? (
              <IsbnTab
                isbn={isbn}
                setIsbn={setIsbn}
                searchState={searchState}
                preview={preview}
                overrides={overrides}
                setOverrides={setOverrides}
                onSearch={handleSearch}
                onSave={handleSaveFromIsbn}
                saving={saving}
                isbnRef={isbnRef}
                onNewSearch={() => { setSearchState('idle'); setPreview(null); setIsbn('') }}
              />
            ) : (
              <ManualTab
                manual={manual}
                setManual={setManual}
                onSave={handleSaveManual}
                saving={saving}
              />
            )}
          </div>

        </div>
      </div>
    </>
  )
}

/* ── ISBN tab ───────────────────────────────────────────────────────────────── */

function IsbnTab({ isbn, setIsbn, searchState, preview, overrides, setOverrides, onSearch, onSave, saving, isbnRef, onNewSearch }) {
  return (
    <div className="p-6 space-y-5">
      {/* Search bar */}
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          ref={isbnRef}
          value={isbn}
          onChange={e => setIsbn(e.target.value)}
          placeholder="ISBN-13 or ISBN-10"
          disabled={searchState === 'searching' || !!preview}
          className="flex-1 bg-smoke-dark border border-smoke-light rounded px-3 py-2 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors disabled:opacity-50"
        />
        {preview ? (
          <Button type="button" variant="outline" size="sm" onClick={onNewSearch}>
            New search
          </Button>
        ) : (
          <Button type="submit" size="sm" disabled={searchState === 'searching' || !isbn.trim()}>
            {searchState === 'searching' ? <Spinner size={14} /> : <Search size={14} />}
            Search
          </Button>
        )}
      </form>

      {searchState === 'not-found' && (
        <p className="text-blood/80 text-sm">
          No results found for this ISBN. Try manual entry.
        </p>
      )}

      {preview && (
        <IsbnPreview
          preview={preview}
          overrides={overrides}
          setOverrides={setOverrides}
          onSave={onSave}
          saving={saving}
        />
      )}
    </div>
  )
}

/* ── ISBN preview + save controls ──────────────────────────────────────────── */

function IsbnPreview({ preview, overrides, setOverrides, onSave, saving }) {
  const { bg, fg } = spineColor({ genres: preview.genres, id: preview.isbn })

  return (
    <div className="space-y-5">
      {/* Book card */}
      <div className="flex gap-4 bg-smoke-dark border border-smoke-light rounded p-4">
        {/* Cover */}
        <div
          className="w-16 shrink-0 rounded overflow-hidden flex items-center justify-center"
          style={{ height: 96, backgroundColor: bg }}
        >
          {preview.coverUrl ? (
            <img src={preview.coverUrl} alt={preview.title} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[7px] font-serif text-center p-1 leading-tight" style={{ color: fg }}>
              {preview.title}
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="min-w-0 flex-1">
          <p className="font-serif text-ice text-sm font-medium leading-snug line-clamp-2">
            {preview.title}
            {preview.subtitle && <span className="text-ice/50"> — {preview.subtitle}</span>}
          </p>
          {preview.authors?.length > 0 && (
            <p className="text-ice/60 text-xs mt-1">{preview.authors.join(', ')}</p>
          )}
          <div className="flex gap-3 text-ice/40 text-xs mt-1">
            {preview.publishedYear && <span>{preview.publishedYear}</span>}
            {preview.pageCount && <span>{preview.pageCount} pp</span>}
            {preview.language && <span>{preview.language.toUpperCase()}</span>}
          </div>
          {preview.genres?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {preview.genres.slice(0, 4).map(g => (
                <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-steel/20 text-steel/80 capitalize">
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Description preview */}
      {preview.description && (
        <p className="text-ice/50 text-xs leading-relaxed line-clamp-3">
          {preview.description}
        </p>
      )}

      {/* Read status */}
      <div>
        <Label>Status</Label>
        <div className="grid grid-cols-2 gap-1.5 mt-1">
          {STATUS_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => setOverrides(x => ({ ...x, readStatus: o.value }))}
              className={[
                'text-xs px-3 py-2 rounded border transition-colors cursor-pointer text-left',
                overrides.readStatus === o.value
                  ? 'border-amber text-amber bg-amber/10'
                  : 'border-smoke-light text-ice/50 hover:border-steel hover:text-ice',
              ].join(' ')}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Owned + Rating row */}
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={overrides.owned}
            onChange={e => setOverrides(x => ({ ...x, owned: e.target.checked }))}
            className="accent-amber w-4 h-4"
          />
          <span className="text-ice/70 text-sm">I own this book</span>
        </label>

        <RatingPicker
          value={overrides.rating}
          onChange={r => setOverrides(x => ({ ...x, rating: x.rating === r ? null : r }))}
        />
      </div>

      <Button onClick={onSave} disabled={saving} className="w-full justify-center">
        {saving ? <Spinner size={14} /> : <BookOpen size={14} />}
        Add to library
      </Button>
    </div>
  )
}

/* ── Manual tab ─────────────────────────────────────────────────────────────── */

function ManualTab({ manual, setManual, onSave, saving }) {
  function set(key, val) {
    setManual(m => ({ ...m, [key]: val }))
  }

  return (
    <form onSubmit={onSave} className="p-6 space-y-4">
      <Field label="Title *">
        <TextInput
          value={manual.title}
          onChange={e => set('title', e.target.value)}
          placeholder="The Snowman"
          required
        />
      </Field>

      <Field label="Subtitle">
        <TextInput value={manual.subtitle} onChange={e => set('subtitle', e.target.value)} />
      </Field>

      <Field label="Authors" hint="comma-separated">
        <TextInput
          value={manual.authors}
          onChange={e => set('authors', e.target.value)}
          placeholder="Jo Nesbø, Anne Goldthwaite"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Published year">
          <TextInput
            type="number"
            value={manual.publishedYear}
            onChange={e => set('publishedYear', e.target.value)}
            placeholder="2007"
            min="1000" max="2100"
          />
        </Field>
        <Field label="Pages">
          <TextInput
            type="number"
            value={manual.pageCount}
            onChange={e => set('pageCount', e.target.value)}
            placeholder="374"
            min="1"
          />
        </Field>
      </div>

      <Field label="Genres" hint="comma-separated">
        <TextInput
          value={manual.genres}
          onChange={e => set('genres', e.target.value)}
          placeholder="crime, nordic noir"
        />
      </Field>

      <Field label="ISBN">
        <TextInput value={manual.isbn} onChange={e => set('isbn', e.target.value)} placeholder="9780099450025" />
      </Field>

      <Field label="Cover URL">
        <TextInput value={manual.coverUrl} onChange={e => set('coverUrl', e.target.value)} placeholder="https://..." />
      </Field>

      <Field label="Description">
        <textarea
          value={manual.description}
          onChange={e => set('description', e.target.value)}
          rows={3}
          className="w-full bg-smoke-dark border border-smoke-light rounded px-3 py-2 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors resize-none"
        />
      </Field>

      {/* Status */}
      <div>
        <Label>Status</Label>
        <div className="grid grid-cols-2 gap-1.5 mt-1">
          {STATUS_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => set('readStatus', o.value)}
              className={[
                'text-xs px-3 py-2 rounded border transition-colors cursor-pointer text-left',
                manual.readStatus === o.value
                  ? 'border-amber text-amber bg-amber/10'
                  : 'border-smoke-light text-ice/50 hover:border-steel hover:text-ice',
              ].join(' ')}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Owned + Rating */}
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={manual.owned}
            onChange={e => set('owned', e.target.checked)}
            className="accent-amber w-4 h-4"
          />
          <span className="text-ice/70 text-sm">I own this book</span>
        </label>
        <RatingPicker
          value={manual.rating}
          onChange={r => set('rating', manual.rating === r ? null : r)}
        />
      </div>

      <Button type="submit" disabled={saving || !manual.title.trim()} className="w-full justify-center">
        {saving ? <Spinner size={14} /> : <BookOpen size={14} />}
        Add to library
      </Button>
    </form>
  )
}

/* ── Shared sub-components ──────────────────────────────────────────────────── */

function RatingPicker({ value, onChange }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)} className="cursor-pointer">
          <Star
            size={18}
            className={n <= (value ?? 0) ? 'text-amber fill-amber' : 'text-ice/20 hover:text-ice/50'}
          />
        </button>
      ))}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-ice/50 text-xs uppercase tracking-widest mb-1">
        {label}
        {hint && <span className="normal-case tracking-normal ml-1 text-ice/30">({hint})</span>}
      </label>
      {children}
    </div>
  )
}

function Label({ children }) {
  return <p className="text-ice/50 text-xs uppercase tracking-widest">{children}</p>
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

/* ── Utils ──────────────────────────────────────────────────────────────────── */

function splitList(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean)
}
