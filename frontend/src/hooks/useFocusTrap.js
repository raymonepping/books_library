import { useEffect } from 'react'

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function useFocusTrap(ref, enabled = true) {
  useEffect(() => {
    if (!enabled || !ref.current) return
    const container = ref.current
    const previouslyFocused = document.activeElement

    // Auto-focus first focusable element inside the container
    const firstFocusable = container.querySelector(FOCUSABLE_SELECTORS)
    firstFocusable?.focus()

    function handleKeyDown(e) {
      if (e.key !== 'Tab') return
      const items = [...container.querySelectorAll(FOCUSABLE_SELECTORS)].filter(
        el => !el.closest('[hidden]') && el.offsetParent !== null
      )
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0]
      const last  = items[items.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus to where it was before the trap opened
      previouslyFocused?.focus?.()
    }
  }, [ref, enabled])
}
