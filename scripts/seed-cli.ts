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
  for (const ch of book.chapters) {
    if (!ch.id || !ch.title_sv) {
      throw new Error(`Chapter missing id or title_sv: ${JSON.stringify(ch)}`)
    }
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
