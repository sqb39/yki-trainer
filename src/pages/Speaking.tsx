import { useCallback, useEffect, useRef, useState } from 'react'
import { getChapter } from '../lib/book'
import { recordSpeakingComplete } from '../lib/progress'
import { XP_REWARDS } from '../lib/xp'
import { ChapterSelect } from '../components/ChapterSelect'
import { Timer } from '../components/Timer'

type SpeakingCategory = 'reagera' | 'berätta' | 'åsikt'

const CATEGORY_LABELS: Record<SpeakingCategory, string> = {
  reagera: 'Reagera',
  berätta: 'Berätta',
  åsikt: 'Din åsikt',
}

const CATEGORY_DESCRIPTIONS: Record<SpeakingCategory, string> = {
  reagera: 'Reagera på en situation — svara spontant på svenska',
  berätta: 'Berätta en historia eller erfarenhet',
  åsikt: 'Uttryck din åsikt och argumentera',
}

const TIMER_OPTIONS = [
  { label: '1 min', seconds: 60 },
  { label: '2 min', seconds: 120 },
  { label: '3 min', seconds: 180 },
] as const

type Phase = 'setup' | 'practice' | 'done'

function pickRandom<T>(items: T[]): T | undefined {
  if (!items.length) return undefined
  return items[Math.floor(Math.random() * items.length)]
}

export function Speaking() {
  const [chapterId, setChapterId] = useState(1)
  const [category, setCategory] = useState<SpeakingCategory>('reagera')
  const [duration, setDuration] = useState(120)
  const [prompt, setPrompt] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('setup')
  const [timerKey, setTimerKey] = useState(0)
  const [timerDone, setTimerDone] = useState(false)
  const [lastXp, setLastXp] = useState(0)
  const [saving, setSaving] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const chapter = getChapter(chapterId)

  const promptsForCategory = useCallback((): string[] => {
    if (!chapter) return []
    if (category === 'reagera') return chapter.reagera
    if (category === 'berätta') return chapter.beratta
    return chapter.asikt
  }, [chapter, category])

  function startPractice() {
    const pool = promptsForCategory()
    const next = pickRandom(pool)
    if (!next) return
    setPrompt(next)
    setTimerDone(false)
    setTimerKey((k) => k + 1)
    setRecordingUrl(null)
    setPhase('practice')
  }

  function pickAnother() {
    const pool = promptsForCategory()
    const next = pickRandom(pool)
    if (next) {
      setPrompt(next)
      setTimerDone(false)
      setTimerKey((k) => k + 1)
      setRecordingUrl(null)
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setRecordingUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((t) => t.stop())
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      // Microphone not available — optional feature
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  async function completePractice() {
    if (saving) return
    setSaving(true)
    try {
      const { xpGained } = await recordSpeakingComplete(duration, {
        chapterId,
        prompt: prompt ?? '',
      })
      setLastXp(xpGained)
      setPhase('done')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    }
  }, [recordingUrl])

  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
          <p className="text-4xl">✓</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">Talövning klar!</h2>
          <p className="mt-2 text-slate-600">Bra jobbat med att öva muntligt på svenska.</p>
          <p className="mt-1 text-sm font-medium text-indigo-600">+{lastXp} XP</p>
        </div>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setPhase('practice')
              pickAnother()
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Ny prompt
          </button>
          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Tillbaka
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'practice' && prompt) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Avsluta
          </button>
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
            {CATEGORY_LABELS[category]}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Prompt (svenska)
          </p>
          <p className="mt-3 whitespace-pre-wrap text-lg text-slate-900">{prompt}</p>
        </div>

        <Timer
          key={timerKey}
          duration={duration}
          autoStart
          label="Tala på svenska"
          onComplete={() => setTimerDone(true)}
        />

        {timerDone && (
          <p className="text-center text-sm font-medium text-amber-600">
            Tiden är ute! Du kan fortsätta eller avsluta övningen.
          </p>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Valfri inspelning</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!recording ? (
              <button
                type="button"
                onClick={() => void startRecording()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Spela in
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                Stoppa inspelning
              </button>
            )}
            <button
              type="button"
              onClick={pickAnother}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Ny prompt
            </button>
          </div>
          {recordingUrl && (
            <audio controls src={recordingUrl} className="mt-3 w-full" />
          )}
        </div>

        <button
          type="button"
          onClick={() => void completePractice()}
          disabled={saving || !timerDone}
          className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {timerDone ? 'Markera som klar' : 'Vänta tills tiden är slut'}
        </button>
      </div>
    )
  }

  const poolSize = promptsForCategory().length

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Tala</h1>
        <p className="mt-1 text-slate-600">
          Reagera, berätta och uttryck åsikter — tidsbegränsad muntlig övning
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <ChapterSelect value={chapterId} onChange={setChapterId} />

        <div>
          <p className="text-sm font-semibold text-slate-900">Typ</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(Object.keys(CATEGORY_LABELS) as SpeakingCategory[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                  category === cat
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200'
                }`}
              >
                <span className="font-semibold">{CATEGORY_LABELS[cat]}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  {CATEGORY_DESCRIPTIONS[cat]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-900">Tid</p>
          <div className="mt-2 flex gap-2">
            {TIMER_OPTIONS.map((opt) => (
              <button
                key={opt.seconds}
                type="button"
                onClick={() => setDuration(opt.seconds)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  duration === opt.seconds
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-600">{poolSize} prompts i detta kapitel</p>
        <p className="text-sm text-slate-400">+{XP_REWARDS.speaking} XP per övning</p>

        <button
          type="button"
          onClick={startPractice}
          disabled={!poolSize}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Starta övning
        </button>
      </section>
    </div>
  )
}
