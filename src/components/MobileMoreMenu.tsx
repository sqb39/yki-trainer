import { NavLink } from 'react-router-dom'
import { useEffect } from 'react'

const moreItems = [
  { to: '/dialogues', label: 'Dialoger', icon: '💬' },
  { to: '/writing', label: 'Skriva', icon: '✍️' },
  { to: '/roadmap', label: 'Plan', icon: '📅' },
  { to: '/chapters', label: 'Kapitel', icon: '🗺️' },
  { to: '/settings', label: 'Inställningar', icon: '⚙️' },
] as const

interface MobileMoreMenuProps {
  open: boolean
  onClose: () => void
}

export function MobileMoreMenu({ open, onClose }: MobileMoreMenuProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Fler sidor">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-label="Stäng meny"
      />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-xl"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Fler sidor</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Stäng"
          >
            ✕
          </button>
        </div>
        <div className="grid gap-1">
          {moreItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors active:scale-[0.98] ${
                  isActive
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'text-slate-700 hover:bg-slate-50'
                }`
              }
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
}
