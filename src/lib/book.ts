import bookData from '../../data/book.json'
import type { BookChapter, BookData } from '../db/seed'

const book = bookData as BookData

export function getChapters(): BookChapter[] {
  return book.chapters
}

export function getChapter(id: number): BookChapter | undefined {
  return book.chapters.find((c) => c.id === id)
}

export function getChapterIds(): number[] {
  return book.chapters.map((c) => c.id)
}
