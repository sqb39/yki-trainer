import bookData from '../../data/book.json'
import type { BookChapter, BookData } from '../db/seed'
import { ensureWritingTrio } from './writing'

const book = bookData as BookData

function withWriting(chapter: BookChapter): BookChapter {
  return { ...chapter, writing: ensureWritingTrio(chapter) }
}

export function getChapters(): BookChapter[] {
  return book.chapters.map(withWriting)
}

export function getChapter(id: number): BookChapter | undefined {
  const chapter = book.chapters.find((c) => c.id === id)
  return chapter ? withWriting(chapter) : undefined
}

export function getChapterIds(): number[] {
  return book.chapters.map((c) => c.id)
}
