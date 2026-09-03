import { db, type Card } from '../db/schema'
import { isDue, scheduleReview, type Sm2Rating } from './sm2'

export type CardTypeFilter = 'all' | 'vocab' | 'verb' | 'dialogue'

export async function getDueCards(
  chapterId: number | 'all',
  typeFilter: CardTypeFilter,
): Promise<Card[]> {
  const now = Date.now()
  let cards: Card[]

  if (chapterId === 'all') {
    cards = await db.cards.toArray()
  } else {
    cards = await db.cards.where('chapterId').equals(chapterId).toArray()
  }

  return cards
    .filter((c) => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false
      if (c.type === 'speaking' || c.type === 'writing') return false
      return isDue(c.nextReview, now)
    })
    .sort((a, b) => a.nextReview - b.nextReview)
}

export function formatInterval(days: number): string {
  if (days < 1) return '<1 d'
  if (days === 1) return '1 d'
  if (days < 30) return `${days} d`
  const months = Math.round(days / 30)
  return months === 1 ? '1 mån' : `${months} mån`
}

export function previewInterval(card: Card, rating: Sm2Rating): string {
  const result = scheduleReview(card, rating)
  return formatInterval(result.interval)
}

export const CARD_TYPE_LABELS: Record<Card['type'], string> = {
  vocab: 'Ord',
  verb: 'Verb',
  dialogue: 'Dialog',
  speaking: 'Tala',
  writing: 'Skriva',
}

export const RATING_BUTTONS: Array<{
  rating: Sm2Rating
  label: string
  sublabel: string
  className: string
}> = [
  {
    rating: 1,
    label: 'Igen',
    sublabel: 'Glömt',
    className: 'bg-rose-100 text-rose-800 hover:bg-rose-200 border-rose-200',
  },
  {
    rating: 2,
    label: 'Svårt',
    sublabel: 'Med möda',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200',
  },
  {
    rating: 3,
    label: 'Bra',
    sublabel: 'Kom ihåg',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200',
  },
  {
    rating: 4,
    label: 'Lätt',
    sublabel: 'Perfekt',
    className: 'bg-sky-100 text-sky-800 hover:bg-sky-200 border-sky-200',
  },
]
