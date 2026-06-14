import { useMemo } from 'react'

const DAYS  = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function dayColor(count) {
  if (count === 0) return 'rgba(224,231,255,0.05)'
  if (count === 1) return '#2d4a73'  // steel-dim
  if (count === 2) return '#4a6fa5'  // steel
  return '#e8a020'                   // amber — 3+
}

export default function ReadingHeatmap({ days = [] }) {
  const { weeks, monthLabels } = useMemo(() => {
    if (!days.length) return { weeks: [], monthLabels: [] }

    const dayMap = new Map(days.map(d => [d.date, d.count]))

    // Start from the Sunday before or on the first day
    const first = new Date(days[0].date + 'T00:00:00')
    const startSunday = new Date(first)
    startSunday.setDate(first.getDate() - first.getDay())

    const last = new Date(days[days.length - 1].date + 'T00:00:00')
    const endSaturday = new Date(last)
    endSaturday.setDate(last.getDate() + (6 - last.getDay()))

    const allWeeks = []
    const labels = []
    let cur = new Date(startSunday)
    let weekIndex = 0

    while (cur <= endSaturday) {
      const week = []
      for (let dow = 0; dow < 7; dow++) {
        const iso = cur.toISOString().slice(0, 10)
        week.push({ date: iso, count: dayMap.get(iso) ?? 0, inRange: iso >= days[0].date && iso <= days[days.length - 1].date })
        if (dow === 0 && (weekIndex === 0 || cur.getDate() <= 7)) {
          labels.push({ weekIndex, month: MONTHS[cur.getMonth()] })
        }
        cur.setDate(cur.getDate() + 1)
      }
      allWeeks.push(week)
      weekIndex++
    }

    return { weeks: allWeeks, monthLabels: labels }
  }, [days])

  const totalBooks = days.reduce((s, d) => s + d.count, 0)
  const activeDays = days.filter(d => d.count > 0).length

  if (!weeks.length) return (
    <div className="text-ice/25 text-sm text-center py-8">No reading data yet</div>
  )

  return (
    <div className="space-y-2">
      {/* Month labels */}
      <div className="flex gap-[3px] ml-6">
        {weeks.map((_, wi) => {
          const label = monthLabels.find(l => l.weekIndex === wi)
          return (
            <div key={wi} className="w-3 shrink-0 text-[9px] text-ice/25 text-center">
              {label ? label.month : ''}
            </div>
          )
        })}
      </div>

      {/* Grid */}
      <div className="flex gap-1">
        {/* Day-of-week labels */}
        <div className="flex flex-col gap-[3px] mr-1">
          {DAYS.map((d, i) => (
            <div key={i} className="w-3 h-3 flex items-center justify-end">
              <span className="text-[9px] text-ice/20">{i % 2 === 1 ? d : ''}</span>
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="flex gap-[3px] overflow-x-auto no-scrollbar">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map(({ date, count, inRange }) => (
                <div
                  key={date}
                  title={inRange ? `${date}: ${count} book${count !== 1 ? 's' : ''}` : ''}
                  className="w-3 h-3 rounded-sm transition-colors duration-150"
                  style={{ backgroundColor: inRange ? dayColor(count) : 'transparent' }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend + summary */}
      <div className="flex items-center justify-between mt-1">
        <p className="text-ice/25 text-[11px]">
          {totalBooks} book{totalBooks !== 1 ? 's' : ''} across {activeDays} day{activeDays !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-1.5 text-[9px] text-ice/20">
          <span>Less</span>
          {['rgba(224,231,255,0.05)', '#2d4a73', '#4a6fa5', '#e8a020'].map((c, i) => (
            <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}
