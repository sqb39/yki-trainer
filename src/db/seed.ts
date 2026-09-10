import { db, DEFAULT_PROGRESS, DEFAULT_SETTINGS, type Card } from './schema'
import { todayIso } from '../lib/xp'

export interface BookChapter {
  id: number
  title_sv: string
  vocabulary: string[]
  verbs: Array<{ sv: string; prompt_sv: string }>
  vilket_ord: Array<{ question_sv: string; answer_sv: string }>
  dialogues: Array<{ num: number; prompt_sv: string; model_sv: string }>
  reagera: string[]
  beratta: string[]
  asikt: string[]
  writing: Array<{
    type: 'meddelande' | 'e-post' | 'klagomål' | 'övrigt'
    prompt_sv: string
  }>
}

export interface BookData {
  chapters: BookChapter[]
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function vocabBack(chapter: BookChapter, word: string): string {
  const needle = normalize(word)
  const hit = chapter.vilket_ord.find((item) => {
    const answer = normalize(item.answer_sv)
    return needle === answer || needle.includes(answer) || answer.includes(needle)
  })
  if (hit) return hit.question_sv
  return `Förklara ordet och använd det i en mening:\n${word}`
}

function cardKey(card: Pick<Card, 'chapterId' | 'type' | 'frontSv' | 'contextSv'>): string {
  return `${card.chapterId}|${card.type}|${card.frontSv}|${card.contextSv ?? ''}`
}

function cardsFromChapter(chapter: BookChapter): Omit<Card, 'id'>[] {
  const now = Date.now()
  const base = {
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: now,
    createdAt: now,
    updatedAt: now,
  }

  const vocabCards: Omit<Card, 'id'>[] = chapter.vocabulary.map((word) => ({
    ...base,
    chapterId: chapter.id,
    type: 'vocab' as const,
    frontSv: word,
    backSv: vocabBack(chapter, word),
  }))

  const verbCards: Omit<Card, 'id'>[] = chapter.verbs.map((verb) => ({
    ...base,
    chapterId: chapter.id,
    type: 'verb' as const,
    frontSv: `${verb.sv} — ${verb.prompt_sv}`,
    backSv: `Berätta kort: ${verb.sv.toLowerCase()} (${verb.prompt_sv})`,
  }))

  const dialogueCards: Omit<Card, 'id'>[] = chapter.dialogues.map((d) => ({
    ...base,
    chapterId: chapter.id,
    type: 'dialogue' as const,
    frontSv: d.prompt_sv,
    backSv: d.model_sv,
    contextSv: `Dialog ${d.num}`,
  }))

  const speakingPrompts = [
    ...chapter.reagera.map((p) => ({ kind: 'reagera' as const, text: p })),
    ...chapter.beratta.map((p) => ({ kind: 'berätta' as const, text: p })),
    ...chapter.asikt.map((p) => ({ kind: 'åsikt' as const, text: p })),
  ]

  const speakingCards: Omit<Card, 'id'>[] = speakingPrompts.map((p) => ({
    ...base,
    chapterId: chapter.id,
    type: 'speaking' as const,
    frontSv: p.text,
    backSv: 'Tala fritt enligt prompten. Jämför sedan med egna anteckningar.',
    contextSv: p.kind,
  }))

  return [...vocabCards, ...verbCards, ...dialogueCards, ...speakingCards]
}

export async function isSeeded(): Promise<boolean> {
  const settings = await db.settings.get('main')
  return settings?.seededAt != null
}

export async function seedDatabase(book: BookData): Promise<void> {
  const already = await isSeeded()
  if (!already) {
    const allCards = book.chapters.flatMap(cardsFromChapter)
    await db.transaction('rw', [db.cards, db.progress, db.settings], async () => {
      await db.cards.bulkAdd(allCards as Card[])
      await db.progress.put({ ...DEFAULT_PROGRESS })
      await db.settings.put({
        ...DEFAULT_SETTINGS,
        seededAt: todayIso(),
      })
    })
    return
  }

  await syncBookChapters(book)
}

/** Add missing cards and fill empty backs from book.json without overwriting notes. */
export async function syncBookChapters(book: BookData): Promise<number> {
  const existing = await db.cards.toArray()
  const existingKeys = new Set(existing.map((c) => cardKey(c)))
  const wanted = book.chapters.flatMap(cardsFromChapter)
  const toAdd = wanted.filter((card) => !existingKeys.has(cardKey(card)))

  if (toAdd.length > 0) {
    await db.cards.bulkAdd(toAdd as Card[])
  }

  const wantedByKey = new Map(wanted.map((card) => [cardKey(card), card]))
  for (const card of existing) {
    if (!card.id) continue
    const fresh = wantedByKey.get(cardKey(card))
    if (!fresh) continue
    const empty = !card.backSv.trim()
    const canFillDialogue = card.type === 'dialogue' && fresh.backSv && card.backSv !== fresh.backSv && empty
    if (empty && fresh.backSv) {
      await db.cards.update(card.id, { backSv: fresh.backSv, updatedAt: Date.now() })
    } else if (canFillDialogue) {
      await db.cards.update(card.id, { backSv: fresh.backSv, updatedAt: Date.now() })
    }
  }

  return toAdd.length
}

export async function resetSeed(): Promise<void> {
  await db.transaction(
    'rw',
    [db.cards, db.reviews, db.progress, db.settings, db.writingEntries, db.quizAttempts, db.dialogueSessions, db.bossSessions],
    async () => {
      await db.cards.clear()
      await db.reviews.clear()
      await db.writingEntries.clear()
      await db.quizAttempts.clear()
      await db.dialogueSessions.clear()
      await db.bossSessions.clear()
      await db.progress.put({ ...DEFAULT_PROGRESS })
      await db.settings.put({ ...DEFAULT_SETTINGS })
    },
  )
}
