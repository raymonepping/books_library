import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '../../store/useUIStore.js'

const TYPE_STYLE = {
  info:    'border-steel/40 bg-smoke',
  success: 'border-amber/40 bg-smoke',
  error:   'border-blood/40 bg-smoke',
  warning: 'border-amber-dim/60 bg-smoke',
}
const TYPE_DOT = {
  info:    'bg-steel',
  success: 'bg-amber',
  error:   'bg-blood',
  warning: 'bg-amber-dim',
}

function Toast({ id, message, type, action }) {
  const removeToast = useUIStore(s => s.removeToast)

  useEffect(() => {
    // Action toasts stay longer so the user has time to click
    const delay = action ? 6000 : 4000
    const t = setTimeout(() => removeToast(id), delay)
    return () => clearTimeout(t)
  }, [id, removeToast, action])

  return (
    <div
      role="status"
      className={[
        'flex items-start gap-3 px-4 py-3 rounded border text-sm text-ice/90',
        'shadow-lg min-w-[240px] max-w-xs',
        TYPE_STYLE[type] ?? TYPE_STYLE.info,
      ].join(' ')}
    >
      <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[type] ?? TYPE_DOT.info}`} />
      <span className="flex-1">{message}</span>
      {action && (
        <button
          onClick={() => { action.onClick(); removeToast(id) }}
          className="shrink-0 text-amber hover:text-amber/80 text-xs font-semibold transition-colors cursor-pointer underline underline-offset-2"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={() => removeToast(id)}
        aria-label="Dismiss"
        className="text-ice/40 hover:text-ice shrink-0 cursor-pointer mt-0.5"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export default function ToastStack() {
  const toasts = useUIStore(s => s.toasts)
  if (!toasts.length) return null

  return (
    /* aria-live="polite" announces new toasts to screen readers without interrupting */
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 flex flex-col gap-2 z-[60]"
    >
      {toasts.map(t => <Toast key={t.id} {...t} />)}
    </div>
  )
}
