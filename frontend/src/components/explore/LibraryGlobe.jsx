import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { coverPlaceholder } from '../../utils/coverPlaceholder.js'

// ── Genre colours ─────────────────────────────────────────────────────────────
export const GENRE_COLORS = {
  'Scandinavisch noir':      '#4a6fa5',
  'Psychologische thriller': '#c0392b',
  'Politiethriller':         '#e8a020',
  'Misdaad':                 '#9b59b6',
  'Spionage':                '#1abc9c',
  'Historische thriller':    '#e67e22',
  'Juridische thriller':     '#e84393',
  'Literaire fictie':        '#6c7adb',
  'Horrorthriller':          '#e74c3c',
  'Actiethriller':           '#f39c12',
  'Sociaal drama':           '#27ae60',
}

const DEFAULT_COLOR = '#7a8a9a'

// ── Sentiment scoring ─────────────────────────────────────────────────────────
const PACE_FAST = /relentless|fast.pac|rapid|urgent|breathless|compulsive|gripping/
const PACE_SLOW = /slow.burn|deliberate|measured|atmospheric|meditative|brooding|languid/

function scorePace(pace = '') {
  const p = pace.toLowerCase()
  if (PACE_FAST.test(p)) return 0.75 + Math.random() * 0.20
  if (PACE_SLOW.test(p)) return 0.05 + Math.random() * 0.20
  return 0.42 + Math.random() * 0.16
}

