import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '../store/useUIStore.js'

const IGNORE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function inTextField() {
  const el = document.activeElement
  return IGNORE_TAGS.has(el?.tagName) || el?.isContentEditable
}

export function useKeyboardShortcuts(onShowHelp) {
  const navigate = useNavigate()

  useEffect(() => {
    function handler(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (inTextField()) return

      switch (e.key) {
        case '/':
          e.preventDefault()
          navigate('/discover')
          setTimeout(() => document.dispatchEvent(new CustomEvent('focus-discover-search')), 60)
          break
        case '?':
          e.preventDefault()
          onShowHelp()
          break
        case 'n':
          e.preventDefault()
          useUIStore.getState().setAddBookOpen(true)
          break
        case 'b':
          navigate('/books')
          break
        case 'd':
          navigate('/dashboard')
          break
        case 'a':
          navigate('/authors')
          break
        case 's':
          navigate('/series')
          break
        default:
          break
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate, onShowHelp])
}
