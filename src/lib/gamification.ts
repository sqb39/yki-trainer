import { db, DEFAULT_PROGRESS, type Progress } from '../db/schema'
import { getChapter } from './book'
import { UNLOCK_THRESHOLD } from './chapters'
import { todayIso } from './xp'

export const DAILY_QUESTS = [
  {
    id: 'flashcards' as const,
    title: '20 flashcards',
    description: 'Repetera ord och verb',
    xp: 100,
  },
  {
    id: 'dialogue' as const,
    title: '1 dialog',
    description: 'Öva en dialog med MODELL-svar',
    xp: 15,
  },
  {
    id: 'speaking' as const,
    title: '1 talövning',
    description: 'Reagera, berätta eller åsikt',
    xp: 12,
  },
]

export type DailyQuestId = (typeof DAILY_QUESTS)[number]['id']

export async function computeChapterProgress(chapterId: number): Promise<number> {
  const chapter = getChapter(chapterId)
  if (!chapter) return 0

  const [cards, dialogues, writingEntries, quizAttempts] = await Promise.all([
    db.cards.where('chapterId').equals(chapterId).toArray(),
    db.dialogueSessions.where('chapterId').equals(chapterId).filter((s) => s.completedAt != null).toArray(),
    db.writingEntries.where('chapterId').equals(chapterId).filter((e) => e.completedAt != null).toArray(),
    db.quizAttempts.where('chapterId').equals(chapterId).toArray(),
  ])

  const dialogueTotal = chapter.dialogues.length || 1
  const dialoguePct = Math.min(100, (dialogues.length / dialogueTotal) * 100)

  const writingTotal = chapter.writing.length || 3
  const writingPct = Math.min(100, (writingEntries.length / writingTotal) * 100)

  const studyCards = cards.filter((c) => c.type === 'vocab' || c.type === 'verb')
  const masteredCards = studyCards.filter((c) => c.repetitions >= 1).length
  const flashPct =
    studyCards.length > 0 ? Math.min(100, (masteredCards / studyCards.length) * 100) : 0

  const quizTotal = chapter.vilket_ord.length || 1
  const uniqueQuiz = new Set(quizAttempts.map((a) => a.questionSv)).size
  const quizPct = chapter.vilket_ord.length > 0 ? Math.min(100, (uniqueQuiz / quizTotal) * 100) : 0

  const weights = [
    { pct: dialoguePct, weight: chapter.dialogues.length > 0 ? 0.35 : 0 },
    { pct: writingPct, weight: chapter.writing.length > 0 ? 0.25 : 0 },
    { pct: flashPct, weight: studyCards.length > 0 ? 0.25 : 0 },
    { pct: quizPct, weight: chapter.vilket_ord.length > 0 ? 0.15 : 0 },
  ]

  const active = weights.filter((w) => w.weight > 0)
  if (active.length === 0) {
    const speakingDone = cards.filter((c) => c.type === 'speaking' && c.repetitions >= 1).length
    const speakingTotal = chapter.reagera.length + chapter.beratta.length + chapter.asikt.length
    return speakingTotal > 0 ? Math.round((speakingDone / speakingTotal) * 100) : 0
  }

  const totalWeight = active.reduce((s, w) => s + w.weight, 0)
  const weighted = active.reduce((s, w) => s + w.pct * (w.weight / totalWeight), 0)
  return Math.round(weighted)
}

export async function refreshAllChapterProgress(): Promise<Record<number, number>> {
  const chapterProgress: Record<number, number> = {}
  for (let id = 1; id <= 7; id++) {
    chapterProgress[id] = await computeChapterProgress(id)
  }
  return chapterProgress
}

export async function syncProgressState(): Promise<Progress> {
  const progress = (await db.progress.get('main')) ?? { ...DEFAULT_PROGRESS }
  const chapterProgress = await refreshAllChapterProgress()

  const unlockedChapters = [1]
  for (let id = 2; id <= 7; id++) {
    if ((chapterProgress[id - 1] ?? 0) >= UNLOCK_THRESHOLD) {
      unlockedChapters.push(id)
    }
  }

  const badges = await evaluateBadges(progress, chapterProgress)

  const updated: Progress = {
    ...DEFAULT_PROGRESS,
    ...progress,
    id: 'main',
    chapterProgress,
    unlockedChapters: [...new Set([...(progress.unlockedChapters ?? [1]), ...unlockedChapters])],
    badges,
  }

  await db.progress.put(updated)
  return updated
}

async function evaluateBadges(
  progress: Progress,
  chapterProgress: Record<number, number>,
): Promise<string[]> {
  const badges = new Set(progress.badges ?? [])

  if (progress.streakDays >= 7) badges.add('streak-7')

  for (let id = 1; id <= 7; id++) {
    if ((chapterProgress[id] ?? 0) >= UNLOCK_THRESHOLD) {
      badges.add(`chapter-${id}-cleared`)
    }
  }

  const masteredCards = await db.cards.filter((c) => c.repetitions >= 1).count()
  if (masteredCards >= 100) badges.add('words-100')

  for (let id = 1; id <= 7; id++) {
    const completed = await db.writingEntries
      .where('chapterId')
      .equals(id)
      .filter((e) => e.completedAt != null)
      .count()
    if (completed >= 3) {
      badges.add('writing-trio')
      break
    }
  }

  const bossCount = await db.bossSessions.filter((s) => s.completedAt != null).count()
  if (bossCount >= 1) badges.add('boss-first')

  const today = todayIso()
  const questsDone =
    progress.dailyQuestsDate === today &&
    DAILY_QUESTS.every((q) => progress.dailyQuestsCompleted?.includes(q.id))
  if (questsDone) badges.add('quests-all')

  return [...badges]
}

export async function getWeakCards(limit = 5) {
  const reviews = await db.reviews.orderBy('reviewedAt').reverse().limit(200).toArray()
  const againCounts = new Map<number, number>()

  for (const r of reviews) {
    if (r.rating === 1) {
      againCounts.set(r.cardId, (againCounts.get(r.cardId) ?? 0) + 1)
    }
  }

  const sorted = [...againCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  const cards = await Promise.all(sorted.map(([id]) => db.cards.get(id)))
  return cards.filter(Boolean).map((card, i) => ({
    card: card!,
    againCount: sorted[i][1],
  }))
}

export function isWeekComplete(
  week: number,
  chapterProgress: Record<number, number>,
): boolean {
  if (week === 8) {
    const avg =
      [1, 2, 3, 4, 5, 6, 7].reduce((s, id) => s + (chapterProgress[id] ?? 0), 0) / 7
    return avg >= 60
  }
  const chapterId = week
  return (chapterProgress[chapterId] ?? 0) >= UNLOCK_THRESHOLD
}

export function suggestedWeekStart(): string {
  const start = new Date()
  start.setDate(start.getDate() - 7)
  return start.toISOString().slice(0, 10)
}