function scoreTone(tone) {
  if (!Array.isArray(tone) || !tone.length) return 0.42 + Math.random() * 0.16
  const text = tone.join(' ').toLowerCase()
  const dark = (text.match(/dark|brutal|visceral|harrowing|disturb|intense|oppress|grim|bleak|sinister|horrif/g) ?? []).length
  const cold = (text.match(/cold|clinical|calm|detach|cerebral|quiet|restrained|subtle/g) ?? []).length
  if (!dark && !cold) return 0.42 + Math.random() * 0.16
  const t = dark / (dark + cold)
  return Math.max(0.01, Math.min(0.99, t + (Math.random() - 0.5) * 0.06))
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function lerpColor(hex1, hex2, t) {
  const [r1, g1, b1] = hexToRgb(hex1)
  const [r2, g2, b2] = hexToRgb(hex2)
  const r = Math.round(r1 + (r2 - r1) * t).toString(16).padStart(2, '0')
  const g = Math.round(g1 + (g2 - g1) * t).toString(16).padStart(2, '0')
  const b = Math.round(b1 + (b2 - b1) * t).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

export function bookColor(book, colorMode) {
  if (colorMode === 'pace') {
    const t = book.sx ?? scorePace(book.sentiment?.pace)
    return lerpColor('#4a6fa5', '#c0392b', t)
  }
  if (colorMode === 'tone') {
    const t = book.sy ?? scoreTone(book.sentiment?.tone)
    return lerpColor('#e8a020', '#7b0a1a', t)
  }
  for (const g of (book.genres ?? [])) {
    if (GENRE_COLORS[g]) return GENRE_COLORS[g]
  }
  return DEFAULT_COLOR
}

// ── Canvas coordinate helpers ─────────────────────────────────────────────────
const PAD = 72

function toCanvas(sx, sy, W, H, tf) {
  // sx: 0=left(slow) → 1=right(fast)  sy: 0=bottom(cold) → 1=top(sadistic)
  const baseX = PAD + sx * (W - PAD * 2)
  const baseY = H - PAD - sy * (H - PAD * 2)  // flip Y so high=top
  return [
    (baseX - W / 2) * tf.scale + W / 2 + tf.dx,
    (baseY - H / 2) * tf.scale + H / 2 + tf.dy,
  ]
}

function bookRadius(book, scale) {
  return Math.max(3, (4 + (book.rating ?? 3) * 1.4) * Math.min(scale, 2))
}

function findBook(mx, my, books, W, H, tf) {
  for (let i = books.length - 1; i >= 0; i--) {
    const b = books[i]
    const [bx, by] = toCanvas(b.sx, b.sy, W, H, tf)
    const r = bookRadius(b, tf.scale) + 5
    if ((mx - bx) ** 2 + (my - by) ** 2 <= r ** 2) return b
  }
  return null
}

// ── Canvas draw ───────────────────────────────────────────────────────────────
function draw(canvas, ctx, books, tf, colorMode, activeGenres, hoveredId, selectedId) {
  const W = canvas.width
  const H = canvas.height

  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, W, H)

  // quadrant tints
  const [cx, cy]   = toCanvas(0.5, 0.5, W, H, tf)
  const [tlx, tly] = toCanvas(0,   1,   W, H, tf)
  const [brx, bry] = toCanvas(1,   0,   W, H, tf)

  const quadrants = [
    { x: tlx, y: tly, w: cx - tlx,  h: cy - tly,  c: 'rgba(74,111,165,0.04)'  }, // dark slow
    { x: cx,  y: tly, w: brx - cx,  h: cy - tly,  c: 'rgba(192,57,43,0.04)'   }, // dark fast
    { x: tlx, y: cy,  w: cx - tlx,  h: bry - cy,  c: 'rgba(232,160,32,0.03)'  }, // cold slow
    { x: cx,  y: cy,  w: brx - cx,  h: bry - cy,  c: 'rgba(155,89,182,0.03)'  }, // cold fast
  ]
  quadrants.forEach(({ x, y, w, h, c }) => {
    ctx.fillStyle = c
    ctx.fillRect(x, y, w, h)
  })

  // axis lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth   = 1
  const [lx, ly] = toCanvas(0, 0.5, W, H, tf)
  const [rx, ry] = toCanvas(1, 0.5, W, H, tf)
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ry); ctx.stroke()
  const [bax, bay] = toCanvas(0.5, 0, W, H, tf)
  const [tax, tay] = toCanvas(0.5, 1, W, H, tf)
  ctx.beginPath(); ctx.moveTo(bax, bay); ctx.lineTo(tax, tay); ctx.stroke()

  // axis labels
  ctx.save()
  ctx.font         = '10px Inter, sans-serif'
  ctx.fillStyle    = 'rgba(255,255,255,0.22)'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left';  ctx.fillText('FAST →',      rx + 10,  ry)
  ctx.textAlign = 'right'; ctx.fillText('← SLOW',      lx - 10,  ly)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'; ctx.fillText('SADISTIC',   tax, tay - 16)
  ctx.textBaseline = 'top';    ctx.fillText('METHODICAL', bax, bay + 16)
  ctx.restore()

  // quadrant watermarks
  ctx.save()
  ctx.font      = 'bold 11px Inter, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  const qp = 22
  ctx.textAlign = 'left';  ctx.textBaseline = 'top';    ctx.fillText('DARK & SLOW',  tlx + qp, tly + qp)
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';    ctx.fillText('DARK & FAST',  brx - qp, tly + qp)
  ctx.textAlign = 'left';  ctx.textBaseline = 'bottom'; ctx.fillText('COLD & SLOW',  tlx + qp, bry - qp)
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('COLD & FAST',  brx - qp, bry - qp)
  ctx.restore()

  // author labels — centroid of ≥2-book authors, skip if too close to prior label
  const authorMap = new Map()
  for (const b of books) {
    const key = (b.authors?.[0]?.name ?? b.authors?.[0] ?? '').trim()
    if (!key) continue
    if (!authorMap.has(key)) authorMap.set(key, [])
    authorMap.get(key).push(b)
  }
  const placed = []
  ctx.save()
  ctx.font         = '10px Inter, sans-serif'
  ctx.fillStyle    = 'rgba(255,255,255,0.22)'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'bottom'
  for (const [name, bks] of authorMap) {
    if (bks.length < 2) continue
    let sx = 0, sy = 0
    for (const b of bks) {
      const [px, py] = toCanvas(b.sx, b.sy, W, H, tf)
      sx += px; sy += py
    }
    const lx = sx / bks.length
    const ly = sy / bks.length - 14
    if (placed.some(([ox, oy]) => (lx - ox) ** 2 + (ly - oy) ** 2 < 50 ** 2)) continue
    placed.push([lx, ly])
    ctx.fillText(name, lx, ly)
  }
  ctx.restore()

  // draw all books (non-highlighted)
  for (const b of books) {
    if (b.id === hoveredId || b.id === selectedId) continue
    const isActive = activeGenres.size === 0 || b.genres?.some(g => activeGenres.has(g))
    const [px, py] = toCanvas(b.sx, b.sy, W, H, tf)
    const r        = bookRadius(b, tf.scale)
    const color    = bookColor(b, colorMode)

    ctx.save()
    ctx.globalAlpha = isActive ? 0.85 : 0.08
    const grd = ctx.createRadialGradient(px, py, 0, px, py, r * 2.5)
    grd.addColorStop(0, color + 'aa')
    grd.addColorStop(1, color + '00')
    ctx.beginPath(); ctx.arc(px, py, r * 2.5, 0, Math.PI * 2)
    ctx.fillStyle = grd; ctx.fill()
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = color; ctx.fill()
    ctx.restore()
  }

  // draw hovered/selected on top (brighter)
  for (const b of books) {
    const isHovered  = b.id === hoveredId
    const isSelected = b.id === selectedId
    if (!isHovered && !isSelected) continue
    const [px, py] = toCanvas(b.sx, b.sy, W, H, tf)
    const r        = bookRadius(b, tf.scale) * (isHovered ? 1.5 : 1.2)
    const color    = bookColor(b, colorMode)

    ctx.save()
    const grd = ctx.createRadialGradient(px, py, 0, px, py, r * 3.5)
    grd.addColorStop(0, color + 'ff')
    grd.addColorStop(0.4, color + '88')
    grd.addColorStop(1, color + '00')
    ctx.beginPath(); ctx.arc(px, py, r * 3.5, 0, Math.PI * 2)
    ctx.fillStyle = grd; ctx.fill()
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fillStyle = color; ctx.fill()
    if (isSelected) {
      ctx.strokeStyle  = color
      ctx.lineWidth    = 1.5
      ctx.globalAlpha  = 0.6
      ctx.beginPath(); ctx.arc(px, py, r + 4, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LibraryGlobe({
  books,
  colorMode    = 'genre',
  onSelect,
  selectedBook = null,
  activeGenres = new Set(),
}) {
  const canvasRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [transform, setTransform] = useState({ dx: 0, dy: 0, scale: 1 })
  const [hoveredBook, setHoveredBook] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const drag  = useRef(null)
  const tfRef = useRef(transform)
  tfRef.current = transform

  // stable scores — computed once per books array reference
  const scoredBooks = useMemo(() => books.map(b => ({
    ...b,
    sx: scorePace(b.sentiment?.pace),
    sy: scoreTone(b.sentiment?.tone),
  })), [books])

  // resize observer
  useEffect(() => {
    const el = canvasRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // redraw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0 || size.h === 0) return
    canvas.width  = size.w
    canvas.height = size.h
    const ctx = canvas.getContext('2d')
    draw(canvas, ctx, scoredBooks, transform, colorMode, activeGenres,
         hoveredBook?.id ?? null, selectedBook?.id ?? null)
  }, [scoredBooks, transform, colorMode, activeGenres, size, hoveredBook, selectedBook])

  // ── pointer events ──────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(e => {
    drag.current = {
      startX: e.clientX, startY: e.clientY, moved: false,
      dx0: tfRef.current.dx, dy0: tfRef.current.dy,
    }
  }, [])

  const handleMouseMove = useCallback(e => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (drag.current) {
      const ddx = e.clientX - drag.current.startX
      const ddy = e.clientY - drag.current.startY
      if (Math.abs(ddx) > 2 || Math.abs(ddy) > 2) drag.current.moved = true
      setTransform(tf => ({ ...tf, dx: drag.current.dx0 + ddx, dy: drag.current.dy0 + ddy }))
      return
    }
    const rect  = canvas.getBoundingClientRect()
    const mx    = e.clientX - rect.left
    const my    = e.clientY - rect.top
    const found = findBook(mx, my, scoredBooks, size.w, size.h, tfRef.current)
    setHoveredBook(found ?? null)
    if (found) setTooltipPos({ x: e.clientX, y: e.clientY })
    canvas.style.cursor = found ? 'pointer' : 'grab'
  }, [scoredBooks, size])

  const handleMouseUp = useCallback(e => {
    if (!drag.current?.moved) {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect  = canvas.getBoundingClientRect()
      const mx    = e.clientX - rect.left
      const my    = e.clientY - rect.top
      const found = findBook(mx, my, scoredBooks, size.w, size.h, tfRef.current)
      onSelect?.(found ?? null)
    }
    drag.current = null
  }, [scoredBooks, size, onSelect])

  const handleMouseLeave = useCallback(() => {
    drag.current = null
    setHoveredBook(null)
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
  }, [])

  const handleWheel = useCallback(e => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect    = canvas.getBoundingClientRect()
    const mx      = e.clientX - rect.left
    const my      = e.clientY - rect.top
    setTransform(tf => {
      const delta    = e.deltaY > 0 ? 0.88 : 1.14
      const newScale = Math.max(0.4, Math.min(5, tf.scale * delta))
      const ratio    = newScale / tf.scale
      return {
        dx:    mx - (mx - tf.dx) * ratio,
        dy:    my - (my - tf.dy) * ratio,
        scale: newScale,
      }
    })
  }, [])

  const handleDblClick = useCallback(() => {
    setTransform({ dx: 0, dy: 0, scale: 1 })
  }, [])

  // tooltip data
  const fp = hoveredBook?.styleFingerprint
    ? hoveredBook.styleFingerprint.length > 60
      ? hoveredBook.styleFingerprint.slice(0, 57) + '…'
      : hoveredBook.styleFingerprint
    : null
  const authorLine = (hoveredBook?.authors ?? []).map(a => a.name ?? a).join(', ')
  const tipColor   = hoveredBook ? bookColor(hoveredBook, colorMode) : '#7a8a9a'

  const isTransformed = Math.abs(transform.dx) > 5 || Math.abs(transform.dy) > 5 || Math.abs(transform.scale - 1) > 0.05

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onDoubleClick={handleDblClick}
      />

      {/* Hover tooltip */}
      {hoveredBook && (
        <div style={{
          position:       'fixed',
          left:           tooltipPos.x + 18,
          top:            tooltipPos.y - 10,
          zIndex:         50,
          background:     'rgba(13,13,13,0.95)',
          border:         `1px solid ${tipColor}55`,
          borderRadius:   10,
          padding:        '10px 13px',
          minWidth:       170,
          maxWidth:       230,
          boxShadow:      `0 0 20px ${tipColor}44, 0 4px 28px rgba(0,0,0,0.7)`,
          backdropFilter: 'blur(10px)',
          pointerEvents:  'none',
          userSelect:     'none',
        }}>
          {hoveredBook.coverUrl && (
            <img
              src={hoveredBook.coverUrl}
              alt=""
              onError={e => { e.target.src = coverPlaceholder }}
              style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 6, marginBottom: 8, display: 'block' }}
            />
          )}
          <p style={{ color: '#e8eef2', fontSize: 13, fontWeight: 600, lineHeight: 1.3, margin: '0 0 3px', fontFamily: "'Playfair Display', serif" }}>
            {hoveredBook.title}
          </p>
          {authorLine && (
            <p style={{ color: '#7a8a9a', fontSize: 11, margin: '0 0 7px' }}>{authorLine}</p>
          )}
          {fp && (
            <p style={{ color: 'rgba(232,238,242,0.5)', fontSize: 10.5, lineHeight: 1.45, margin: 0, fontStyle: 'italic' }}>{fp}</p>
          )}
        </div>
      )}

      {/* Reset view button */}
      {isTransformed && (
        <button
          onClick={() => setTransform({ dx: 0, dy: 0, scale: 1 })}
          style={{
            position:      'absolute',
            top:           14,
            right:         16,
            background:    'rgba(255,255,255,0.06)',
            border:        '1px solid rgba(255,255,255,0.12)',
            borderRadius:  8,
            padding:       '5px 12px',
            cursor:        'pointer',
            color:         'rgba(232,238,242,0.5)',
            fontSize:      11,
            fontFamily:    'Inter, sans-serif',
            letterSpacing: 0.5,
          }}
        >
          Reset view
        </button>
      )}
    </div>
  )
}
