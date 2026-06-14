import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'

const STORAGE_KEY = 'bibliotheek-reading-goal'

function loadGoal() {
  try { return Math.max(1, parseInt(localStorage.getItem(STORAGE_KEY) || '24')) }
  catch { return 24 }
}

export default function ReadingGoal({ readThisYear = 0 }) {
  const [target, setTarget]     = useState(loadGoal)
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState(String(target))

  function saveTarget() {
    const n = Math.max(1, Math.min(999, parseInt(draft) || target))
    setTarget(n)
    setDraft(String(n))
    localStorage.setItem(STORAGE_KEY, String(n))
    setEditing(false)
  }

  const pct        = Math.min(1, readThisYear / target)
  const SIZE       = 120
  const STROKE     = 8
  const r          = (SIZE - STROKE) / 2
  const circ       = 2 * Math.PI * r
  const dashOffset = circ * (1 - pct)
  const done       = readThisYear >= target

  return (
    <div className="flex items-center gap-6 p-4 bg-smoke border border-smoke-light rounded">
      {/* SVG ring */}
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle cx={SIZE/2} cy={SIZE/2} r={r} fill="none" stroke="rgba(224,231,255,0.07)" strokeWidth={STROKE} />
          <circle
            cx={SIZE/2} cy={SIZE/2} r={r}
            fill="none"
            stroke={done ? '#e8a020' : '#4a6fa5'}
            strokeWidth={STROKE}
            strokeDasharray={circ}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.34,1.56,0.64,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-2xl font-bold text-ice">{readThisYear}</span>
          <span className="text-ice/30 text-[11px]">/ {target}</span>
        </div>
      </div>

      {/* Label + edit */}
      <div className="min-w-0">
        <p className="text-ice/70 text-sm font-medium">Reading goal {new Date().getFullYear()}</p>
        <p className="text-ice/30 text-xs mt-0.5">{Math.round(pct * 100)}% complete</p>
        {done && (
          <p className="text-amber text-xs mt-1 flex items-center gap-1">
            <Check size={11} /> Goal reached!
          </p>
        )}

        {editing ? (
          <div className="flex items-center gap-2 mt-3">
            <input
              type="number"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTarget(); if (e.key === 'Escape') setEditing(false) }}
              className="w-16 bg-smoke-dark border border-smoke-light rounded px-2 py-1 text-sm text-ice focus:outline-none focus:border-steel"
              min={1} max={999}
              autoFocus
            />
            <button
              onClick={saveTarget}
              className="px-2.5 py-1 text-xs bg-amber text-noir rounded cursor-pointer hover:bg-amber/90 transition-colors"
            >Save</button>
            <button
              onClick={() => setEditing(false)}
              className="text-ice/40 text-xs hover:text-ice cursor-pointer"
            >Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => { setDraft(String(target)); setEditing(true) }}
            className="mt-3 flex items-center gap-1.5 text-ice/30 text-xs hover:text-ice/60 transition-colors cursor-pointer"
          >
            <Pencil size={11} /> Change target
          </button>
        )}
      </div>
    </div>
  )
}
