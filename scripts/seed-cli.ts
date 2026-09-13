import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BookData } from '../src/db/seed'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bookPath = resolve(__dirname, '../data/book.json')

function validateBook(book: BookData): void {
  if (!Array.isArray(book.chapters) || book.chapters.length === 0) {
    throw new Error('book.json must contain at least one chapter')
  }
  if (book.chapters.length !== 7) {
    throw new Error(`book.json must contain 7 chapters, got ${book.chapters.length}`)
  }

  let totalReagera = 0
  let totalBeratta = 0
  let totalDialogues = 0
  const errors: string[] = []

  for (const ch of book.chapters) {
    if (!ch.id || !ch.title_sv) {
      throw new Error(`Chapter missing id or title_sv: ${JSON.stringify(ch)}`)
    }

    const writing = ch.writing ?? []
    if (writing.length !== 3) {
      errors.push(`chapter ${ch.id}: expected 3 writing tasks, got ${writing.length}`)
    }
    for (const task of writing) {
      const prompt = task.prompt_sv ?? ''
      if (prompt.endsWith(' men') || prompt.endsWith(' men,')) {
        errors.push(`chapter ${ch.id} writing: prompt ends with "men"`)
      }
      if (prompt.includes('ISBN') || prompt.includes('SBN 978')) {
        errors.push(`chapter ${ch.id} writing: contains ISBN junk`)
      }
    }

    const reagera = ch.reagera ?? []
    totalReagera += reagera.length
    if (ch.id === 1 && reagera.length < 15) {
      errors.push(`chapter 1 Reagera: expected >= 15, got ${reagera.length}`)
    }

    const checkDupes = (items: string[], label: string) => {
      for (let i = 1; i < items.length; i++) {
        if (items[i] === items[i - 1]) {
          errors.push(`chapter ${ch.id} ${label}: consecutive duplicate at ${i}`)
        }
      }
    }
    checkDupes(reagera, 'reagera')
    checkDupes(ch.beratta ?? [], 'beratta')
    checkDupes(ch.asikt ?? [], 'asikt')

    const beratta = ch.beratta ?? []
    totalBeratta += beratta.length
    const asikt = ch.asikt ?? []
    if (ch.id === 2 && asikt.length < 4) {
      errors.push(`chapter 2 asikt: expected >= 4, got ${asikt.length}`)
    }

    for (const block of [...beratta, ...asikt]) {
      if (block.endsWith('Berätta') || block.endsWith('Din åsikt')) {
        errors.push(`chapter ${ch.id} speaking block ends with section header`)
      }
    }

    const dialogues = ch.dialogues ?? []
    totalDialogues += dialogues.length
    for (const d of dialogues) {
      const prompt = (d.prompt_sv ?? '').trim()
      const model = (d.model_sv ?? '').trim()
      if (!model) {
        errors.push(`chapter ${ch.id} dialogue ${d.num}: empty model_sv`)
      } else if (model === prompt) {
        errors.push(`chapter ${ch.id} dialogue ${d.num}: model_sv equals prompt_sv`)
      }
    }
  }

  if (totalReagera < 95) {
    errors.push(`total Reagera: expected >= 95, got ${totalReagera}`)
  }
  if (totalBeratta < 30) {
    errors.push(`total Berätta: expected >= 30, got ${totalBeratta}`)
  }
  if (totalDialogues !== 34) {
    errors.push(`total dialogues: expected 34, got ${totalDialogues}`)
  }

  if (errors.length > 0) {
    throw new Error(`book.json validation failed:\n  - ${errors.join('\n  - ')}`)
  }
}

function summarize(book: BookData): void {
  let vocab = 0
  let verbs = 0
  let dialogues = 0
  let speaking = 0
  let writing = 0
  let quiz = 0

  for (const ch of book.chapters) {
    vocab += ch.vocabulary?.length ?? 0
    verbs += ch.verbs?.length ?? 0
    dialogues += ch.dialogues?.length ?? 0
    speaking += (ch.reagera?.length ?? 0) + (ch.beratta?.length ?? 0) + (ch.asikt?.length ?? 0)
    writing += ch.writing?.length ?? 0
    quiz += ch.vilket_ord?.length ?? 0
  }

  console.log(`Validated ${bookPath}`)
  console.log(`  Chapters:  ${book.chapters.length}`)
  console.log(`  Vocab:     ${vocab}`)
  console.log(`  Verbs:     ${verbs}`)
  console.log(`  Dialogues: ${dialogues}`)
  console.log(`  Speaking:  ${speaking}`)
  console.log(`  Writing:   ${writing}`)
  console.log(`  Quiz:      ${quiz}`)
  console.log('')
  console.log('Content loads into IndexedDB on first app launch (npm run dev).')
}

function main() {
  const raw = readFileSync(bookPath, 'utf-8')
  const book = JSON.parse(raw) as BookData
  validateBook(book)
  summarize(book)
}

main()
