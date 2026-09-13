import { getChapter, getChapters } from './book'

export const UNLOCK_THRESHOLD = 80

export const CHAPTER_WEEK_MAP: Record<number, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
}

export const REVIEW_WEEK = 8

export interface RoadmapWeek {
  week: number
  label: string
  chapterId: number | null
  days: string
  focus: string
}

export const ROADMAP_WEEKS: RoadmapWeek[] = [
  {
    week: 1,
    label: 'Vecka 1',
    chapterId: 1,
    days: '1–7',
    focus: 'Människan och omgivningen — dialoger, tal, skrivning, boss',
  },
  {
    week: 2,
    label: 'Vecka 2',
    chapterId: 2,
    days: '8–14',
    focus: 'Vardagsliv + repetition kapitel 1',
  },
  {
    week: 3,
    label: 'Vecka 3',
    chapterId: 3,
    days: '15–21',
    focus: 'Natur och miljö + blandad quiz',
  },
  {
    week: 4,
    label: 'Vecka 4',
    chapterId: 4,
    days: '22–28',
    focus: 'Hälsa och välbefinnande',
  },
  {
    week: 5,
    label: 'Vecka 5',
    chapterId: 5,
    days: '29–35',
    focus: 'Fritid och hobbyer',
  },
  {
    week: 6,
    label: 'Vecka 6',
    chapterId: 6,
    days: '36–42',
    focus: 'Arbete och utbildning',
  },
  {
    week: 7,
    label: 'Vecka 7',
    chapterId: 7,
    days: '43–49',
    focus: 'Samhälle',
  },
  {
    week: 8,
    label: 'Vecka 8',
    chapterId: null,
    days: '50–56',
    focus: 'Repetition — mockprov över alla teman',
  },
]

export const BADGE_DEFINITIONS: Record<
  string,
  { label: string; description: string; emoji: string }
> = {
  'streak-7': {
    label: '7-dagars streak',
    description: 'Studerat 7 dagar i rad',
    emoji: '🔥',
  },
  'chapter-1-cleared': {
    label: 'Kapitel 1 klar',
    description: '80 % framsteg i kapitel 1',
    emoji: '🏆',
  },
  'chapter-2-cleared': {
    label: 'Kapitel 2 klar',
    description: '80 % framsteg i kapitel 2',
    emoji: '🏆',
  },
  'chapter-3-cleared': {
    label: 'Kapitel 3 klar',
    description: '80 % framsteg i kapitel 3',
    emoji: '🏆',
  },
  'chapter-4-cleared': {
    label: 'Kapitel 4 klar',
    description: '80 % framsteg i kapitel 4',
    emoji: '🏆',
  },
  'chapter-5-cleared': {
    label: 'Kapitel 5 klar',
    description: '80 % framsteg i kapitel 5',
    emoji: '🏆',
  },
  'chapter-6-cleared': {
    label: 'Kapitel 6 klar',
    description: '80 % framsteg i kapitel 6',
    emoji: '🏆',
  },
  'chapter-7-cleared': {
    label: 'Kapitel 7 klar',
    description: '80 % framsteg i kapitel 7',
    emoji: '🏆',
  },
  'words-100': {
    label: '100 ord bemästrade',
    description: '100 flashcards med godkänd repetition',
    emoji: '📚',
  },
  'writing-trio': {
    label: 'Skrivtrio klar',
    description: 'Alla tre skrivuppgifter i ett kapitel',
    emoji: '✍️',
  },
  'boss-first': {
    label: 'Första bossen',
    description: 'Klarade ett kapitelboss-prov',
    emoji: '👑',
  },
  'quests-all': {
    label: 'Dagens hjälte',
    description: 'Alla dagliga uppdrag klara',
    emoji: '⭐',
  },
}

export function getChapterTitle(chapterId: number): string {
  return getChapter(chapterId)?.title_sv ?? `Kapitel ${chapterId}`
}

export function getAllChapterIds(): number[] {
  return getChapters().map((c) => c.id)
}

/** All chapters are always accessible; kept for backward compatibility. */
export function isChapterUnlocked(
  _chapterId: number,
  _unlockedChapters?: number[],
  _chapterProgress?: Record<number, number>,
): boolean {
  return true
}

/** Returns all chapter IDs; chapters are never gated. */
export function unlockedChapterIds(allIds: number[]): number[] {
  return allIds
}

/** First chapter under 80%, or the last chapter if all are complete. */
export function suggestedChapter(chapterProgress: Record<number, number>): number {
  const allIds = getAllChapterIds()
  const firstIncomplete = allIds.find((id) => (chapterProgress[id] ?? 0) < UNLOCK_THRESHOLD)
  if (firstIncomplete != null) return firstIncomplete
  return allIds[allIds.length - 1] ?? 1
}
