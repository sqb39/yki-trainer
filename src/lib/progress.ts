import {
  db,
  DEFAULT_PROGRESS,
  type Card,
  type DialogueSession,
  type QuizAttempt,
  type WritingEntry,
} from '../db/schema'
import { DAILY_QUESTS, syncProgressState } from './gamification'
import { scheduleReview, type Sm2Rating } from './sm2'
import { markStudyActivity } from './sync'
import { levelFromXp, todayIso, daysBetween, XP_REWARDS } from './xp'

const FLASHCARD_QUEST_TARGET = 20
const FLASHCARD_QUEST_BONUS = 100
const ALL_QUESTS_BONUS = 25

type DailyQuestId = (typeof DAILY_QUESTS)[number]['id']

async function applyStudyProgress(
  xpAmount: number,
  questId?: DailyQuestId,
): Promise<{ xpGained: number }> {
  let xpGained = xpAmount

  await db.transaction('rw', [db.progress], async () => {
    const progress = await db.progress.get('main')
    const today = todayIso()
    let xp = (progress?.xp ?? 0) + xpAmount
    let streakDays = progress?.streakDays ?? 0
    let lastStudyDate = progress?.lastStudyDate ?? null
    let dailyQuestsCompleted = [...(progress?.dailyQuestsCompleted ?? [])]
    let dailyQuestsDate = progress?.dailyQuestsDate ?? null

    if (dailyQuestsDate !== today) {
      dailyQuestsCompleted = []
      dailyQuestsDate = today
    }

    if (lastStudyDate !== today) {
      if (!lastStudyDate) {
        streakDays = 1
      } else {
        const gap = daysBetween(lastStudyDate, today)
        streakDays = gap === 1 ? streakDays + 1 : 1
      }
      lastStudyDate = today
    }

    if (questId && !dailyQuestsCompleted.includes(questId)) {
      dailyQuestsCompleted.push(questId)
    }

    const allQuestsDone = DAILY_QUESTS.every((q) => dailyQuestsCompleted.includes(q.id))
    const hadAllQuests = DAILY_QUESTS.every((q) =>
      (progress?.dailyQuestsCompleted ?? []).includes(q.id),
    )
    if (allQuestsDone && !hadAllQuests) {
      xp += ALL_QUESTS_BONUS
      xpGained += ALL_QUESTS_BONUS
    }

    await db.progress.put({
      ...DEFAULT_PROGRESS,
      ...progress,
      id: 'main',
      xp,
      level: levelFromXp(xp),
      streakDays,
      lastStudyDate,
      dailyQuestsCompleted,
      dailyQuestsDate,
    })
  })

  await syncProgressState()
  await markStudyActivity()
  return { xpGained }
}

export async function recordFlashcardReview(
  cardId: number,
  rating: Sm2Rating,
  card: Card,
): Promise<{ xpGained: number }> {
  const now = Date.now()
  const result = scheduleReview(card, rating, now)
  let xpGained = XP_REWARDS.flashcard

  await db.transaction('rw', [db.cards, db.reviews, db.progress], async () => {
    await db.cards.update(cardId, {
      easeFactor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      nextReview: result.nextReview,
      updatedAt: now,
    })

    await db.reviews.add({ cardId, rating, reviewedAt: now })

    const progress = await db.progress.get('main')
    const today = todayIso()
    let xp = (progress?.xp ?? 0) + XP_REWARDS.flashcard
    let streakDays = progress?.streakDays ?? 0
    let lastStudyDate = progress?.lastStudyDate ?? null
    let dailyQuestsCompleted = [...(progress?.dailyQuestsCompleted ?? [])]
    let dailyQuestsDate = progress?.dailyQuestsDate ?? null

    if (dailyQuestsDate !== today) {
      dailyQuestsCompleted = []
      dailyQuestsDate = today
    }

    if (lastStudyDate !== today) {
      if (!lastStudyDate) {
        streakDays = 1
      } else {
        const gap = daysBetween(lastStudyDate, today)
        streakDays = gap === 1 ? streakDays + 1 : 1
      }
      lastStudyDate = today
    }

    const startOfDay = new Date(today).getTime()
    const reviewsToday = await db.reviews.where('reviewedAt').aboveOrEqual(startOfDay).count()

    if (
      reviewsToday >= FLASHCARD_QUEST_TARGET &&
      !dailyQuestsCompleted.includes('flashcards')
    ) {
      dailyQuestsCompleted.push('flashcards')
      xp += FLASHCARD_QUEST_BONUS
      xpGained += FLASHCARD_QUEST_BONUS
    }

    await db.progress.put({
      ...DEFAULT_PROGRESS,
      ...progress,
      id: 'main',
      xp,
      level: levelFromXp(xp),
      streakDays,
      lastStudyDate,
      dailyQuestsCompleted,
      dailyQuestsDate,
    })
  })

  await syncProgressState()
  await markStudyActivity()
  return { xpGained }
}

