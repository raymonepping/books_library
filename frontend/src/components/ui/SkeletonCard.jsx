// Animated skeleton placeholder — mirrors BookCard proportions
function pulse() {
  return 'bg-smoke-light animate-pulse rounded'
}

export function SkeletonBookCard() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className={`${pulse()} w-full`} style={{ aspectRatio: '2/3' }} />
      <div className="px-0.5 space-y-1.5">
        <div className={`${pulse()} h-3 w-4/5`} />
        <div className={`${pulse()} h-2.5 w-3/5`} />
      </div>
    </div>
  )
}

export function SkeletonListRow() {
  return (
    <div className="flex items-center gap-4 px-3 py-3">
      <div className={`${pulse()} w-10 h-14 shrink-0`} />
      <div className="flex-1 space-y-1.5">
        <div className={`${pulse()} h-3 w-3/5`} />
        <div className={`${pulse()} h-2.5 w-2/5`} />
      </div>
      <div className={`${pulse()} h-5 w-16 shrink-0`} />
    </div>
  )
}

export function SkeletonStatCard() {
  return (
    <div className="rounded border border-smoke-light p-5 space-y-3">
      <div className={`${pulse()} h-3 w-1/2`} />
      <div className={`${pulse()} h-8 w-1/3`} />
    </div>
  )
}
