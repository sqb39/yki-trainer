import Dexie, { type EntityTable } from 'dexie'

/** SM-2 spaced repetition card (flashcard or prompt) */
export interface Card {
  id?: number
  chapterId: number
  type: 'vocab' | 'verb' | 'dialogue' | 'speaking' | 'writing'
  frontSv: string
  backSv: string
  /** Optional extra context (e.g. dialogue scenario) */
  contextSv?: string
  /** SM-2 state */
  easeFactor: number
  interval: number
  repetitions: number
  nextReview: number
  createdAt: number
  updatedAt: number
}

/** Individual review event for analytics / weak-area tracking */
export interface Review {
  id?: number
  cardId: number
  rating: 1 | 2 | 3 | 4 | 5
  reviewedAt: number
}

/** User progress, XP, streaks, chapter unlocks */
export interface Progress {
  id: 'main'
  xp: number
  level: number
  streakDays: number
  lastStudyDate: string | null
  /** Chapter IDs the user has unlocked (1 always unlocked) */
  unlockedChapters: number[]
  /** Chapter completion percentage 0–100 */
  chapterProgress: Record<number, number>
  /** Badge IDs earned */
  badges: string[]
  /** Daily quest completion for today */
  dailyQuestsCompleted: string[]
  dailyQuestsDate: string | null
}

/** App settings */
export interface Settings {
  id: 'main'
  examDate: string | null
  seededAt: string | null
  /** Minutes per day to count as a study day */
  minStudyMinutes: number
  /** ISO timestamp of last JSON export */
  lastExportedAt: string | null
  /** ISO timestamp of last study activity that changed progress */
  lastStudyActivityAt: string | null
  /** Remind to sync if export is older than this many hours */
  syncReminderHours: number
  /** Hide sync banner until this ISO timestamp */
  syncReminderDismissedUntil: string | null
}

/** Writing lab entries */
export interface WritingEntry {
  id?: number
  chapterId: number
  taskType: 'meddelande' | 'e-post' | 'klagomål'
  promptSv: string
  contentSv: string
  checklist: Record<string, boolean>
  completedAt: number | null
  createdAt: number
  updatedAt: number
}

/** Quiz attempt for Vilket ord? mode */
export interface QuizAttempt {
  id?: number
  chapterId: number
  questionSv: string
  answerSv: string
  selectedSv: string
  correct: boolean
  attemptedAt: number
}

/** Dialogue practice session */
export interface DialogueSession {
  id?: number
  chapterId: number
  dialogueNum: number
  promptSv: string
  selfRating: 1 | 2 | 3 | 4 | 5 | null
  completedAt: number | null
  createdAt: number
}

/** End-of-chapter boss mock session */
export interface BossSession {
  id?: number
  chapterId: number
  dialogueDone: boolean
  opinionDone: boolean
  writingDone: boolean
  completedAt: number | null
  createdAt: number
}

export class YkiDatabase extends Dexie {
  cards!: EntityTable<Card, 'id'>
  reviews!: EntityTable<Review, 'id'>
  progress!: EntityTable<Progress, 'id'>
  settings!: EntityTable<Settings, 'id'>
  writingEntries!: EntityTable<WritingEntry, 'id'>
  quizAttempts!: EntityTable<QuizAttempt, 'id'>
  dialogueSessions!: EntityTable<DialogueSession, 'id'>
  bossSessions!: EntityTable<BossSession, 'id'>

  constructor() {
    super('yki-trainer')

    this.version(1).stores({
      cards: '++id, chapterId, type, nextReview, [chapterId+type]',
      reviews: '++id, cardId, reviewedAt',
      progress: 'id',
      settings: 'id',
      writingEntries: '++id, chapterId, taskType, completedAt',
      quizAttempts: '++id, chapterId, attemptedAt',
      dialogueSessions: '++id, chapterId, completedAt',
    })

    this.version(2).stores({
      bossSessions: '++id, chapterId, completedAt',
    })

    this.version(3).stores({}).upgrade(async (tx) => {
      const settings = await tx.table('settings').get('main')
      if (settings) {
        await tx.table('settings').put({
          ...settings,
          lastExportedAt: settings.lastExportedAt ?? null,
          lastStudyActivityAt: settings.lastStudyActivityAt ?? null,
          syncReminderHours: settings.syncReminderHours ?? 24,
          syncReminderDismissedUntil: settings.syncReminderDismissedUntil ?? null,
        })
      }
    })

    this.version(4).stores({}).upgrade(async (tx) => {
      const cards = await tx.table('cards').toArray()
      for (const card of cards) {
        const legacy = card as Record<string, unknown>
        if (legacy.backFi != null && legacy.backSv == null) {
          await tx.table('cards').update(card.id, {
            backSv: String(legacy.backFi),
          })
        }
      }
      const entries = await tx.table('writingEntries').toArray()
      for (const entry of entries) {
        const legacy = entry as Record<string, unknown>
        if (legacy.contentFi != null && legacy.contentSv == null) {
          await tx.table('writingEntries').update(entry.id, {
            contentSv: String(legacy.contentFi),
          })
        }
      }
    })
  }
}

export const db = new YkiDatabase()

export const DEFAULT_PROGRESS: Progress = {
  id: 'main',
  xp: 0,
  level: 1,
  streakDays: 0,
  lastStudyDate: null,
  unlockedChapters: [1],
  chapterProgress: {},
  badges: [],
  dailyQuestsCompleted: [],
  dailyQuestsDate: null,
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  examDate: null,
  seededAt: null,
  minStudyMinutes: 15,
  lastExportedAt: null,
  lastStudyActivityAt: null,
  syncReminderHours: 24,
  syncReminderDismissedUntil: null,
}
