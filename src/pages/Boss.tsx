import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getChapter } from '../lib/book'
import { getChapterTitle, isChapterUnlocked } from '../lib/chapters'
import { recordBossComplete } from '../lib/progress'
import { XP_REWARDS } from '../lib/xp'
import { Timer } from '../components/Timer'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'

type BossStep = 'intro' | 'dialogue' | 'opinion' | 'writing' | 'done'

const STEP_TIMERS = {
  dialogue: 180,
  opinion: 120,
  writing: 900,
} as const

function pickRandom<T>(items: T[]): T | undefined {
  if (!items.length) return undefined
  return items[Math.floor(Math.random() * items.length)]
}

export function Boss() {
  const { chapterId: chapterIdParam } = useParams()
  const chapterId = Number(chapterIdParam) || 1
  const navigate = useNavigate()
  const chapter = getChapter(chapterId)

  const progress = useLiveQuery(() => db.progress.get('main'))
  const alreadyDone = useLiveQuery(
    () =>
      db.bossSessions
        .where('chapterId')
        .equals(chapterId)
        .filter((s) => s.completedAt != null)
        .count(),
    [chapterId],
  )

  const [step, setStep] = useState<BossStep>('intro')
  const [dialoguePrompt, setDialoguePrompt] = useState<string | null>(null)
  const [opinionPrompt, setOpinionPrompt] = useState<string | null>(null)
  const [writingPrompt, setWritingPrompt] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [timerKey, setTimerKey] = useState(0)
  const [lastXp, setLastXp] = useState(0)
  const [saving, setSaving] = useState(false)

  const locked =
    chapterId > 1 &&
    !isChapterUnlocked(
      chapterId,
      progress?.unlockedChapters ?? [1],
      progress?.chapterProgress ?? {},
    )

  if (!chapter) {
    return (
      <div>
        <p className="text-slate-600">Kapitel hittades inte.</p>
        <Link to="/chapters" className="mt-4 text-indigo-600">
          Tillbaka
        </Link>
      </div>
    )
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <p className="text-4xl">🔒</p>
        <h1 className="text-xl font-bold text-slate-900">Kapitel låst</h1>
        <p className="text-slate-600">
          Slutför 80 % av kapitel {chapterId - 1} för att låsa upp boss-provet.
        </p>
        <Link to="/chapters" className="text-indigo-600">
          Till kapitelkartan
        </Link>
      </div>
    )
  }

  function startBoss() {
    const dialogue = pickRandom(chapter!.dialogues)
    const opinion = pickRandom(chapter!.asikt)
    const writing = pickRandom(chapter!.writing)
    setDialoguePrompt(dialogue?.prompt_sv ?? 'Öva en dialog från kapitlet på finska.')
    setOpinionPrompt(opinion ?? 'Uttryck din åsikt om ett tema från kapitlet.')
    setWritingPrompt(
      writing?.prompt_sv ?? 'Skriv en kort text (meddelande, e-post eller klagomål) på finska.',
    )
    setStep('dialogue')
    setRevealed(false)
    setTimerKey((k) => k + 1)
  }

  async function finishBoss() {
    if (saving) return
    setSaving(true)
    try {
      const { xpGained } = await recordBossComplete(chapterId)
      setLastXp(xpGained)
      setStep('done')
    } finally {
      setSaving(false)
    }
  }

  if (step === 'intro') {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Link to="/chapters" className="text-sm text-indigo-600 hover:text-indigo-800">
          ← Kapitelkarta
        </Link>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-4xl">👑</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Kapitelboss</h1>
          <p className="mt-1 text-slate-600">
            {chapterId}. {getChapterTitle(chapterId)}
          </p>
          {alreadyDone ? (
            <p className="mt-4 text-sm text-emerald-700">Du har redan klarat detta boss-prov.</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <p className="font-medium text-slate-900">Mock YKI under tidspress:</p>
          <ol className="mt-3 list-inside list-decimal space-y-2">
            <li>1 dialog ({STEP_TIMERS.dialogue / 60} min)</li>
            <li>1 åsiktsfråga ({STEP_TIMERS.opinion / 60} min)</li>
            <li>1 skrivuppgift ({STEP_TIMERS.writing / 60} min)</li>
          </ol>
          <p className="mt-4">Självbedömning — jämför mot MODELL där det finns.</p>
        </div>
        <button
          type="button"
          onClick={startBoss}
          className="w-full rounded-xl bg-amber-500 py-3 font-semibold text-white hover:bg-amber-600"
        >
          Starta boss-prov
        </button>
      </div>
    )
  }

  if (step === 'dialogue') {
    const modelFi = chapter.dialogues.find((d) => d.prompt_sv === dialoguePrompt)?.model_fi
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="text-sm font-medium text-amber-700">Steg 1/3 — Dialog</p>
        <Timer key={timerKey} duration={STEP_TIMERS.dialogue} onComplete={() => {}} />
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="whitespace-pre-wrap text-slate-800">{dialoguePrompt}</p>
        </div>
        {!revealed && modelFi && (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Visa MODELL (finska)
          </button>
        )}
        {revealed && modelFi && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">MODELL</p>
            <p className="mt-2 whitespace-pre-wrap text-slate-800">{modelFi}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setStep('opinion')
            setRevealed(false)
            setTimerKey((k) => k + 1)
          }}
          className="rounded-xl bg-indigo-600 px-6 py-2 font-medium text-white hover:bg-indigo-700"
        >
          Nästa: Åsikt →
        </button>
      </div>
    )
  }

  if (step === 'opinion') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="text-sm font-medium text-amber-700">Steg 2/3 — Din åsikt</p>
        <Timer key={timerKey} duration={STEP_TIMERS.opinion} onComplete={() => {}} />
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="whitespace-pre-wrap text-slate-800">{opinionPrompt}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setStep('writing')
            setTimerKey((k) => k + 1)
          }}
          className="rounded-xl bg-indigo-600 px-6 py-2 font-medium text-white hover:bg-indigo-700"
        >
          Nästa: Skriva →
        </button>
      </div>
    )
  }

  if (step === 'writing') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="text-sm font-medium text-amber-700">Steg 3/3 — Skriva</p>
        <Timer key={timerKey} duration={STEP_TIMERS.writing} onComplete={() => {}} />
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="whitespace-pre-wrap text-slate-800">{writingPrompt}</p>
        </div>
        <p className="text-sm text-slate-600">
          Skriv på finska i Skriv-läget eller på papper. Markera klar när du är färdig.
        </p>
        <button
          type="button"
          onClick={finishBoss}
          disabled={saving}
          className="rounded-xl bg-amber-500 px-6 py-3 font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {saving ? 'Sparar…' : 'Boss klar!'}
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
        <p className="text-4xl">👑</p>
        <h2 className="mt-2 text-xl font-bold text-slate-900">Boss besegrad!</h2>
        <p className="mt-2 text-slate-600">
          {getChapterTitle(chapterId)} — mockprov klart
        </p>
        <p className="mt-1 text-sm font-medium text-indigo-600">
          +{lastXp} XP (inkl. {XP_REWARDS.boss} boss-bonus)
        </p>
      </div>
      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/chapters')}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
        >
          Kapitelkarta
        </button>
        <button
          type="button"
          onClick={() => {
            setStep('intro')
            setRevealed(false)
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          Gör om
        </button>
      </div>
    </div>
  )
}
