import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Settings } from '../db/schema'
import {
  canShareBackup,
  dismissSyncReminderForToday,
  formatLastSync,
  hasUnsyncedChanges,
  performSync,
  shouldShowSyncReminder,
} from '../lib/sync'

interface SyncBannerProps {
  settings: Settings | undefined
}

export function SyncBanner({ settings }: SyncBannerProps) {
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)

  if (hidden || !shouldShowSyncReminder(settings)) return null

  const unsynced = hasUnsyncedChanges(settings)
  const lastSync = formatLastSync(settings)

  async function handleSync() {
    setSyncing(true)
    setMessage(null)
    try {
      const result = await performSync('auto')
      if (result.method === 'share') {
        setMessage('Delat — spara till iCloud Drive eller AirDrop till din andra enhet.')
      } else {
        setMessage('Nedladdad — flytta filen till iCloud och importera på den andra enheten.')
      }
      setHidden(true)
    } catch {
      setMessage('Synkning misslyckades. Försök igen i Inställningar.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDismiss() {
    await dismissSyncReminderForToday()
    setHidden(true)
  }

  return (
    <section
      className={`rounded-xl border p-5 ${
        unsynced
          ? 'border-amber-300 bg-amber-50'
          : 'border-sky-200 bg-sky-50'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {unsynced ? 'Osparade ändringar' : 'Dags att synka'}
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            {unsynced
              ? 'Du har studerat sedan senaste säkerhetskopieringen. Synka innan du byter enhet.'
              : `Det är ett tag sedan du synkade (${lastSync.toLowerCase()}).`}
          </p>
          <p className="mt-1 text-xs text-slate-500">{lastSync}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 min-h-11"
          >
            {syncing ? 'Synkar…' : canShareBackup() ? 'Synka nu (dela)' : 'Synka nu'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 min-h-11"
          >
            Påminn mig imorgon
          </button>
        </div>
      </div>
      {message && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}{' '}
          <Link to="/settings" className="font-medium underline">
            Importera i Inställningar →
          </Link>
        </p>
      )}
    </section>
  )
}
