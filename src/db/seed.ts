import { db, DEFAULT_PROGRESS, DEFAULT_SETTINGS, type Card } from './schema'

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
  writing: Array<{ type: 'meddelande' | 'e-post' | 'klagomål'; prompt_sv: string }>
}

export interface BookData {
  chapters: BookChapter[]
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
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
    type: 'vocab',
    frontSv: word,
    backSv: '',
  }))

  const verbCards: Omit<Card, 'id'>[] = chapter.verbs.map((verb) => ({
    ...base,
    chapterId: chapter.id,
    type: 'verb',
    frontSv: `${verb.sv} — ${verb.prompt_sv}`,
    backSv: '',
  }))

  const dialogueCards: Omit<Card, 'id'>[] = chapter.dialogues.map((d) => ({
    ...base,
    chapterId: chapter.id,
    type: 'dialogue',
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
    type: 'speaking',
    frontSv: p.text,
    backSv: '',
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

/** Add cards for chapters present in book.json but not yet in IndexedDB */
export async function syncBookChapters(book: BookData): Promise<number> {
  const existingChapterIds = new Set(
    (await db.cards.toArray()).map((c) => c.chapterId),
  )
  const missing = book.chapters.filter((ch) => !existingChapterIds.has(ch.id))
  if (missing.length === 0) return 0

  const newCards = missing.flatMap(cardsFromChapter)
  await db.cards.bulkAdd(newCards as Card[])
  return missing.length
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
