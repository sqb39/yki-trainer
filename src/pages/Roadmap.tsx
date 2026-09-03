import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/schema'
import { ROADMAP_WEEKS, UNLOCK_THRESHOLD } from '../lib/chapters'
import { ProgressBar } from '../components/ProgressBar'

export function Roadmap() {
  const progress = useLiveQuery(() => db.progress.get('main'))
  const settings = useLiveQuery(() => db.settings.get('main'))
  const bossCount = useLiveQuery(
    () => db.bossSessions.filter((s) => s.completedAt != null).count(),
    [],
  )

  const chapterProgress = progress?.chapterProgress ?? {}
  const planStart = settings?.seededAt ?? new Date().toISOString().slice(0, 10)

  function weekStatus(week: number, chapterId: number | null): 'complete' | 'current' | 'upcoming' {
    if (week === 8) {
      const avg =
        [1, 2, 3, 4, 5, 6, 7].reduce((s, id) => s + (chapterProgress[id] ?? 0), 0) / 7
      if (avg >= 60) return 'complete'
      const allChaptersDone = [1, 2, 3, 4, 5, 6, 7].every(
        (id) => (chapterProgress[id] ?? 0) >= UNLOCK_THRESHOLD,
      )
      return allChaptersDone ? 'current' : 'upcoming'
    }
    const pct = chapterProgress[chapterId ?? 0] ?? 0
    if (pct >= UNLOCK_THRESHOLD) return 'complete'
    const prevDone =
      chapterId === 1 || (chapterProgress[(chapterId ?? 1) - 1] ?? 0) >= UNLOCK_THRESHOLD
    return prevDone ? 'current' : 'upcoming'
  }

  const statusStyles = {
    complete: 'border-emerald-200 bg-emerald-50',
    current: 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200',
    upcoming: 'border-slate-200 bg-white opacity-75',
  }

  const statusIcons = {
    complete: '✅',
    current: '▶️',
    upcoming: '⬜',
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Studieplan</h1>
        <p className="mt-2 text-slate-600">
          8-veckors roadmap — ~45–60 min/dag, 6 dagar/vecka. Plan start: {planStart}
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Daglig mall</h2>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          <li>15 min — due flashcards (SM-2)</li>
          <li>15 min — 1 dialog eller Vilket ord-quiz</li>
          <li>10 min — 1 talövning (Reagera/Berätta/Åsikt)</li>
          <li>15 min — skrivning (varannan dag) eller extra flashcards</li>
        </ul>
      </section>

      <div className="space-y-4">
        {ROADMAP_WEEKS.map((week) => {
          const status = weekStatus(week.week, week.chapterId)
          const pct = week.chapterId ? (chapterProgress[week.chapterId] ?? 0) : 0

          return (
            <div
              key={week.week}
              className={`rounded-xl border p-5 transition-colors ${statusStyles[status]}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-xl" aria-hidden>
                    {statusIcons[status]}
                  </span>
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {week.label} (dag {week.days})
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">{week.focus}</p>
                  </div>
                </div>
                {week.chapterId && (
                  <Link
                    to={`/chapters`}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Kapitel {week.chapterId} →
                  </Link>
                )}
              </div>
              {week.chapterId && (
                <ProgressBar percent={pct} label="Framsteg" className="mt-4 max-w-md" />
              )}
              {week.week === 8 && (
                <p className="mt-3 text-sm text-slate-600">
                  Boss-prov genomförda: {bossCount ?? 0} — mål: minst 2 under sista veckan
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
