import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '../../store/useUIStore.js'

const TYPE_STYLE = {
  info:    'border-steel/40 bg-smoke',
  success: 'border-amber/40 bg-smoke',
  error:   'border-blood/40 bg-smoke',
}

function Toast({ id, message, type }) {
  const removeToast = useUIStore(s => s.removeToast)

  useEffect(() => {
    const t = setTimeout(() => removeToast(id), 4000)
    return () => clearTimeout(t)
  }, [id, removeToast])

  return (
    <div
      className={[
        'flex items-start gap-3 px-4 py-3 rounded border text-sm text-ice/90',
        'shadow-lg min-w-[240px] max-w-xs',
        TYPE_STYLE[type] ?? TYPE_STYLE.info,
      ].join(' ')}
    >
      <span className="flex-1">{message}</span>
      <button
        onClick={() => removeToast(id)}
        className="text-ice/40 hover:text-ice shrink-0 cursor-pointer"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastStack() {
  const toasts = useUIStore(s => s.toasts)
  if (!toasts.length) return null

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
      {toasts.map(t => <Toast key={t.id} {...t} />)}
    </div>
  )
}
