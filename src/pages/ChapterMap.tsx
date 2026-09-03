import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { db } from '../db/schema'
import { getChapters } from '../lib/book'
import {
  getChapterTitle,
  isChapterUnlocked,
  UNLOCK_THRESHOLD,
} from '../lib/chapters'
import { ProgressBar } from '../components/ProgressBar'

export function ChapterMap() {
  const progress = useLiveQuery(() => db.progress.get('main'))
  const bossCompleted = useLiveQuery(async () => {
    const sessions = await db.bossSessions.filter((s) => s.completedAt != null).toArray()
    return new Set(sessions.map((s) => s.chapterId))
  }, [])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const chapters = getChapters()
  const chapterProgress = progress?.chapterProgress ?? {}
  const unlocked = progress?.unlockedChapters ?? [1]

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Kapitelkarta</h1>
        <p className="mt-2 text-slate-600">
          7 teman — lås upp nästa kapitel efter {UNLOCK_THRESHOLD} % i föregående
        </p>
      </header>

      <div className="relative">
        <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-slate-200" aria-hidden />
        <div className="space-y-6">
          {chapters.map((chapter) => {
            const pct = chapterProgress[chapter.id] ?? 0
            const locked = !isChapterUnlocked(chapter.id, unlocked, chapterProgress)
            const bossDone = bossCompleted?.has(chapter.id) ?? false
            const isSelected = selectedId === chapter.id

            return (
              <div
                key={chapter.id}
                className={`relative ml-0 rounded-xl border p-5 pl-14 transition-colors ${
                  locked
                    ? 'border-slate-200 bg-slate-50 opacity-60'
                    : pct >= UNLOCK_THRESHOLD
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div
                  className={`absolute left-3 top-6 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                    locked
                      ? 'bg-slate-300 text-slate-600'
                      : pct >= UNLOCK_THRESHOLD
                        ? 'bg-emerald-500 text-white'
                        : 'bg-indigo-500 text-white'
                  }`}
                >
                  {locked ? '🔒' : chapter.id}
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : chapter.id)}
                  className="w-full text-left"
                  disabled={locked}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {chapter.id}. {chapter.title_sv}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {chapter.dialogues.length} dialoger · {chapter.vocabulary.length} ord ·{' '}
                        {chapter.writing.length} skrivuppgifter
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-indigo-600">{pct}%</span>
                      {bossDone && (
                        <p className="text-xs text-amber-700">👑 Boss klar</p>
                      )}
                    </div>
                  </div>
                  {!locked && (
                    <ProgressBar percent={pct} className="mt-3 max-w-md" />
                  )}
                </button>

                {isSelected && !locked && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                    <Link
                      to="/flashcards"
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Flashcards
                    </Link>
                    <Link
                      to="/dialogues"
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Dialoger
                    </Link>
                    <Link
                      to="/speaking"
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Tala
                    </Link>
                    <Link
                      to="/writing"
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Skriva
                    </Link>
                    <Link
                      to={`/boss/${chapter.id}`}
                      className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-200"
                    >
                      👑 Boss-prov
                    </Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {selectedId && (
        <p className="text-sm text-slate-500">
          Valt: {getChapterTitle(selectedId)}
        </p>
      )}
    </div>
  )
}
