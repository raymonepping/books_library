import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useFilterDrawer } from '../../pages/BooksPage.jsx'
import { useFocusTrap } from '../../hooks/useFocusTrap.js'

const SORT_OPTIONS = [
  { value: 'addedAt',      label: 'Date added'     },
  { value: 'title',        label: 'Title A–Z'      },
  { value: 'rating',       label: 'Rating'         },
  { value: 'publishedYear',label: 'Published year'  },
]

const STATUS_OPTIONS = [
  { value: '',              label: 'Any status'   },
  { value: 'read',          label: 'Read'         },
  { value: 'reading',       label: 'Reading'      },
  { value: 'want-to-read',  label: 'Want to read' },
  { value: 'did-not-finish',label: 'Did not finish'},
]

export default function FilterDrawer({ filters, onApply, onReset }) {
  const { open, setOpen } = useFilterDrawer()
  const drawerRef = useRef(null)

  // Local draft state — only apply on "Apply"
  const [draft, setDraft] = useState(filters)
  useEffect(() => { if (open) setDraft(filters) }, [open, filters])

  useFocusTrap(drawerRef, open)

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [setOpen])

  function set(key, val) { setDraft(d => ({ ...d, [key]: val })) }

  function apply() {
    onApply(draft)
    setOpen(false)
  }

  function reset() {
    onReset()
    setOpen(false)
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-noir/60 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filter and sort"
        className="fixed right-0 inset-y-0 z-50 w-80 bg-smoke border-l border-smoke-light flex flex-col shadow-2xl overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-smoke-light shrink-0">
          <h2 className="font-serif text-ice text-base">Filters &amp; Sort</h2>
          <button onClick={() => setOpen(false)} aria-label="Close filters" className="text-ice/40 hover:text-ice transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Sort */}
          <section>
            <Label>Sort by</Label>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {SORT_OPTIONS.map(o => (
                <ToggleBtn
                  key={o.value}
                  active={draft.sort === o.value}
                  onClick={() => set('sort', o.value)}
                >
                  {o.label}
                </ToggleBtn>
              ))}
            </div>
          </section>

          {/* Status */}
          <section>
            <Label>Status</Label>
            <div className="space-y-1 mt-2">
              {STATUS_OPTIONS.map(o => (
                <ToggleBtn
                  key={o.value}
                  active={draft.status === o.value}
                  onClick={() => set('status', o.value)}
                  wide
                >
                  {o.label}
                </ToggleBtn>
              ))}
            </div>
          </section>

          {/* Genre */}
          <section>
            <Label>Genre</Label>
            <input
              type="text"
              value={draft.genre ?? ''}
              onChange={e => set('genre', e.target.value)}
              placeholder="e.g. crime"
              className="mt-2 w-full bg-smoke-dark border border-smoke-light rounded px-3 py-2 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors"
            />
          </section>

          {/* Ownership */}
          <section>
            <Label>Ownership</Label>
            <div className="flex gap-2 mt-2">
              {[['', 'Any'], ['true', 'Owned'], ['false', 'Not owned']].map(([val, label]) => (
                <ToggleBtn key={val} active={draft.owned === val} onClick={() => set('owned', val)}>
                  {label}
                </ToggleBtn>
              ))}
            </div>
          </section>

          {/* Author name */}
          <section>
            <Label>Author</Label>
            <input
              type="text"
              value={draft.author ?? ''}
              onChange={e => set('author', e.target.value)}
              placeholder="Author name"
              className="mt-2 w-full bg-smoke-dark border border-smoke-light rounded px-3 py-2 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors"
            />
          </section>

          {/* Series name */}
          <section>
            <Label>Series</Label>
            <input
              type="text"
              value={draft.series ?? ''}
              onChange={e => set('series', e.target.value)}
              placeholder="Series name"
              className="mt-2 w-full bg-smoke-dark border border-smoke-light rounded px-3 py-2 text-sm text-ice placeholder-ice/30 focus:outline-none focus:border-steel transition-colors"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-smoke-light flex gap-2 shrink-0">
          <button
            onClick={apply}
            className="flex-1 bg-amber text-noir text-sm font-semibold rounded py-2 hover:bg-amber/90 transition-colors cursor-pointer"
          >
            Apply
          </button>
          <button
            onClick={reset}
            className="px-4 py-2 text-sm text-ice/50 hover:text-ice border border-smoke-light rounded transition-colors cursor-pointer"
          >
            Reset
          </button>
        </div>
      </aside>
    </>
  )
}

function Label({ children }) {
  return <p className="text-ice/40 text-xs uppercase tracking-widest">{children}</p>
}

function ToggleBtn({ active, onClick, wide, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 py-2 rounded border text-sm transition-colors cursor-pointer text-left',
        wide ? 'w-full' : '',
        active
          ? 'border-amber text-amber bg-amber/10'
          : 'border-smoke-light text-ice/50 hover:border-steel hover:text-ice',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
