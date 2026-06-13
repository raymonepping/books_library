import { useEffect, useState } from 'react'
import {
  BookOpen, BookCheck, BookMarked, BookX,
  Star, Library, FileText, Calendar,
} from 'lucide-react'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { dashboardApi } from '../api/dashboard.js'
import { useLibraryStore } from '../store/useLibraryStore.js'
import Spinner from '../components/ui/Spinner.jsx'
import { coverPlaceholder } from '../utils/coverPlaceholder.js'

// Palette tokens (match Tailwind theme values)
const AMBER = '#e8a020'
const BLOOD = '#c0392b'
const STEEL = '#4a6fa5'
const ICE20 = 'rgba(224,231,255,0.12)'

export default function DashboardPage() {
  const [stats, setStats]   = useState(null)
  const [charts, setCharts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  const books  = useLibraryStore(s => s.books)
  const reading = books.filter(b => b.readStatus === 'reading').slice(0, 6)

  useEffect(() => {
    Promise.all([dashboardApi.getStats(), dashboardApi.getCharts()])
      .then(([s, c]) => { setStats(s); setCharts(c) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center px-6 py-4 border-b border-smoke-light shrink-0">
        <h1 className="font-serif text-xl text-ice">Dashboard</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-8">
        {loading && (
          <div className="flex items-center justify-center h-48">
            <Spinner size={32} />
          </div>
        )}

        {error && (
          <div className="text-blood/80 text-sm p-4 border border-blood/30 rounded bg-blood/5">
            {error}
          </div>
        )}

        {stats && (
          <>
            {/* ── Stat cards ── */}
            <section>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard icon={Library}    label="Total"          value={stats.total}                   color="ice"   />
                <StatCard icon={BookCheck}  label="Read"           value={stats.read}                    color="amber" />
                <StatCard icon={BookOpen}   label="Reading"        value={stats.reading}                 color="blood" />
                <StatCard icon={BookMarked} label="Want to read"   value={stats.wantToRead}              color="steel" />
                <StatCard icon={BookX}      label="DNF"            value={stats.didNotFinish}            color="ice"   />
                <StatCard icon={Star}       label="Avg rating"     value={stats.avgRating ?? '—'}        color="amber" />
                <StatCard icon={FileText}   label="Total pages"    value={fmtNumber(stats.totalPages)}   color="steel" />
                <StatCard icon={Calendar}   label="Read this year" value={stats.readThisYear}            color="blood" />
              </div>
            </section>

            {/* ── Reading progress bar ── */}
            {stats.total > 0 && (
              <section>
                <SectionTitle>Reading progress</SectionTitle>
                <ReadingProgress stats={stats} />
              </section>
            )}
          </>
        )}

        {/* ── Recharts panels ── */}
        {charts && (
          <>
            {/* Monthly completions (bar) + pages (area overlay) */}
            {charts.monthly?.length > 0 && (
              <section>
                <SectionTitle>Books read per month</SectionTitle>
                <div className="rounded border border-smoke-light bg-smoke p-4" style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.monthly} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={ICE20} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'rgba(224,231,255,0.35)', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: 'rgba(224,231,255,0.35)', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={22}
                      />
                      <Tooltip content={<MonthlyTooltip />} />
                      <Bar dataKey="booksRead" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        {charts.monthly.map((_, i) => (
                          <Cell
                            key={i}
                            fill={_ .booksRead > 0 ? AMBER : 'rgba(224,231,255,0.08)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* Pages per month (area) */}
            {charts.monthly?.some(m => m.pagesRead > 0) && (
              <section>
                <SectionTitle>Pages read per month</SectionTitle>
                <div className="rounded border border-smoke-light bg-smoke p-4" style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={charts.monthly} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="pageGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={STEEL} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={STEEL} stopOpacity={0}   />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={ICE20} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'rgba(224,231,255,0.35)', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: 'rgba(224,231,255,0.35)', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <Tooltip
                        formatter={(v) => [fmtNumber(v), 'Pages']}
                        contentStyle={{ background: '#222', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12 }}
                        labelStyle={{ color: 'rgba(224,231,255,0.6)' }}
                        itemStyle={{ color: STEEL }}
                      />
                      <Area
                        type="monotone"
                        dataKey="pagesRead"
                        stroke={STEEL}
                        strokeWidth={2}
                        fill="url(#pageGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: STEEL }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* Rating distribution */}
            {charts.ratings?.some(r => r.count > 0) && (
              <section>
                <SectionTitle>Rating distribution</SectionTitle>
                <div className="rounded border border-smoke-light bg-smoke p-4" style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.ratings} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={ICE20} horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fill: 'rgba(224,231,255,0.35)', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={24}
                        tick={{ fill: AMBER, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v) => [v, 'Books']}
                        contentStyle={{ background: '#222', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12 }}
                        labelStyle={{ color: AMBER }}
                        itemStyle={{ color: 'rgba(224,231,255,0.8)' }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20} fill={AMBER} opacity={0.8} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}
          </>
        )}

        {/* ── Genre breakdown ── */}
        {stats?.genres?.length > 0 && (
          <section>
            <SectionTitle>Genre breakdown</SectionTitle>
            <GenreBreakdown genres={stats.genres} total={stats.total} />
          </section>
        )}

        {/* ── Currently reading ── */}
        {reading.length > 0 && (
          <section>
            <SectionTitle>Currently reading</SectionTitle>
            <div className="flex gap-4 flex-wrap">
              {reading.map(book => <ReadingCard key={book.id} book={book} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/* ── Custom tooltip for monthly bars ───────────────────────────────────────── */

function MonthlyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-smoke border border-smoke-light rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-ice/60 mb-1">{label}</p>
      <p className="text-amber font-semibold">{payload[0].value} book{payload[0].value !== 1 ? 's' : ''}</p>
    </div>
  )
}

/* ── Stat card ──────────────────────────────────────────────────────────────── */

const COLOR_MAP = {
  amber: { text: 'text-amber', border: 'border-amber/20', bg: 'bg-amber/5' },
  blood: { text: 'text-blood', border: 'border-blood/20', bg: 'bg-blood/5' },
  steel: { text: 'text-steel', border: 'border-steel/20', bg: 'bg-steel/5' },
  ice:   { text: 'text-ice',   border: 'border-ice/10',   bg: 'bg-smoke'   },
}

function StatCard({ icon: Icon, label, value, color }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.ice
  return (
    <div className={`rounded border ${c.border} ${c.bg} p-5 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-ice/40 text-xs uppercase tracking-widest">{label}</span>
        <Icon size={14} className={`${c.text} opacity-60`} />
      </div>
      <span className={`font-serif text-3xl font-bold ${c.text}`}>{value}</span>
    </div>
  )
}

/* ── Reading progress bar ───────────────────────────────────────────────────── */

function ReadingProgress({ stats }) {
  const { total, read, reading, wantToRead, didNotFinish } = stats
  const segments = [
    { key: 'read',         count: read,        color: AMBER,  label: 'Read'         },
    { key: 'reading',      count: reading,      color: BLOOD,  label: 'Reading'      },
    { key: 'want-to-read', count: wantToRead,   color: STEEL,  label: 'Want to read' },
    { key: 'dnf',          count: didNotFinish, color: '#3a3a3a', label: 'DNF'       },
  ].filter(s => s.count > 0)

  return (
    <div className="space-y-3">
      <div className="flex h-4 rounded overflow-hidden gap-px">
        {segments.map(seg => (
          <div
            key={seg.key}
            title={`${seg.label}: ${seg.count}`}
            style={{ width: `${(seg.count / total) * 100}%`, backgroundColor: seg.color }}
          />
        ))}
        {segments.reduce((s, x) => s + x.count, 0) < total && (
          <div className="flex-1 bg-smoke-light" />
        )}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {segments.map(seg => (
          <div key={seg.key} className="flex items-center gap-1.5 text-xs text-ice/50">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
            {seg.label}
            <span className="text-ice/30">
              {seg.count} ({Math.round((seg.count / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Genre breakdown ────────────────────────────────────────────────────────── */

function GenreBreakdown({ genres, total }) {
  const max = genres[0]?.count ?? 1
  return (
    <div className="space-y-2">
      {genres.map(({ genre, count }) => (
        <div key={genre} className="flex items-center gap-3">
          <span className="text-ice/60 text-xs w-32 truncate capitalize shrink-0">{genre}</span>
          <div className="flex-1 h-2 bg-smoke-light rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-500"
              style={{ width: `${(count / max) * 100}%`, backgroundColor: STEEL }}
            />
          </div>
          <span className="text-ice/30 text-xs w-8 text-right shrink-0">{count}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Currently reading card ─────────────────────────────────────────────────── */

function ReadingCard({ book }) {
  const { bg, fg, initials } = coverPlaceholder(book)
  const [imgError, setImgError] = useState(false)
  const showCover = book.coverUrl && !imgError

  return (
    <div className="flex gap-3 bg-smoke border border-smoke-light rounded p-3 w-64 shrink-0">
      <div
        className="w-12 h-16 rounded shrink-0 flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: bg }}
      >
        {showCover ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover rounded"
          />
        ) : (
          <span className="font-serif font-bold text-sm select-none" style={{ color: fg }}>
            {initials}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-ice/90 text-sm font-medium leading-snug line-clamp-2">{book.title}</p>
        {book.rating > 0 && (
          <p className="text-amber text-xs mt-1">{'★'.repeat(book.rating)}</p>
        )}
        {book.pageCount && (
          <p className="text-ice/30 text-xs mt-0.5">{book.pageCount} pages</p>
        )}
      </div>
    </div>
  )
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function SectionTitle({ children }) {
  return (
    <h2 className="font-sans text-xs text-ice/40 uppercase tracking-widest mb-3">{children}</h2>
  )
}

function fmtNumber(n) {
  if (!n) return '0'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
