import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

export default function ReaderProfile({ profile, onRecalculate }) {
  const [recalculating, setRecalculating] = useState(false)

  async function handleRecalculate() {
    if (recalculating || !onRecalculate) return
    setRecalculating(true)
    try {
      await onRecalculate()
    } finally {
      setRecalculating(false)
    }
  }

  if (!profile) return null

  const {
    portrait,
    structuredProfile = {},
    stats = {},
  } = profile

  // Extract data from structuredProfile
  const {
    dominantSubgenres = [],
    dominantTone = [],
    recurringThemes = [],
    geographies = [],
    authorOrbit = [],
    comparablePool = [],
    modusOperandi = '',
  } = structuredProfile

  const booksAnalyzed = Math.round(stats.totalBooksWeighted || 0)
  const seriesAnalyzed = stats.seriesContributing || 0
  const lastCalculated = stats.lastRecalculated

  // Calculate confidence (0-5 dots)
  const confidence = Math.min(5, Math.floor((booksAnalyzed / 40) + 1))
  const confText = confidence >= 4 ? 'HIGH' : confidence >= 2 ? 'MEDIUM' : 'LOW'

  return (
    <div className="bg-[#F0EDE6] border-2 border-black rounded-sm overflow-hidden shadow-[5px_5px_0_#8B1A1A,6px_6px_0_#141414] font-mono">
      {/* Header */}
      <div className="bg-black px-5 py-4 border-b-[3px] border-[#8B1A1A] flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-[#9A9A9A] uppercase mb-1.5">
            Bibliotheek · Reader Intelligence File
          </div>
          <div className="font-serif text-[24px] text-[#F0EDE6] leading-tight">
            Serial Reader<br/>Psychological Profile
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[11px] text-[#9A9A9A] tracking-wider leading-relaxed">
            FILE #2026-RDR-001
          </div>
          <div className="text-[11px] text-[#9A9A9A] tracking-wider leading-relaxed">
            CLASSIFICATION: PERSONAL
          </div>
          <div className="inline-block mt-2 text-[11px] font-bold tracking-[0.18em] uppercase border-2 border-[#C9961A] text-[#C9961A] px-2 py-0.5 rounded-sm">
            ● Active
          </div>
        </div>
      </div>

      {/* Body - Two columns */}
      <div className="grid grid-cols-[420px_1fr]">

        {/* Left sidebar */}
        <div className="border-r-2 border-black p-6 bg-[#E8E4DA]">
          <div className="text-[11px] tracking-[0.18em] uppercase text-[#9A9A9A] mb-1.5 font-bold">
            Subject
          </div>
          <div className="font-serif text-[28px] text-[#1E1E1E] mb-3.5 border-b border-dashed border-[#9A9A9A] pb-3">
            {profile.subject || 'Raymon E.'}
          </div>

          {/* Portrait */}
          {portrait && (
            <div className="text-[14px] leading-[1.85] text-[#444] border-l-[3px] border-[#8B1A1A] pl-3 mb-4 italic">
              {portrait}
            </div>
          )}

          {/* Meta stats */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px] text-[#555]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8B1A1A] flex-shrink-0" />
              {booksAnalyzed} books catalogued
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#555]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#8B1A1A] flex-shrink-0" />
              {seriesAnalyzed} active series
            </div>
            {stats.avgRating && (
              <div className="flex items-center gap-2 text-[13px] text-[#555]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#8B1A1A] flex-shrink-0" />
                avg rating {stats.avgRating.toFixed(1)} ★
              </div>
            )}
          </div>

          {/* Confidence */}
          <div className="mt-4 pt-3.5 border-t border-dashed border-[#bbb]">
            <div className="text-[11px] tracking-[0.12em] uppercase text-[#9A9A9A] mb-2">
              Profile confidence
            </div>
            <div className="flex gap-1.5 items-center">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full border-[1.5px] ${
                    i < confidence
                      ? 'bg-[#C9961A] border-[#C9961A]'
                      : 'border-[#9A9A9A]'
                  }`}
                />
              ))}
              <span className="text-[11px] text-[#9A9A9A] ml-1.5 tracking-wider">
                {confText}
              </span>
            </div>
          </div>
        </div>

        {/* Right content */}
        <div className="p-5 bg-[#F0EDE6]">
          <div className="flex flex-col">

            {/* Subgenre */}
            {dominantSubgenres.length > 0 && (
              <FindingRow label="Subgenre">
                <div className="flex flex-col gap-1.5">
                  {dominantSubgenres.slice(0, 3).map((item, i) => {
                    const weight = typeof item === 'string' ? 0.5 : (item.weight || 0.5)
                    const name = typeof item === 'string' ? item : item.name
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[12px] text-[#666] w-52 flex-shrink-0">
                          {name}
                        </span>
                        <div className="flex-1 h-[3px] bg-[#D8D2C6] rounded-sm overflow-hidden">
                          <div
                            className={`h-full rounded-sm ${
                              i === 0 ? 'bg-[#8B1A1A]' : i === 1 ? 'bg-[#A8C4D4] brightness-80' : 'bg-[#C9961A]'
                            }`}
                            style={{ width: `${weight * 100}%` }}
                          />
                        </div>
                        <span className="text-[12px] text-[#9A9A9A] w-8 text-right flex-shrink-0 tabular-nums">
                          {Math.round(weight * 100)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </FindingRow>
            )}

            {/* Modus Operandi */}
            {modusOperandi && (
              <FindingRow label="Modus operandi">
                <div className="text-[14px] text-[#4A4A4A] leading-[1.55]">
                  {modusOperandi}
                </div>
              </FindingRow>
            )}

            {/* Recurring Themes */}
            {recurringThemes.length > 0 && (
              <FindingRow label="Recurring themes">
                <div className="flex flex-wrap gap-1">
                  {recurringThemes.slice(0, 6).map((theme, i) => (
                    <span
                      key={i}
                      className={`inline-block text-[12px] px-2 py-0.5 rounded-sm border ${
                        i < 2
                          ? 'bg-[rgba(139,26,26,0.1)] text-[#8B1A1A] border-[rgba(139,26,26,0.3)]'
                          : i < 4
                          ? 'bg-[rgba(168,196,212,0.2)] text-[#3A7A9A] border-[rgba(168,196,212,0.5)]'
                          : 'bg-[rgba(154,154,154,0.12)] text-[#555] border-[rgba(154,154,154,0.3)]'
                      }`}
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </FindingRow>
            )}

            {/* Geography */}
            {geographies.length > 0 && (
              <FindingRow label="Geography">
                <div className="flex flex-wrap gap-1">
                  {geographies.slice(0, 6).map((geo, i) => {
                    const isNordic = ['Norway', 'Sweden', 'Denmark', 'Iceland', 'Finland'].some(c =>
                      geo.includes(c)
                    )
                    const isSpain = geo.includes('Spain')
                    return (
                      <span
                        key={i}
                        className={`inline-block text-[12px] px-2 py-0.5 rounded-sm border ${
                          isNordic
                            ? 'bg-[rgba(168,196,212,0.2)] text-[#3A7A9A] border-[rgba(168,196,212,0.5)]'
                            : isSpain
                            ? 'bg-[rgba(201,150,26,0.12)] text-[#8A6600] border-[rgba(201,150,26,0.3)]'
                            : 'bg-[rgba(154,154,154,0.12)] text-[#555] border-[rgba(154,154,154,0.3)]'
                        }`}
                      >
                        {geo}
                      </span>
                    )
                  })}
                </div>
              </FindingRow>
            )}

            {/* Known Associates (Author Orbit) */}
            {authorOrbit.length > 0 && (
              <FindingRow label="Known associates">
                <div className="text-[14px] text-[#4A4A4A] leading-[1.55]">
                  {authorOrbit.slice(0, 9).join(' · ')}
                </div>
              </FindingRow>
            )}

            {/* Persons of Interest */}
            {comparablePool.length > 0 && (
              <FindingRow label="Persons of interest" isLast>
                <div className="flex flex-col gap-1">
                  {comparablePool.slice(0, 4).map((person, i) => (
                    <div key={i} className="text-[13px] text-[#8B1A1A] flex items-start gap-1.5">
                      <span className="text-[11px] mt-0.5">▸</span>
                      <span>{person}</span>
                    </div>
                  ))}
                </div>
              </FindingRow>
            )}

          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t-2 border-black px-5 py-2.5 flex items-center justify-between bg-black">
        <span className="text-[12px] text-[#9A9A9A] tracking-wider">
          Last updated <span className="text-[#C9961A] font-bold">
            {lastCalculated ? new Date(lastCalculated).toLocaleDateString() : 'N/A'}
          </span>
        </span>

        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          title="Recalculate reader profile"
          className="flex items-center gap-2 text-[11px] tracking-[0.12em] uppercase text-[#9A9A9A] hover:text-[#C9961A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="relative flex items-center justify-center w-2 h-2">
            {recalculating ? (
              <>
                <span className="absolute inline-flex w-full h-full rounded-full bg-[#22c55e] opacity-75 animate-ping" />
                <span className="relative w-2 h-2 rounded-full bg-[#22c55e]" />
              </>
            ) : (
              <>
                <span className="absolute inline-flex w-full h-full rounded-full bg-[#3b82f6] opacity-50 animate-pulse" />
                <span className="relative w-2 h-2 rounded-full bg-[#3b82f6]" />
              </>
            )}
          </span>
          <RefreshCw size={11} className={recalculating ? 'animate-spin' : ''} />
          {recalculating ? 'Recalculating…' : 'Recalculate'}
        </button>
      </div>
    </div>
  )
}

function FindingRow({ label, children, isLast = false }) {
  return (
    <div className={`grid grid-cols-[200px_1fr] items-start gap-3 py-3 ${!isLast ? 'border-b border-[#D8D2C6]' : ''}`}>
      <div className="text-[12px] font-bold tracking-[0.1em] uppercase text-[#1E1E1E] pt-0.5 whitespace-nowrap flex items-center gap-1.5">
        <span>{label}</span>
        <div className="flex-1 border-b border-dashed border-[#C0B8A8]" />
      </div>
      <div>{children}</div>
    </div>
  )
}

// Made with Bob