export async function recordBossComplete(chapterId: number): Promise<{ xpGained: number }> {
  const now = Date.now()
  await db.bossSessions.add({
    chapterId,
    dialogueDone: true,
    opinionDone: true,
    writingDone: true,
    completedAt: now,
    createdAt: now,
  })
  return applyStudyProgress(XP_REWARDS.boss)
}

export async function updateCardBack(cardId: number, backFi: string): Promise<void> {
  await db.cards.update(cardId, { backFi, updatedAt: Date.now() })
  await markStudyActivity()
}

export async function recordQuizAttempt(
  attempt: Omit<QuizAttempt, 'id' | 'attemptedAt'>,
): Promise<{ xpGained: number }> {
  const now = Date.now()
  const xpAmount = attempt.correct ? XP_REWARDS.quiz : Math.floor(XP_REWARDS.quiz / 2)

  await db.quizAttempts.add({ ...attempt, attemptedAt: now })
  return applyStudyProgress(xpAmount)
}

export async function recordDialogueSession(
  session: Omit<DialogueSession, 'id' | 'createdAt' | 'completedAt'> & {
    selfRating: 1 | 2 | 3 | 4 | 5
  },
): Promise<{ xpGained: number }> {
  const now = Date.now()

  await db.dialogueSessions.add({
    chapterId: session.chapterId,
    dialogueNum: session.dialogueNum,
    promptSv: session.promptSv,
    selfRating: session.selfRating,
    completedAt: now,
    createdAt: now,
  })

  return applyStudyProgress(XP_REWARDS.dialogue, 'dialogue')
}

export async function recordSpeakingComplete(): Promise<{ xpGained: number }> {
  return applyStudyProgress(XP_REWARDS.speaking, 'speaking')
}

export async function saveWritingEntry(
  entry: Omit<WritingEntry, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<number> {
  const now = Date.now()
  const chapterEntries = await db.writingEntries
    .where('chapterId')
    .equals(entry.chapterId)
    .toArray()
  const existing = chapterEntries.find((e) => e.taskType === entry.taskType)

  if (existing?.id) {
    await db.writingEntries.update(existing.id, {
      contentFi: entry.contentFi,
      checklist: entry.checklist,
      completedAt: entry.completedAt,
      updatedAt: now,
    })
    await markStudyActivity()
    return existing.id
  }

  const id = await db.writingEntries.add({
    ...entry,
    createdAt: now,
    updatedAt: now,
  })
  if (id === undefined) {
    throw new Error('Kunde inte spara skrivuppgiften')
  }
  await markStudyActivity()
  return id
}

export async function completeWritingEntry(entryId: number): Promise<{ xpGained: number }> {
  const now = Date.now()
  const entry = await db.writingEntries.get(entryId)
  if (!entry || entry.completedAt) {
    return { xpGained: 0 }
  }

  await db.writingEntries.update(entryId, {
    completedAt: now,
    updatedAt: now,
  })

  return applyStudyProgress(XP_REWARDS.writing)
}
