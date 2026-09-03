/** SM-2 spaced repetition algorithm */

export type Sm2Rating = 1 | 2 | 3 | 4 | 5

export interface Sm2State {
  easeFactor: number
  interval: number
  repetitions: number
}

export interface Sm2Result extends Sm2State {
  nextReview: number
}

const MS_PER_DAY = 86_400_000

/** Map UI buttons (Again/Hard/Good/Easy) to SM-2 quality 0–5 */
export function ratingToQuality(rating: Sm2Rating): number {
  switch (rating) {
    case 1:
      return 1
    case 2:
      return 3
    case 3:
      return 4
    case 4:
      return 5
    case 5:
      return 5
    default:
      return 3
  }
}

export function scheduleReview(
  state: Sm2State,
  rating: Sm2Rating,
  now = Date.now(),
): Sm2Result {
  const q = ratingToQuality(rating)
  let { easeFactor, interval, repetitions } = state

  if (q < 3) {
    repetitions = 0
    interval = 1
  } else {
    if (repetitions === 0) {
      interval = 1
    } else if (repetitions === 1) {
      interval = 6
    } else {
      interval = Math.round(interval * easeFactor)
    }
    repetitions += 1
  }

  easeFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  )

  return {
    easeFactor,
    interval,
    repetitions,
    nextReview: now + interval * MS_PER_DAY,
  }
}

export function isDue(nextReview: number, now = Date.now()): boolean {
  return nextReview <= now
}
