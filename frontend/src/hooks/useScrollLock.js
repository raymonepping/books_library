import { useEffect } from 'react'

export function useScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const prevOverflow = document.body.style.overflow
    const prevPr       = document.body.style.paddingRight
    // Account for scrollbar width to prevent layout shift
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow     = 'hidden'
    document.body.style.paddingRight = `${scrollbarW}px`
    return () => {
      document.body.style.overflow     = prevOverflow
      document.body.style.paddingRight = prevPr
    }
  }, [enabled])
}
