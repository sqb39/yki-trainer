import { NavLink, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { Dashboard } from './pages/Dashboard'
import { Flashcards } from './pages/Flashcards'
import { Quiz } from './pages/Quiz'
import { Dialogues } from './pages/Dialogues'
import { Speaking } from './pages/Speaking'
import { Writing } from './pages/Writing'
import { Roadmap } from './pages/Roadmap'
import { ChapterMap } from './pages/ChapterMap'
import { Boss } from './pages/Boss'
import { Settings } from './pages/Settings'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/flashcards', label: 'Flashcards' },
  { to: '/quiz', label: 'Quiz' },
  { to: '/dialogues', label: 'Dialoger' },
  { to: '/speaking', label: 'Tala' },
  { to: '/writing', label: 'Skriva' },
  { to: '/roadmap', label: 'Plan' },
  { to: '/chapters', label: 'Kapitel' },
  { to: '/settings', label: 'Inställningar' },
] as const

function NavItem({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-indigo-100 text-indigo-800'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row">
        <nav className="hidden border-b border-slate-200 bg-white p-4 lg:block lg:w-56 lg:border-b-0 lg:border-r">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            YKI B1
          </p>
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                label={item.label}
                end={'end' in item ? item.end : undefined}
              />
            ))}
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur lg:hidden">
            <p className="text-sm font-semibold text-slate-900">YKI B1 Trainer</p>
          </header>

          <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/flashcards" element={<Flashcards />} />
              <Route path="/quiz" element={<Quiz />} />
              <Route path="/dialogues" element={<Dialogues />} />
              <Route path="/speaking" element={<Speaking />} />
              <Route path="/writing" element={<Writing />} />
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/chapters" element={<ChapterMap />} />
              <Route path="/boss/:chapterId" element={<Boss />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
