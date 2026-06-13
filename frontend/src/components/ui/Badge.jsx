const STATUS_CONFIG = {
  'read':           { label: 'Read',          dot: '#e8a020', text: 'text-amber',    bg: 'bg-amber/10'   },
  'reading':        { label: 'Reading',       dot: '#c0392b', text: 'text-blood',    bg: 'bg-blood/10'   },
  'want-to-read':   { label: 'Want to read',  dot: '#4a6fa5', text: 'text-steel',    bg: 'bg-steel/10'   },
  'did-not-finish': { label: 'DNF',           dot: '#555',    text: 'text-ice/40',   bg: 'bg-white/5'    },
  // legacy values from old schema
  'to-read':        { label: 'Want to read',  dot: '#4a6fa5', text: 'text-steel',    bg: 'bg-steel/10'   },
  'finished':       { label: 'Read',          dot: '#e8a020', text: 'text-amber',    bg: 'bg-amber/10'   },
  'abandoned':      { label: 'DNF',           dot: '#555',    text: 'text-ice/40',   bg: 'bg-white/5'    },
}

const COLOR_CLASS = {
  amber: { text: 'text-amber',  bg: 'bg-amber/10',  dot: '#e8a020' },
  blood: { text: 'text-blood',  bg: 'bg-blood/10',  dot: '#c0392b' },
  steel: { text: 'text-steel',  bg: 'bg-steel/10',  dot: '#4a6fa5' },
  ice:   { text: 'text-ice/70', bg: 'bg-white/5',   dot: '#e8eef2' },
  smoke: { text: 'text-ice/40', bg: 'bg-white/5',   dot: '#555'    },
}

export default function Badge({ label, color, status, className = '' }) {
  if (status) {
    const cfg = STATUS_CONFIG[status]
    if (!cfg) return null
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.text} ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.dot }} />
        {cfg.label}
      </span>
    )
  }

  if (color) {
    const c = COLOR_CLASS[color] ?? COLOR_CLASS.smoke
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text} ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
        {label}
      </span>
    )
  }

  // Plain label badge
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/5 text-ice/50 ${className}`}>
      {label}
    </span>
  )
}
