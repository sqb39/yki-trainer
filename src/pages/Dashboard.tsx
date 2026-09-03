import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db/schema'
import { isDue } from '../lib/sm2'
import { daysUntilExam, levelFromXp, xpProgressInLevel } from '../lib/xp'
import { DAILY_QUESTS, getWeakCards } from '../lib/gamification'
import { getChapterTitle, nextChapterToUnlock } from '../lib/chapters'
import { ProgressBar } from '../components/ProgressBar'
import { StreakBadge } from '../components/StreakBadge'
import { QuestCard } from '../components/QuestCard'
import { BadgeList } from '../components/BadgeList'
import { SyncBanner } from '../components/SyncBanner'

export function Dashboard() {
  const progress = useLiveQuery(() => db.progress.get('main'))
  const settings = useLiveQuery(() => db.settings.get('main'))
  const dueCount = useLiveQuery(async () => {
    const cards = await db.cards.toArray()
    const now = Date.now()
    return cards.filter((c) => isDue(c.nextReview, now)).length
  }, [])
  const weakCards = useLiveQuery(() => getWeakCards(5), [])

  const xp = progress?.xp ?? 0
  const level = levelFromXp(xp)
  const xpBar = xpProgressInLevel(xp)
  const daysLeft = daysUntilExam(settings?.examDate ?? null)
  const completedToday = new Set(progress?.dailyQuestsCompleted ?? [])
  const currentChapter = nextChapterToUnlock(progress?.chapterProgress ?? {})
  const chapterPct = progress?.chapterProgress?.[currentChapter] ?? 0
  const allQuestsDone = DAILY_QUESTS.every((q) => completedToday.has(q.id))

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">YKI B1 Trainer</h1>
        <p className="mt-1 text-slate-600">Förbered dig för allmän språkexamen — på svenska</p>
      </header>

      <SyncBanner settings={settings} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Nivå</p>
          <p className="text-3xl font-bold text-indigo-600">{level}</p>
          <ProgressBar percent={xpBar.percent} className="mt-3" />
          <p className="mt-1 text-xs text-slate-500">
            {xpBar.current} / {xpBar.max} XP
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Streak</p>
          <div className="mt-2">
            <StreakBadge days={progress?.streakDays ?? 0} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Kort att repetera</p>
          <p className="text-3xl font-bold text-slate-900">{dueCount ?? 0}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Dagar till prov</p>
          <p className="text-3xl font-bold text-slate-900">
            {daysLeft != null ? daysLeft : '—'}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-700">Aktuellt kapitel</p>
            <h2 className="text-lg font-bold text-slate-900">
              {currentChapter}. {getChapterTitle(currentChapter)}
            </h2>
            <ProgressBar percent={chapterPct} label="Kapitelframsteg" className="mt-3 max-w-md" />
          </div>
          <div className="flex gap-2">
            <Link
              to="/chapters"
              className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              Kapitelkarta
            </Link>
            <Link
              to={`/boss/${currentChapter}`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Boss-prov
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Dagens uppdrag</h2>
        {allQuestsDone && (
          <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            Alla uppdrag klara idag! +25 XP bonus
          </p>
        )}
        <div className="grid gap-3">
          {DAILY_QUESTS.map((quest) => (
            <QuestCard
              key={quest.id}
              title={quest.title}
              description={quest.description}
              completed={completedToday.has(quest.id)}
              xp={quest.xp}
            />
          ))}
        </div>
      </section>

      {weakCards && weakCards.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Svaga områden</h2>
          <p className="mt-1 text-sm text-slate-600">
            Kort du ofta markerat som &quot;Again&quot;
          </p>
          <ul className="mt-4 space-y-2">
            {weakCards.map(({ card, againCount }) => (
              <li
                key={card.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="text-slate-800">{card.frontSv}</span>
                <span className="shrink-0 text-xs text-red-600">{againCount}× again</span>
              </li>
            ))}
          </ul>
          <Link
            to="/flashcards"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Repetera flashcards →
          </Link>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Märken</h2>
        <div className="mt-4">
          <BadgeList badgeIds={progress?.badges ?? []} />
        </div>
      </section>

      {!settings?.examDate && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Sätt ditt provdatum i{' '}
            <Link to="/settings" className="font-medium text-indigo-700 hover:text-indigo-900">
              Inställningar
            </Link>{' '}
            för att se nedräkning.
          </p>
        </section>
      )}
    </div>
  )
}
