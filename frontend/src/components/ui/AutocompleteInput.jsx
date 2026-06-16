import { useState, useRef, useEffect, useCallback } from 'react'

export default function AutocompleteInput({
  value,
  onChange,
  placeholder,
  fetchSuggestions,
  className = '',
  minChars = 1,
}) {
  const [open, setOpen]         = useState(false)
  const [suggestions, setSugs]  = useState([])
  const [activeIdx, setActive]  = useState(-1)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  const fetchAndShow = useCallback(async (q) => {
    if (q.trim().length < minChars) { setSugs([]); setOpen(false); return }
    try {
      const results = await fetchSuggestions(q.trim())
      setSugs(results ?? [])
      setOpen((results?.length ?? 0) > 0)
    } catch {
      setSugs([]); setOpen(false)
    }
    setActive(-1)
  }, [fetchSuggestions, minChars])

  function handleChange(e) {
    onChange(e.target.value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchAndShow(e.target.value), 200)
  }

  function select(val) {
    onChange(val)
    setSugs([])
    setOpen(false)
    setActive(-1)
  }

  function handleKeyDown(e) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, -1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      select(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 bg-smoke-dark border border-smoke-light rounded shadow-xl overflow-hidden max-h-48 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <li key={s} role="option" aria-selected={i === activeIdx}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); select(s) }}
                className={[
                  'w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer',
                  i === activeIdx
                    ? 'bg-steel/20 text-ice'
                    : 'text-ice/70 hover:bg-smoke-light hover:text-ice',
                ].join(' ')}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
