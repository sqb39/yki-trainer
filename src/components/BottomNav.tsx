import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { MobileMoreMenu } from './MobileMoreMenu'

const primaryItems = [
  { to: '/', label: 'Hem', icon: '🏠', end: true },
  { to: '/flashcards', label: 'Kort', icon: '🃏' },
  { to: '/quiz', label: 'Quiz', icon: '❓' },
  { to: '/speaking', label: 'Tala', icon: '🎤' },
] as const

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Huvudnavigering"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {primaryItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : undefined}
              className={({ isActive }) =>
                `flex min-h-14 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium transition-colors active:scale-95 ${
                  isActive ? 'text-indigo-600' : 'text-slate-500'
                }`
              }
            >
              <span className="text-lg leading-none" aria-hidden>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex min-h-14 min-w-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-slate-500 transition-colors active:scale-95"
            aria-label="Fler sidor"
          >
            <span className="text-lg leading-none" aria-hidden>
              ☰
            </span>
            <span>Mer</span>
          </button>
        </div>
      </nav>

      <MobileMoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}
