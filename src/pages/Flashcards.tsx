import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { db, type Card } from '../db/schema'
import {
  CARD_TYPE_LABELS,
  getDueCards,
  previewInterval,
  RATING_BUTTONS,
  type CardTypeFilter,
} from '../lib/flashcards'
import { recordFlashcardReview, updateCardBack } from '../lib/progress'
import type { Sm2Rating } from '../lib/sm2'
import { XP_REWARDS } from '../lib/xp'
import { ProgressBar } from '../components/ProgressBar'

export function Flashcards() {
  const chapters = useLiveQuery(async () => {
    const cards = await db.cards.toArray()
    return [...new Set(cards.map((c) => c.chapterId))].sort((a, b) => a - b)
  })
  const [chapterFilter, setChapterFilter] = useState<number | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<CardTypeFilter>('all')
  const [sessionActive, setSessionActive] = useState(false)
  const [sessionComplete, setSessionComplete] = useState(false)
  const [queue, setQueue] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [rating, setRating] = useState(false)
  const [lastXp, setLastXp] = useState<number | null>(null)
  const [sessionXp, setSessionXp] = useState(0)
  const [editingBack, setEditingBack] = useState(false)
  const [backDraft, setBackDraft] = useState('')

  const dueCards = useLiveQuery(
    () => getDueCards(chapterFilter, typeFilter),
    [chapterFilter, typeFilter],
  )

  const current = queue[index]
  const progressPercent =
    queue.length > 0 ? Math.round((index / queue.length) * 100) : 0

  const startSession = useCallback(() => {
    if (!dueCards?.length) return
    setQueue([...dueCards])
    setIndex(0)
    setFlipped(false)
    setSessionComplete(false)
    setSessionXp(0)
    setLastXp(null)
    setSessionActive(true)
  }, [dueCards])

  const endSession = useCallback(() => {
    setSessionActive(false)
    setQueue([])
    setIndex(0)
    setFlipped(false)
    setEditingBack(false)
  }, [])

  const handleRate = useCallback(
    async (sm2Rating: Sm2Rating) => {
      const card = queue[index]
      if (!card?.id || rating) return
      setRating(true)
      try {
        const { xpGained } = await recordFlashcardReview(card.id, sm2Rating, card)
        setLastXp(xpGained)
        setSessionXp((prev) => prev + xpGained)
        setFlipped(false)
        setEditingBack(false)

        if (index + 1 >= queue.length) {
          setSessionActive(false)
          setSessionComplete(true)
        } else {
          setIndex((i) => i + 1)
        }
      } finally {
        setRating(false)
      }
    },
    [queue, index, rating],
  )

  async function saveBack() {
    if (!current?.id) return
    await updateCardBack(current.id, backDraft.trim())
    setEditingBack(false)
    const updated = { ...current, backFi: backDraft.trim() }
    setQueue((q) => q.map((c, i) => (i === index ? updated : c)))
  }

  useEffect(() => {
    setFlipped(false)
    setEditingBack(false)
    setBackDraft(current?.backFi ?? '')
  }, [index, current?.id, current?.backFi])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!sessionActive || editingBack || rating) return
      if (e.code === 'Space' && !flipped) {
        e.preventDefault()
        setFlipped(true)
      }
      if (flipped) {
        const map: Record<string, Sm2Rating> = {
          '1': 1,
          '2': 2,
          '3': 3,
          '4': 4,
        }
        if (map[e.key]) {
          e.preventDefault()
          void handleRate(map[e.key])
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sessionActive, flipped, editingBack, rating, handleRate])

  if (sessionActive && current) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={endSession}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Avsluta
          </button>
          <span className="text-sm text-slate-600">
            {index + 1} / {queue.length}
          </span>
          <span className="text-sm font-medium text-indigo-600">+{sessionXp} XP</span>
        </div>

        <ProgressBar percent={progressPercent} />

        <button
          type="button"
          onClick={() => !flipped && setFlipped(true)}
          className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md min-h-56 flex flex-col justify-center active:scale-[0.99] sm:p-8"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {CARD_TYPE_LABELS[current.type]}
            </span>
            <span className="text-xs text-slate-400">Kapitel {current.chapterId}</span>
          </div>

          {!flipped ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Svenska
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{current.frontSv}</p>
              {current.contextSv && (
                <p className="mt-2 text-sm text-slate-500">{current.contextSv}</p>
              )}
              <p className="mt-6 text-center text-sm text-slate-400">
                Klicka eller tryck mellanslag för att vända
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Finska
              </p>
              {editingBack ? (
                <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={backDraft}
                    onChange={(e) => setBackDraft(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg"
                    placeholder="Skriv din översättning eller anteckning…"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveBack}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
                    >
                      Spara
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBack(false)
                        setBackDraft(current.backFi)
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                    >
                      Avbryt
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-xl text-slate-800 whitespace-pre-wrap">
                    {current.backFi || (
                      <span className="italic text-slate-400">Ingen översättning ännu</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setBackDraft(current.backFi)
                      setEditingBack(true)
                    }}
                    className="mt-3 text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Redigera svar
                  </button>
                </>
              )}
            </>
          )}
        </button>

        {flipped && !editingBack && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATING_BUTTONS.map((btn) => (
              <button
                key={btn.rating}
                type="button"
                disabled={rating}
                onClick={() => void handleRate(btn.rating)}
                className={`rounded-xl border px-3 py-4 text-center transition disabled:opacity-50 min-h-[4.5rem] active:scale-95 ${btn.className}`}
              >
                <span className="block text-sm font-semibold">{btn.label}</span>
                <span className="block text-xs opacity-80">{btn.sublabel}</span>
                <span className="mt-1 block text-xs font-medium opacity-70">
                  {previewInterval(current, btn.rating)}
                </span>
              </button>
            ))}
          </div>
        )}

        {lastXp != null && lastXp > XP_REWARDS.flashcard && (
          <p className="text-center text-sm font-medium text-amber-600">
            Dagligt uppdrag klart! +{lastXp - XP_REWARDS.flashcard} bonus XP
          </p>
        )}

        <p className="text-center text-xs text-slate-400">
          Tangentbord: 1–4 för betyg efter att kortet vänts
        </p>
      </div>
    )
  }

  if (sessionComplete) {
    return (
      <div className="mx-auto max-w-md space-y-6 text-center">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
          <p className="text-4xl">✓</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">Session klar!</h2>
          <p className="mt-2 text-slate-600">
            Du repeterade {queue.length} kort och tjänade {sessionXp} XP.
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSessionComplete(false)
              startSession()
            }}
            disabled={!dueCards?.length}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Fortsätt ({dueCards?.length ?? 0} kvar)
          </button>
          <button
            type="button"
            onClick={() => setSessionComplete(false)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Tillbaka
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Flashcards</h1>
        <p className="mt-1 text-slate-600">
          SM-2 repetition — svenska på framsidan, finska på baksidan
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Filter</h2>
        <div className="mt-4 flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Kapitel</span>
            <select
              value={chapterFilter}
              onChange={(e) =>
                setChapterFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="all">Alla kapitel</option>
              {(chapters ?? []).map((id) => (
                <option key={String(id)} value={String(id)}>
                  Kapitel {String(id)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Typ</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as CardTypeFilter)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="all">Alla typer</option>
              <option value="vocab">Ord</option>
              <option value="verb">Verb</option>
              <option value="dialogue">Dialog</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-5xl font-bold text-indigo-600">{dueCards?.length ?? '…'}</p>
        <p className="mt-2 text-slate-600">kort att repetera nu</p>
        <p className="mt-1 text-sm text-slate-400">
          +{XP_REWARDS.flashcard} XP per kort
        </p>
        <button
          type="button"
          onClick={startSession}
          disabled={!dueCards?.length}
          className="mt-6 rounded-lg bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 min-h-12 active:scale-[0.98]"
        >
          {dueCards?.length ? 'Starta repetition' : 'Inga kort just nu'}
        </button>
      </section>
    </div>
  )
}
