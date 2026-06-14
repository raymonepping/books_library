import { useState, useEffect, useRef } from 'react'

export function useCountUp(target, { duration = 900, enabled = true } = {}) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!enabled || typeof target !== 'number') {
      setValue(typeof target === 'number' ? target : 0)
      return
    }
    const start = performance.now()
    function tick(now) {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - t) ** 3   // ease-out cubic
      setValue(Math.round(eased * target))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration, enabled])

  return value
}
