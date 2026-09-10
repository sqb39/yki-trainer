/** Gamification: XP, levels, streaks */

export const XP_REWARDS = {
  flashcard: 5,
  quiz: 10,
  dialogue: 15,
  speaking: 12,
  writing: 20,
  boss: 50,
  bossRepeat: 10,
} as const

export const XP_PER_LEVEL = 500

export const DEFAULT_STUDY_SECONDS = {
  flashcard: 20,
  quiz: 25,
  dialogue: 90,
  speaking: 60,
  writing: 180,
  boss: 300,
} as const

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

/** Local calendar date YYYY-MM-DD (not UTC). */
export function todayIso(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function startOfLocalDayMs(isoDate = todayIso()): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

export function daysBetween(a: string, b: string): number {
  const ms = startOfLocalDayMs(b) - startOfLocalDayMs(a)
  return Math.round(ms / 86_400_000)
}

export function daysUntilExam(examDate: string | null): number | null {
  if (!examDate) return null
  return daysBetween(todayIso(), examDate)
}
