import {
  db,
  DEFAULT_PROGRESS,
  type Card,
  type DialogueSession,
  type QuizAttempt,
  type WritingEntry,
} from '../db/schema'
import { DAILY_QUESTS, syncProgressState, type DailyQuestId } from './gamification'
import { scheduleReview, type Sm2Rating } from './sm2'
import { markStudyActivity } from './sync'
import {
  DEFAULT_STUDY_SECONDS,
  levelFromXp,
  todayIso,
  daysBetween,
  startOfLocalDayMs,
  XP_REWARDS,
} from './xp'

const FLASHCARD_QUEST_TARGET = 20
const FLASHCARD_QUEST_BONUS = 100
const ALL_QUESTS_BONUS = 25

function normalizeQuestIds(ids: string[]): string[] {
  return ids.map((id) => (id === 'dialogue' ? 'practice' : id))
}

async function applyStudyProgress(
  xpAmount: number,
  questId?: DailyQuestId,
  studySeconds = 0,
): Promise<{ xpGained: number }> {
  let xpGained = xpAmount

  await db.transaction('rw', [db.progress, db.settings], async () => {
    const progress = await db.progress.get('main')
    const settings = await db.settings.get('main')
    const today = todayIso()
    const minSeconds = Math.max(1, settings?.minStudyMinutes ?? 15) * 60

    let xp = (progress?.xp ?? 0) + xpAmount
    let streakDays = progress?.streakDays ?? 0
    let lastStudyDate = progress?.lastStudyDate ?? null
    let dailyQuestsCompleted = normalizeQuestIds([...(progress?.dailyQuestsCompleted ?? [])])
    let dailyQuestsDate = progress?.dailyQuestsDate ?? null
    let studySecondsToday = progress?.studySecondsToday ?? 0
    let studySecondsDate = progress?.studySecondsDate ?? null

    if (dailyQuestsDate !== today) {
      dailyQuestsCompleted = []
      dailyQuestsDate = today
    }

    if (studySecondsDate !== today) {
      studySecondsToday = 0
      studySecondsDate = today
    }
    studySecondsToday += Math.max(0, studySeconds)

    const alreadyStreakToday = lastStudyDate === today
    if (!alreadyStreakToday && studySecondsToday >= minSeconds) {
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
    const hadAllQuests =
      progress?.dailyQuestsDate === today &&
      DAILY_QUESTS.every((q) =>
        normalizeQuestIds(progress?.dailyQuestsCompleted ?? []).includes(q.id),
      )
    if (allQuestsDone && !hadAllQuests && dailyQuestsDate === today) {
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
      studySecondsToday,
      studySecondsDate,
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
  studySeconds?: number,
): Promise<{ xpGained: number }> {
  const now = Date.now()
  const result = scheduleReview(card, rating, now)
  let xpGained = XP_REWARDS.flashcard
  const elapsed = studySeconds ?? DEFAULT_STUDY_SECONDS.flashcard

  await db.transaction('rw', [db.cards, db.reviews, db.progress, db.settings], async () => {
    await db.cards.update(cardId, {
      easeFactor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      nextReview: result.nextReview,
      updatedAt: now,
    })

    await db.reviews.add({ cardId, rating, reviewedAt: now })

    const progress = await db.progress.get('main')
    const settings = await db.settings.get('main')
    const today = todayIso()
    const minSeconds = Math.max(1, settings?.minStudyMinutes ?? 15) * 60
    let xp = (progress?.xp ?? 0) + XP_REWARDS.flashcard
    let streakDays = progress?.streakDays ?? 0
    let lastStudyDate = progress?.lastStudyDate ?? null
    let dailyQuestsCompleted = normalizeQuestIds([...(progress?.dailyQuestsCompleted ?? [])])
    let dailyQuestsDate = progress?.dailyQuestsDate ?? null
    let studySecondsToday = progress?.studySecondsToday ?? 0
    let studySecondsDate = progress?.studySecondsDate ?? null

    if (dailyQuestsDate !== today) {
      dailyQuestsCompleted = []
      dailyQuestsDate = today
    }

    if (studySecondsDate !== today) {
      studySecondsToday = 0
      studySecondsDate = today
    }
    studySecondsToday += Math.max(0, elapsed)

    if (lastStudyDate !== today && studySecondsToday >= minSeconds) {
      if (!lastStudyDate) {
        streakDays = 1
      } else {
        const gap = daysBetween(lastStudyDate, today)
        streakDays = gap === 1 ? streakDays + 1 : 1
      }
      lastStudyDate = today
    }

    const startOfDay = startOfLocalDayMs(today)
    const reviewsToday = await db.reviews.where('reviewedAt').aboveOrEqual(startOfDay).count()

    if (
      reviewsToday >= FLASHCARD_QUEST_TARGET &&
      !dailyQuestsCompleted.includes('flashcards')
    ) {
      dailyQuestsCompleted.push('flashcards')
      xp += FLASHCARD_QUEST_BONUS
      xpGained += FLASHCARD_QUEST_BONUS
    }

    const allQuestsDone = DAILY_QUESTS.every((q) => dailyQuestsCompleted.includes(q.id))
    const hadAllQuests =
      progress?.dailyQuestsDate === today &&
      DAILY_QUESTS.every((q) =>
        normalizeQuestIds(progress?.dailyQuestsCompleted ?? []).includes(q.id),
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
      studySecondsToday,
      studySecondsDate,
    })
  })

  await syncProgressState()
  await markStudyActivity()
  return { xpGained }
}

export async function recordBossComplete(chapterId: number): Promise<{ xpGained: number }> {
  const now = Date.now()
  const prior = await db.bossSessions
    .where('chapterId')
    .equals(chapterId)
    .filter((s) => s.completedAt != null)
    .count()

  await db.bossSessions.add({
    chapterId,
    dialogueDone: true,
    opinionDone: true,
    writingDone: true,
    completedAt: now,
    createdAt: now,
  })

  const xpAmount = prior > 0 ? XP_REWARDS.bossRepeat : XP_REWARDS.boss
  return applyStudyProgress(xpAmount, undefined, DEFAULT_STUDY_SECONDS.boss)
}

export async function updateCardBack(cardId: number, backSv: string): Promise<void> {
  await db.cards.update(cardId, { backSv, updatedAt: Date.now() })
  await markStudyActivity()
}

export async function recordQuizAttempt(
  attempt: Omit<QuizAttempt, 'id' | 'attemptedAt'>,
  studySeconds = DEFAULT_STUDY_SECONDS.quiz,
): Promise<{ xpGained: number }> {
  const now = Date.now()
  const xpAmount = attempt.correct ? XP_REWARDS.quiz : Math.floor(XP_REWARDS.quiz / 2)

  await db.quizAttempts.add({ ...attempt, attemptedAt: now })
  return applyStudyProgress(xpAmount, 'practice', studySeconds)
}

export async function recordDialogueSession(
  session: Omit<DialogueSession, 'id' | 'createdAt' | 'completedAt'> & {
    selfRating: 1 | 2 | 3 | 4 | 5
  },
  studySeconds = DEFAULT_STUDY_SECONDS.dialogue,
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

  return applyStudyProgress(XP_REWARDS.dialogue, 'practice', studySeconds)
}

export async function recordSpeakingComplete(
  studySeconds?: number,
  match?: { chapterId: number; prompt: string },
): Promise<{ xpGained: number }> {
  if (match) {
    const cards = await db.cards.where('chapterId').equals(match.chapterId).toArray()
    const card = cards.find((c) => c.type === 'speaking' && c.frontSv === match.prompt)
    if (card?.id) {
      const now = Date.now()
      const result = scheduleReview(card, 3, now)
      await db.cards.update(card.id, {
        easeFactor: result.easeFactor,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReview: result.nextReview,
        updatedAt: now,
      })
    }
  }
  return applyStudyProgress(
    XP_REWARDS.speaking,
    'speaking',
    studySeconds ?? DEFAULT_STUDY_SECONDS.speaking,
  )
}

export async function saveWritingEntry(
  entry: Omit<WritingEntry, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<number> {
  const now = Date.now()
  const chapterEntries = await db.writingEntries
    .where('chapterId')
    .equals(entry.chapterId)
    .toArray()
  const existing = chapterEntries.find((e) => e.promptSv === entry.promptSv)

  if (existing?.id) {
    await db.writingEntries.update(existing.id, {
      contentSv: entry.contentSv,
      checklist: entry.checklist,
      completedAt: entry.completedAt,
      updatedAt: now,
      promptSv: entry.promptSv,
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

  return applyStudyProgress(XP_REWARDS.writing, undefined, DEFAULT_STUDY_SECONDS.writing)
}
