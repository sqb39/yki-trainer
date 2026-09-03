import type { BookChapter } from '../db/seed'

export interface QuizQuestion {
  chapterId: number
  questionSv: string
  answerSv: string
  options: string[]
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase()
}

function buildOptions(correct: string, pool: string[]): string[] {
  const distractors = shuffle(
    pool.filter((a) => normalizeAnswer(a) !== normalizeAnswer(correct)),
  ).slice(0, 3)

  while (distractors.length < 3) {
    distractors.push(`alternativ ${distractors.length + 1}`)
  }

  return shuffle([correct, ...distractors])
}

export function buildQuizQuestions(
  chapter: BookChapter,
  count?: number,
): QuizQuestion[] {
  const pool = chapter.vilket_ord.map((q) => q.answer_sv)
  const questions = shuffle(chapter.vilket_ord).map((item) => ({
    chapterId: chapter.id,
    questionSv: item.question_sv,
    answerSv: item.answer_sv,
    options: buildOptions(item.answer_sv, pool),
  }))

  if (count != null && count < questions.length) {
    return questions.slice(0, count)
  }

  return questions
}

export function isCorrectAnswer(selected: string, answer: string): boolean {
  return normalizeAnswer(selected) === normalizeAnswer(answer)
}
