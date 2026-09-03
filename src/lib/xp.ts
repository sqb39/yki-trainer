/** Gamification: XP, levels, streaks */

export const XP_REWARDS = {
  flashcard: 5,
  quiz: 10,
  dialogue: 15,
  speaking: 12,
  writing: 20,
  boss: 50,
} as const

export const XP_PER_LEVEL = 500

export function levelFromXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function xpProgressInLevel(xp: number): { current: number; max: number; percent: number } {
  const level = levelFromXp(xp)
  const levelStart = (level - 1) * XP_PER_LEVEL
  const current = xp - levelStart
  return {
    current,
    max: XP_PER_LEVEL,
    percent: Math.round((current / XP_PER_LEVEL) * 100),
  }
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** Update streak given last study date and today */
export function nextStreak(lastStudyDate: string | null, today: string): number {
  if (!lastStudyDate) return 1
  const gap = daysBetween(lastStudyDate, today)
  if (gap === 0) return 0 // caller should keep existing streak
  if (gap === 1) return 1 // increment by 1
  return 1 // reset to 1
}

export function daysUntilExam(examDate: string | null): number | null {
  if (!examDate) return null
  const today = todayIso()
  return daysBetween(today, examDate)
}
