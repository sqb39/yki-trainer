import { db, DEFAULT_SETTINGS, type Settings } from '../db/schema'
import { downloadBackup, exportProgress, shareBackup } from './backup'

export const DEFAULT_SYNC_REMINDER_HOURS = 24

export type SyncMethod = 'share' | 'download'

export interface SyncResult {
  method: SyncMethod
  exportedAt: string
}

function settingsWithDefaults(settings: Settings | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    id: 'main',
    lastExportedAt: settings?.lastExportedAt ?? null,
    lastStudyActivityAt: settings?.lastStudyActivityAt ?? null,
    syncReminderHours: settings?.syncReminderHours ?? DEFAULT_SYNC_REMINDER_HOURS,
    syncReminderDismissedUntil: settings?.syncReminderDismissedUntil ?? null,
  }
}

export function canShareBackup(): boolean {
  return typeof navigator.share === 'function'
}

export function hasUnsyncedChanges(settings: Settings | undefined): boolean {
  const s = settingsWithDefaults(settings)
  if (!s.lastStudyActivityAt) return false
  if (!s.lastExportedAt) return true
  return s.lastStudyActivityAt > s.lastExportedAt
}

export function hoursSinceExport(settings: Settings | undefined): number | null {
  const s = settingsWithDefaults(settings)
  if (!s.lastExportedAt) return null
  const ms = Date.now() - new Date(s.lastExportedAt).getTime()
  return ms / (1000 * 60 * 60)
}

export function shouldShowSyncReminder(settings: Settings | undefined): boolean {
  const s = settingsWithDefaults(settings)
  if (s.syncReminderDismissedUntil) {
    if (new Date(s.syncReminderDismissedUntil).getTime() > Date.now()) {
      return false
    }
  }
  if (hasUnsyncedChanges(s)) return true
  const hours = hoursSinceExport(s)
  if (hours === null && s.lastStudyActivityAt) return true
  if (hours !== null && hours >= s.syncReminderHours) return true
  return false
}

export function formatLastSync(settings: Settings | undefined): string {
  const s = settingsWithDefaults(settings)
  if (!s.lastExportedAt) return 'Aldrig synkad'
  const hours = hoursSinceExport(s)
  if (hours === null) return 'Aldrig synkad'
  if (hours < 1) return 'Synkad för mindre än en timme sedan'
  if (hours < 24) return `Synkad för ${Math.floor(hours)} h sedan`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Synkad igår'
  return `Synkad för ${days} dagar sedan`
}

export async function markStudyActivity(): Promise<void> {
  const now = new Date().toISOString()
  const settings = await db.settings.get('main')
  await db.settings.put({
    ...settingsWithDefaults(settings),
    lastStudyActivityAt: now,
  })
}

export async function recordExport(exportedAt?: string): Promise<void> {
  const now = exportedAt ?? new Date().toISOString()
  const settings = await db.settings.get('main')
  await db.settings.put({
    ...settingsWithDefaults(settings),
    lastExportedAt: now,
    syncReminderDismissedUntil: null,
  })
}

export async function dismissSyncReminderForToday(): Promise<void> {
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)
  const settings = await db.settings.get('main')
  await db.settings.put({
    ...settingsWithDefaults(settings),
    syncReminderDismissedUntil: endOfDay.toISOString(),
  })
}

export async function performSync(mode: 'auto' | 'download' | 'share' = 'auto'): Promise<SyncResult> {
  const data = await exportProgress()
  const exportedAt = new Date().toISOString()
  data.exportedAt = exportedAt

  const preferShare = mode === 'share' || mode === 'auto'

  if (preferShare && canShareBackup()) {
    try {
      const shared = await shareBackup(data)
      if (shared) {
        await recordExport(exportedAt)
        return { method: 'share', exportedAt }
      }
    } catch (err) {
      if (mode === 'share') throw err
    }
  }

  downloadBackup(data)
  await recordExport(exportedAt)
  return { method: 'download', exportedAt }
}
