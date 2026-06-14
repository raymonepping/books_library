import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap.js'

const SHORTCUTS = [
  { keys: ['/', 'Ctrl+F'], label: 'Focus search (Discover)' },
  { keys: ['n'],           label: 'Add new book'            },
  { keys: ['b'],           label: 'Go to Library'           },
  { keys: ['d'],           label: 'Go to Dashboard'         },
  { keys: ['a'],           label: 'Go to Authors'           },
  { keys: ['s'],           label: 'Go to Series'            },
  { keys: ['?'],           label: 'Show this help'          },
  { keys: ['Esc'],         label: 'Close panels/modals'     },
]

export default function KeyboardShortcutsModal({ onClose }) {
  const ref = useRef(null)
  useFocusTrap(ref, true)

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-noir/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-smoke border border-smoke-light rounded-xl shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-ice text-lg">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ice/40 hover:text-ice transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <ul className="space-y-2.5">
          {SHORTCUTS.map(({ keys, label }) => (
            <li key={label} className="flex items-center justify-between">
              <span className="text-ice/60 text-sm">{label}</span>
              <span className="flex gap-1">
                {keys.map(k => (
                  <kbd
                    key={k}
                    className="px-2 py-0.5 rounded bg-smoke-dark border border-smoke-light text-amber text-xs font-mono"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-ice/25 text-[11px]">Shortcuts are disabled when typing in fields.</p>
      </div>
    </>
  )
}
