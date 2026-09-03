import { db, DEFAULT_SETTINGS } from '../db/schema'
import type {
  BossSession,
  Card,
  DialogueSession,
  Progress,
  QuizAttempt,
  Review,
  Settings,
  WritingEntry,
} from '../db/schema'
import { recordExport } from './sync'

export interface BackupData {
  version: 1
  exportedAt: string
  progress: Progress | null
  settings: Settings | null
  cards: Card[]
  reviews: Review[]
  writingEntries: WritingEntry[]
  quizAttempts: QuizAttempt[]
  dialogueSessions: DialogueSession[]
  bossSessions: BossSession[]
}

export async function exportProgress(): Promise<BackupData> {
  const [
    progress,
    settings,
    cards,
    reviews,
    writingEntries,
    quizAttempts,
    dialogueSessions,
    bossSessions,
  ] = await Promise.all([
    db.progress.get('main'),
    db.settings.get('main'),
    db.cards.toArray(),
    db.reviews.toArray(),
    db.writingEntries.toArray(),
    db.quizAttempts.toArray(),
    db.dialogueSessions.toArray(),
    db.bossSessions.toArray(),
  ])

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: progress ?? null,
    settings: settings ?? null,
    cards,
    reviews,
    writingEntries,
    quizAttempts,
    dialogueSessions,
    bossSessions,
  }
}

export function downloadBackup(data: BackupData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = data.exportedAt.slice(0, 10)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `yki-trainer-backup-${date}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

function isBackupData(value: unknown): value is BackupData {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    obj.version === 1 &&
    typeof obj.exportedAt === 'string' &&
    Array.isArray(obj.cards) &&
    Array.isArray(obj.reviews) &&
    Array.isArray(obj.writingEntries) &&
    Array.isArray(obj.quizAttempts) &&
    Array.isArray(obj.dialogueSessions) &&
    Array.isArray(obj.bossSessions)
  )
}

export async function importProgressFromJson(text: string): Promise<void> {
  const parsed: unknown = JSON.parse(text)
  if (!isBackupData(parsed)) {
    throw new Error('Ogiltig säkerhetskopieringsfil')
  }

  const data = parsed

  await db.transaction(
    'rw',
    [
      db.cards,
      db.reviews,
      db.progress,
      db.settings,
      db.writingEntries,
      db.quizAttempts,
      db.dialogueSessions,
      db.bossSessions,
    ],
    async () => {
      await db.cards.clear()
      await db.reviews.clear()
      await db.writingEntries.clear()
      await db.quizAttempts.clear()
      await db.dialogueSessions.clear()
      await db.bossSessions.clear()

      if (data.cards.length > 0) await db.cards.bulkPut(data.cards)
      if (data.reviews.length > 0) await db.reviews.bulkPut(data.reviews)
      if (data.writingEntries.length > 0) await db.writingEntries.bulkPut(data.writingEntries)
      if (data.quizAttempts.length > 0) await db.quizAttempts.bulkPut(data.quizAttempts)
      if (data.dialogueSessions.length > 0) await db.dialogueSessions.bulkPut(data.dialogueSessions)
      if (data.bossSessions.length > 0) await db.bossSessions.bulkPut(data.bossSessions)
      if (data.progress) await db.progress.put(data.progress)
      if (data.settings) {
        await db.settings.put({ ...DEFAULT_SETTINGS, ...data.settings, id: 'main' })
      }
    },
  )

  await recordExport(data.exportedAt)
}

export async function importProgress(file: File): Promise<void> {
  const text = await file.text()
  await importProgressFromJson(text)
}

export function serializeBackup(data: BackupData): string {
  return JSON.stringify(data, null, 2)
}

export async function copyBackupToClipboard(data: BackupData): Promise<void> {
  await navigator.clipboard.writeText(serializeBackup(data))
}

export async function shareBackup(data: BackupData): Promise<boolean> {
  const json = serializeBackup(data)
  const date = data.exportedAt.slice(0, 10)
  const file = new File([json], `yki-trainer-backup-${date}.json`, {
    type: 'application/json',
  })

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: 'YKI Trainer backup',
      files: [file],
    })
    return true
  }

  if (navigator.share) {
    await navigator.share({
      title: 'YKI Trainer backup',
      text: json,
    })
    return true
  }

  return false
}
