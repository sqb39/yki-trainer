import { useMemo, useState } from 'react'
import { getChapter } from '../lib/book'
import { recordQuizAttempt } from '../lib/progress'
import { buildQuizQuestions, isCorrectAnswer, type QuizQuestion } from '../lib/quiz'
import { XP_REWARDS } from '../lib/xp'
import { ChapterSelect } from '../components/ChapterSelect'
import { ProgressBar } from '../components/ProgressBar'

type Phase = 'setup' | 'quiz' | 'summary'

interface QuizResult {
  question: QuizQuestion
  selected: string
  correct: boolean
}

export function Quiz() {
  const [chapterId, setChapterId] = useState(1)
  const [phase, setPhase] = useState<Phase>('setup')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [results, setResults] = useState<QuizResult[]>([])
  const [sessionXp, setSessionXp] = useState(0)
  const [saving, setSaving] = useState(false)

  const chapter = getChapter(chapterId)
  const current = questions[index]
  const progressPercent =
    questions.length > 0 ? Math.round((index / questions.length) * 100) : 0

  const summary = useMemo(() => {
    const correct = results.filter((r) => r.correct).length
    return { correct, total: results.length }
  }, [results])

  function startQuiz() {
    if (!chapter) return
    setQuestions(buildQuizQuestions(chapter))
    setIndex(0)
    setSelected(null)
    setRevealed(false)
    setResults([])
    setSessionXp(0)
    setPhase('quiz')
  }

  async function submitAnswer() {
    if (!current || !selected || revealed || saving) return
    setSaving(true)
    const correct = isCorrectAnswer(selected, current.answerSv)
    try {
      const { xpGained } = await recordQuizAttempt({
        chapterId: current.chapterId,
        questionSv: current.questionSv,
        answerSv: current.answerSv,
        selectedSv: selected,
        correct,
      })
      setSessionXp((prev) => prev + xpGained)
      setResults((prev) => [...prev, { question: current, selected, correct }])
      setRevealed(true)
    } finally {
      setSaving(false)
    }
  }

  function nextQuestion() {
    if (index + 1 >= questions.length) {
      setPhase('summary')
      return
    }
    setIndex((i) => i + 1)
    setSelected(null)
    setRevealed(false)
  }

  if (phase === 'summary') {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <p className="text-4xl">✓</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">Quiz klart!</h2>
          <p className="mt-2 text-slate-600">
            {summary.correct} av {summary.total} rätt
          </p>
          <p className="mt-1 text-sm font-medium text-indigo-600">+{sessionXp} XP</p>
        </div>

        <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          {results.map((r, i) => (
            <li
              key={`${r.question.questionSv}-${i}`}
              className={r.correct ? 'text-emerald-700' : 'text-rose-700'}
            >
              {r.correct ? '✓' : '✗'} {r.question.answerSv}
              {!r.correct && (
                <span className="text-slate-500"> (du valde: {r.selected})</span>
              )}
            </li>
          ))}
        </ul>

        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={startQuiz}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Gör om
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

  if (phase === 'quiz' && current) {
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
          <span className="text-sm text-slate-600">
            {index + 1} / {questions.length}
          </span>
          <span className="text-sm font-medium text-indigo-600">+{sessionXp} XP</span>
        </div>

        <ProgressBar percent={progressPercent} />

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Vilket ord?
          </p>
          <p className="mt-3 text-lg text-slate-900">{current.questionSv}</p>
        </div>

        <div className="grid gap-2">
          {current.options.map((option) => {
            const isSelected = selected === option
            const isCorrect = isCorrectAnswer(option, current.answerSv)
            let className =
              'rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition min-h-12 active:scale-[0.98] '

            if (!revealed) {
              className += isSelected
                ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                : 'border-slate-200 bg-white text-slate-800 hover:border-indigo-200'
            } else if (isCorrect) {
              className += 'border-emerald-500 bg-emerald-50 text-emerald-900'
            } else if (isSelected) {
              className += 'border-rose-500 bg-rose-50 text-rose-900'
            } else {
              className += 'border-slate-200 bg-slate-50 text-slate-500'
            }

            return (
              <button
                key={option}
                type="button"
                disabled={revealed}
                onClick={() => setSelected(option)}
                className={className}
              >
                {option}
              </button>
            )
          })}
        </div>

        {!revealed ? (
          <button
            type="button"
            onClick={() => void submitAnswer()}
            disabled={!selected || saving}
            className="w-full rounded-lg bg-indigo-600 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 min-h-12 active:scale-[0.98]"
          >
            Svara
          </button>
        ) : (
          <button
            type="button"
            onClick={nextQuestion}
            className="w-full rounded-lg bg-indigo-600 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700 min-h-12 active:scale-[0.98]"
          >
            {index + 1 >= questions.length ? 'Se resultat' : 'Nästa fråga'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Vilket ord?</h1>
        <p className="mt-1 text-slate-600">
          Flervalsquiz — välj rätt ord utifrån definitionen
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <ChapterSelect value={chapterId} onChange={setChapterId} />

        <p className="mt-4 text-sm text-slate-600">
          {chapter?.vilket_ord.length ?? 0} frågor i detta kapitel
        </p>
        <p className="mt-1 text-sm text-slate-400">
          +{XP_REWARDS.quiz} XP per rätt svar, +{Math.floor(XP_REWARDS.quiz / 2)} XP om fel
        </p>

        <button
          type="button"
          onClick={startQuiz}
          disabled={!chapter?.vilket_ord.length}
          className="mt-6 rounded-lg bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 min-h-12 active:scale-[0.98]"
        >
          Starta quiz
        </button>
      </section>
    </div>
  )
}
