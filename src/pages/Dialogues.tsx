import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/schema'
import { getChapter, getChapterIds } from '../lib/book'
import { recordDialogueSession } from '../lib/progress'
import { XP_REWARDS } from '../lib/xp'
import { ProgressBar } from '../components/ProgressBar'

type Phase = 'list' | 'practice' | 'rate' | 'done'

const RATING_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Mycket svårt',
  2: 'Svårt',
  3: 'OK',
  4: 'Bra',
  5: 'Utmärkt',
}

export function Dialogues() {
  const chapterIds = getChapterIds()
  const [chapterId, setChapterId] = useState(chapterIds[0] ?? 1)
  const [dialogueIndex, setDialogueIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('list')
  const [revealed, setRevealed] = useState(false)
  const [lastXp, setLastXp] = useState(0)
  const [saving, setSaving] = useState(false)

  const chapter = getChapter(chapterId)
  const dialogues = chapter?.dialogues ?? []
  const current = dialogues[dialogueIndex]

  const completedNums = useLiveQuery(async () => {
    const sessions = await db.dialogueSessions
      .where('chapterId')
      .equals(chapterId)
      .filter((s) => s.completedAt != null)
      .toArray()
    return new Set(sessions.map((s) => s.dialogueNum))
  }, [chapterId])

  const progressPercent =
    dialogues.length > 0
      ? Math.round(((completedNums?.size ?? 0) / dialogues.length) * 100)
      : 0

  function openDialogue(index: number) {
    setDialogueIndex(index)
    setRevealed(false)
    setPhase('practice')
  }

  async function submitRating(rating: 1 | 2 | 3 | 4 | 5) {
    if (!current || saving) return
    setSaving(true)
    try {
      const { xpGained } = await recordDialogueSession({
        chapterId,
        dialogueNum: current.num,
        promptSv: current.prompt_sv,
        selfRating: rating,
      })
      setLastXp(xpGained)
      setPhase('done')
    } finally {
      setSaving(false)
    }
  }

  if (phase === 'done' && current) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
          <p className="text-4xl">✓</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">Dialog {current.num} klar!</h2>
          <p className="mt-2 text-slate-600">Bra jobbat med att jämföra mot MODELL-svaret.</p>
          <p className="mt-1 text-sm font-medium text-indigo-600">+{lastXp} XP</p>
        </div>
        <div className="flex justify-center gap-3">
          {dialogueIndex + 1 < dialogues.length && (
            <button
              type="button"
              onClick={() => openDialogue(dialogueIndex + 1)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Nästa dialog
            </button>
          )}
          <button
            type="button"
            onClick={() => setPhase('list')}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Tillbaka till listan
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'rate' && current) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <button
          type="button"
          onClick={() => setPhase('practice')}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Tillbaka
        </button>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            MODELL (svenska)
          </p>
          <p className="mt-3 whitespace-pre-wrap text-slate-800">{current.model_sv}</p>
        </div>

        <div>
          <p className="mb-3 text-center text-sm font-medium text-slate-700">
            Hur bra klarade du dialogen? (1–5)
          </p>
          <div className="grid grid-cols-5 gap-2">
            {([1, 2, 3, 4, 5] as const).map((rating) => (
              <button
                key={rating}
                type="button"
                disabled={saving}
                onClick={() => void submitRating(rating)}
                className="rounded-xl border border-slate-200 bg-white px-2 py-3 text-center transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
              >
                <span className="block text-lg font-bold text-indigo-600">{rating}</span>
                <span className="mt-1 block text-[10px] leading-tight text-slate-500">
                  {RATING_LABELS[rating]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'practice' && current) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPhase('list')}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Avsluta
          </button>
          <span className="text-sm text-slate-600">
            Dialog {current.num} / {dialogues.length}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Scenario (svenska)
          </p>
          <p className="mt-3 whitespace-pre-wrap text-lg text-slate-900">{current.prompt_sv}</p>
        </div>

        {!revealed ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-slate-600">
              Svara högt på svenska enligt instruktionerna. Ta den tid du behöver.
            </p>
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Jag har svarat — visa MODELL
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPhase('rate')}
            className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Jämför och betygsätt dig själv
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Dialoger</h1>
        <p className="mt-1 text-slate-600">
          Öva dialoger — svara själv, jämför med MODELL, betygsätt 1–5
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-slate-900">Kapitel</span>
          <select
            value={chapterId}
            onChange={(e) => setChapterId(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            {chapterIds.map((id) => (
              <option key={id} value={id}>
                Kapitel {id}
                {getChapter(id) ? `: ${getChapter(id)!.title_sv}` : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4">
          <ProgressBar
            percent={progressPercent}
            label={`${completedNums?.size ?? 0} av ${dialogues.length} dialoger övade`}
          />
        </div>
        <p className="mt-2 text-sm text-slate-400">+{XP_REWARDS.dialogue} XP per dialog</p>
      </section>

      <ul className="space-y-2">
        {dialogues.map((dialogue, index) => {
          const done = completedNums?.has(dialogue.num)
          const preview = dialogue.prompt_sv.split('\n')[0]
          return (
            <li key={dialogue.num}>
              <button
                type="button"
                onClick={() => openDialogue(index)}
                className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-200 hover:shadow-sm"
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    done
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {done ? '✓' : dialogue.num}
                </span>
                <div>
                  <p className="font-medium text-slate-900">Dialog {dialogue.num}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{preview}</p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
