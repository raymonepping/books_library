import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, BookCheck, BookMarked, BookX,
  Star, Library, FileText, Calendar, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { dashboardApi } from '../api/dashboard.js'
import { booksApi } from '../api/books.js'
import { useUIStore } from '../store/useUIStore.js'
import Spinner from '../components/ui/Spinner.jsx'
import { coverPlaceholder } from '../utils/coverPlaceholder.js'
import { useCountUp } from '../hooks/useCountUp.js'
import ReadingGoal from '../components/dashboard/ReadingGoal.jsx'
import ReadingHeatmap from '../components/dashboard/ReadingHeatmap.jsx'

const AMBER  = '#e8a020'
const BLOOD  = '#c0392b'
const STEEL  = '#4a6fa5'
const ICE20  = 'rgba(224,231,255,0.12)'

const RANGE_OPTIONS = [
  { label: '3M',  value: 3   },
  { label: '12M', value: 12  },
  { label: 'All', value: 'all' },
]

export default function DashboardPage() {
  const [stats, setStats]     = useState(null)
  const [charts, setCharts]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [chartRange, setChartRange] = useState(12)
  const [chartsLoading, setChartsLoading] = useState(false)
  const [reading,       setReading]       = useState([])
  const [heatmap,       setHeatmap]       = useState(null)

  const navigate = useNavigate()

  useEffect(() => {
    dashboardApi.getStats()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    booksApi.list({ status: 'reading', limit: 6 })
      .then(d => setReading(d.books ?? []))
      .catch(() => {})

    dashboardApi.getHeatmap()
      .then(d => setHeatmap(d))
      .catch(() => {})
  }, [])

  const loadCharts = useCallback(async (range) => {
    setChartsLoading(true)
    try {
      const c = await dashboardApi.getCharts(range)
      setCharts(c)
    } catch (_) {}
    finally { setChartsLoading(false) }
  }, [])

  useEffect(() => { loadCharts(chartRange) }, [chartRange, loadCharts])

  // Comparison: current month vs previous month
  const currentMonth  = charts?.monthly?.at(-1)
  const previousMonth = charts?.monthly?.at(-2)
  const monthDelta    = (currentMonth && previousMonth)
    ? currentMonth.booksRead - previousMonth.booksRead
    : null

  function handleBarClick(data) {
    if (!data?.activePayload?.[0]?.payload?.booksRead) return
    navigate('/books?status=read')
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center px-6 py-4 border-b border-smoke-light shrink-0">
        <h1 className="font-serif text-xl text-ice">Dashboard</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-8">
        {loading && (
          <div className="flex items-center justify-center h-48"><Spinner size={32} /></div>
        )}
        {error && (
          <div className="text-blood/80 text-sm p-4 border border-blood/30 rounded bg-blood/5">{error}</div>
        )}

        {stats && (
          <>
            {/* Stat cards */}
            <section>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard icon={Library}    label="Total"          value={stats.total}                  color="ice"   />
                <StatCard icon={BookCheck}  label="Read"           value={stats.read}                   color="amber" />
                <StatCard icon={BookOpen}   label="Reading"        value={stats.reading}                color="blood" />
                <StatCard icon={BookMarked} label="Want to read"   value={stats.wantToRead}             color="steel" />
                <StatCard icon={BookX}      label="DNF"            value={stats.didNotFinish}           color="ice"   />
                <StatCard icon={Star}       label="Avg rating"     value={stats.avgRating ?? '—'}       color="amber" />
                <StatCard icon={FileText}   label="Total pages"    value={fmtNumber(stats.totalPages)}  color="steel" />
                <StatCard icon={Calendar}   label="Read this year" value={stats.readThisYear}           color="blood" />
              </div>
            </section>

            {/* Reading progress bar */}
            {stats.total > 0 && (
              <section>
                <SectionTitle>Reading progress</SectionTitle>
                <ReadingProgress stats={stats} />
              </section>
            )}

            {/* Reading goal */}
            <section>
              <SectionTitle>Reading goal</SectionTitle>
              <ReadingGoal readThisYear={stats.readThisYear} />
            </section>
          </>
        )}

        {/* Chart range selector */}
        <div className="flex items-center gap-2">
          <SectionTitle>Trends</SectionTitle>
          <div className="ml-auto flex gap-1 border border-smoke-light rounded p-0.5">
            {RANGE_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setChartRange(o.value)}
                aria-pressed={chartRange === o.value}
                className={[
                  'px-3 py-1 text-xs rounded transition-colors cursor-pointer',
                  chartRange === o.value ? 'bg-smoke-light text-amber' : 'text-ice/40 hover:text-ice',
                ].join(' ')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {chartsLoading && <div className="flex justify-center h-24 items-center"><Spinner size={20} /></div>}

        {!chartsLoading && charts && (
          <>
            {/* Monthly completions bar */}
            {charts.monthly?.length > 0 && (
              <section>
                <div className="flex items-baseline gap-3 mb-2">
                  <h3 className="font-sans text-xs text-ice/40 uppercase tracking-widest">Books read</h3>
                  {monthDelta !== null && (
                    <ComparisonBadge delta={monthDelta} />
                  )}
                </div>
                <div className="rounded border border-smoke-light bg-smoke p-4" style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={charts.monthly}
                      margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
                      onClick={handleBarClick}
                      style={{ cursor: 'pointer' }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={ICE20} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: 'rgba(224,231,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: 'rgba(224,231,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} width={22} />
                      <Tooltip content={<MonthlyTooltip />} />
                      <Bar dataKey="booksRead" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        {charts.monthly.map((entry, i) => (
                          <Cell key={i} fill={entry.booksRead > 0 ? AMBER : 'rgba(224,231,255,0.08)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {charts.monthly.length > 0 && (
                  <p className="text-ice/25 text-[11px] mt-1.5 text-right">Click a bar to view books from that period</p>
                )}
              </section>
            )}

            {/* Pages area */}
            {charts.monthly?.some(m => m.pagesRead > 0) && (
              <section>
                <SectionTitle>Pages read</SectionTitle>
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
                      <XAxis dataKey="label" tick={{ fill: 'rgba(224,231,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'rgba(224,231,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip content={<PagesTooltip />} />
                      <Area type="monotone" dataKey="pagesRead" stroke={STEEL} strokeWidth={2}
                        fill="url(#pageGrad)" dot={false} activeDot={{ r: 4, fill: STEEL }} />
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
                      <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgba(224,231,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="label" width={24} tick={{ fill: AMBER, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v) => [v, 'Books']}
                        contentStyle={{ background: '#222', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12 }}
                        labelStyle={{ color: AMBER }}
                        itemStyle={{ color: 'rgba(224,231,255,0.8)' }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20} fill={AMBER} opacity={0.85} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}
          </>
        )}

        {/* Reading heatmap */}
        {heatmap?.days?.length > 0 && (
          <section>
            <SectionTitle>Reading activity</SectionTitle>
            <div className="overflow-x-auto">
              <ReadingHeatmap days={heatmap.days} />
            </div>
          </section>
        )}

        {/* Genre breakdown */}
        {stats?.genres?.length > 0 && (
          <section>
            <SectionTitle>Genre breakdown</SectionTitle>
            <GenreBreakdown genres={stats.genres} />
          </section>
        )}

        {/* Currently reading */}
        {reading.length > 0 && (
          <section>
            <SectionTitle>Currently reading</SectionTitle>
            <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
              {reading.map(book => <ReadingCard key={book.id} book={book} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/* ── Custom tooltips ─────────────────────────────────────────────────────────── */

function MonthlyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const { month, booksRead, pagesRead } = payload[0].payload
  // Build full date from YYYY-MM key
  const fullLabel = month
    ? new Date(`${month}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })
    : label
  return (
    <div className="bg-smoke border border-smoke-light rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-ice/60 mb-1.5 font-medium">{fullLabel}</p>
      <p className="text-amber font-semibold">{booksRead} book{booksRead !== 1 ? 's' : ''} read</p>
      {pagesRead > 0 && <p className="text-ice/40 mt-0.5">{fmtNumber(pagesRead)} pages</p>}
    </div>
  )
}

function PagesTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const { month, pagesRead, booksRead } = payload[0].payload
  const fullLabel = month
    ? new Date(`${month}-01`).toLocaleString('default', { month: 'long', year: 'numeric' })
    : label
  return (
    <div className="bg-smoke border border-smoke-light rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-ice/60 mb-1.5 font-medium">{fullLabel}</p>
      <p className="text-steel font-semibold">{fmtNumber(pagesRead)} pages</p>
      {booksRead > 0 && <p className="text-ice/40 mt-0.5">{booksRead} book{booksRead !== 1 ? 's' : ''}</p>}
    </div>
  )
}

/* ── Comparison badge ────────────────────────────────────────────────────────── */

function ComparisonBadge({ delta }) {
  if (delta === 0) return (
    <span className="inline-flex items-center gap-1 text-xs text-ice/30">
      <Minus size={11} /> Same as last month
    </span>
  )
  const positive = delta > 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${positive ? 'text-amber/70' : 'text-ice/30'}`}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {positive ? '+' : ''}{delta} vs last month
    </span>
  )
}

/* ── Reading card with progress controls ─────────────────────────────────────── */

function ReadingCard({ book }) {
  const { bg, fg, initials } = coverPlaceholder(book)
  const [imgError, setImgError] = useState(false)
  const [progress, setProgress] = useState(book.progress ?? 0)
  const [saving, setSaving] = useState(false)
  const upsertBook = useLibraryStore(s => s.upsertBook)
  const addToast   = useUIStore(s => s.addToast)
  const showCover = book.coverUrl && !imgError

  async function addPages(n) {
    if (saving || !book.pageCount) return
    const next = Math.min(book.pageCount, Math.max(0, progress + n))
    if (next === progress) return
    setSaving(true)
    try {
      const updated = await booksApi.updateStatus(book.id, { progress: next })
      setProgress(next)
      upsertBook({ ...book, ...updated })
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const pct = book.pageCount ? Math.round((progress / book.pageCount) * 100) : null

  return (
    <div className="flex gap-3 bg-smoke border border-smoke-light rounded p-3 w-full sm:w-64 shrink-0">
      <div
        className="w-12 h-16 rounded shrink-0 flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: bg }}
      >
        {showCover ? (
          <img src={book.coverUrl} alt={book.title} loading="lazy" onError={() => setImgError(true)}
            className="w-full h-full object-cover rounded" />
        ) : (
          <span className="font-serif font-bold text-sm select-none" style={{ color: fg }}>{initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-ice/90 text-sm font-medium leading-snug line-clamp-2">{book.title}</p>
        {book.rating > 0 && <p className="text-amber text-xs mt-0.5">{'★'.repeat(book.rating)}</p>}

        {/* Progress */}
        {book.pageCount ? (
          <div className="mt-2 space-y-1.5">
            <div className="h-1 bg-smoke-light rounded overflow-hidden">
              <div className="h-full bg-blood rounded transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ice/30 text-[10px]">p.{progress}/{book.pageCount} · {pct}%</span>
              <div className="flex gap-1">
                {[10, 25].map(n => (
                  <button
                    key={n}
                    onClick={() => addPages(n)}
                    disabled={saving || progress >= book.pageCount}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-smoke-light text-ice/50 hover:text-ice hover:bg-steel/30 transition-colors cursor-pointer disabled:opacity-30"
                  >
                    +{n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          book.pageCount === undefined && <p className="text-ice/30 text-xs mt-1">No page count</p>
        )}
      </div>
    </div>
  )
}

/* ── Stat card ───────────────────────────────────────────────────────────────── */

const COLOR_MAP = {
  amber: { text: 'text-amber', border: 'border-amber/20', bg: 'bg-amber/5' },
  blood: { text: 'text-blood', border: 'border-blood/20', bg: 'bg-blood/5' },
  steel: { text: 'text-steel', border: 'border-steel/20', bg: 'bg-steel/5' },
  ice:   { text: 'text-ice',   border: 'border-ice/10',   bg: 'bg-smoke'   },
}

function StatCard({ icon: Icon, label, value, color }) {
  const c          = COLOR_MAP[color] ?? COLOR_MAP.ice
  const isNumeric  = typeof value === 'number'
  const displayed  = useCountUp(isNumeric ? value : 0, { duration: 900, enabled: isNumeric })
  const shown      = isNumeric ? displayed : value
  return (
    <div className={`rounded border ${c.border} ${c.bg} p-5 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-ice/40 text-xs uppercase tracking-widest">{label}</span>
        <Icon size={14} className={`${c.text} opacity-60`} />
      </div>
      <span className={`font-serif text-3xl font-bold ${c.text} tabular-nums`}>{shown}</span>
    </div>
  )
}

/* ── Reading progress bar ────────────────────────────────────────────────────── */

function ReadingProgress({ stats }) {
  const { total, read, reading, wantToRead, didNotFinish } = stats
  const segments = [
    { key: 'read',         count: read,        color: AMBER,     label: 'Read'         },
    { key: 'reading',      count: reading,      color: BLOOD,     label: 'Reading'      },
    { key: 'want-to-read', count: wantToRead,   color: STEEL,     label: 'Want to read' },
    { key: 'dnf',          count: didNotFinish, color: '#3a3a3a', label: 'DNF'          },
  ].filter(s => s.count > 0)

  return (
    <div className="space-y-3">
      <div className="flex h-4 rounded overflow-hidden gap-px">
        {segments.map(seg => (
          <div key={seg.key} title={`${seg.label}: ${seg.count}`}
            style={{ width: `${(seg.count / total) * 100}%`, backgroundColor: seg.color }} />
        ))}
        {segments.reduce((s, x) => s + x.count, 0) < total && <div className="flex-1 bg-smoke-light" />}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {segments.map(seg => (
          <div key={seg.key} className="flex items-center gap-1.5 text-xs text-ice/50">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
            {seg.label}
            <span className="text-ice/30">{seg.count} ({Math.round((seg.count / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Genre breakdown ─────────────────────────────────────────────────────────── */

function GenreBreakdown({ genres }) {
  const max = genres[0]?.count ?? 1
  return (
    <div className="space-y-2">
      {genres.map(({ genre, count }) => (
        <div key={genre} className="flex items-center gap-3">
          <span className="text-ice/60 text-xs w-32 truncate capitalize shrink-0">{genre}</span>
          <div className="flex-1 h-2 bg-smoke-light rounded overflow-hidden">
            <div className="h-full rounded" style={{ width: `${(count / max) * 100}%`, backgroundColor: STEEL }} />
          </div>
          <span className="text-ice/30 text-xs w-8 text-right shrink-0">{count}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function SectionTitle({ children }) {
  return <h2 className="font-sans text-xs text-ice/40 uppercase tracking-widest mb-3">{children}</h2>
}

function fmtNumber(n) {
  if (!n) return '0'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
