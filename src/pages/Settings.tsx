import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, DEFAULT_SETTINGS } from '../db/schema'
import { daysUntilExam } from '../lib/xp'
import { copyBackupToClipboard, exportProgress, importProgress } from '../lib/backup'
import {
  canShareBackup,
  formatLastSync,
  hasUnsyncedChanges,
  performSync,
} from '../lib/sync'

export function Settings() {
  const settings = useLiveQuery(() => db.settings.get('main'))
  const [examDateInput, setExamDateInput] = useState('')
  const [minStudyInput, setMinStudyInput] = useState('')
  const [reminderHoursInput, setReminderHoursInput] = useState('')
  const [status, setStatus] = useState<{ type: 'ok' | 'error'; message: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const examDate = examDateInput || settings?.examDate || ''
  const minStudyMinutes = minStudyInput
    ? Number(minStudyInput)
    : (settings?.minStudyMinutes ?? 15)
  const syncReminderHours = reminderHoursInput
    ? Number(reminderHoursInput)
    : (settings?.syncReminderHours ?? 24)
  const daysLeft = daysUntilExam(settings?.examDate ?? null)
  const unsynced = hasUnsyncedChanges(settings)

  async function saveSettings() {
    if (!examDate) {
      setStatus({ type: 'error', message: 'Välj ett provdatum.' })
      return
    }
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      ...settings,
      id: 'main',
      examDate,
      seededAt: settings?.seededAt ?? null,
      minStudyMinutes: Number.isFinite(minStudyMinutes) ? minStudyMinutes : 15,
      syncReminderHours: Number.isFinite(syncReminderHours) ? syncReminderHours : 24,
    })
    setStatus({ type: 'ok', message: 'Inställningar sparade.' })
  }

  async function handleSync(mode: 'auto' | 'download' | 'share' = 'auto') {
    setExporting(true)
    setStatus(null)
    try {
      const result = await performSync(mode)
      const via =
        result.method === 'share'
          ? 'delat (spara till iCloud Drive på iPhone/Mac)'
          : 'nedladdat som fil'
      setStatus({ type: 'ok', message: `Synkad — ${via}.` })
    } catch {
      setStatus({ type: 'error', message: 'Synkning misslyckades.' })
    } finally {
      setExporting(false)
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return
    const confirmed = window.confirm(
      'Detta ersätter all lokal data med innehållet i filen. Fortsätt?',
    )
    if (!confirmed) return

    setImporting(true)
    setStatus(null)
    try {
      await importProgress(file)
      setStatus({ type: 'ok', message: 'Framsteg importerat från säkerhetskopia.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import misslyckades.'
      setStatus({ type: 'error', message })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Inställningar</h1>
        <p className="mt-1 text-slate-600">Provdatum, synk och enheter</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Provdatum</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sätt ditt YKI-provdatum. Nedräkningen visas på{' '}
          <Link to="/" className="text-indigo-600 hover:text-indigo-800">
            dashboarden
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Datum</span>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDateInput(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Min/dag för streak</span>
            <input
              type="number"
              min={1}
              max={120}
              value={minStudyInput || String(settings?.minStudyMinutes ?? 15)}
              onChange={(e) => setMinStudyInput(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Synkpåminnelse (h)</span>
            <input
              type="number"
              min={1}
              max={168}
              value={reminderHoursInput || String(settings?.syncReminderHours ?? 24)}
              onChange={(e) => setReminderHoursInput(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={saveSettings}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Spara
          </button>
        </div>
        {settings?.examDate && (
          <p className="mt-3 text-sm text-slate-700">
            Sparat: <strong>{settings.examDate}</strong>
            {daysLeft != null && (
              <span className="text-slate-500"> — {daysLeft} dagar kvar</span>
            )}
          </p>
        )}
      </section>

      <section
        className={`rounded-xl border p-6 ${
          unsynced ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
        }`}
      >
        <h2 className="text-lg font-semibold text-slate-900">Synka mellan enheter</h2>
        <p className="mt-1 text-sm text-slate-600">
          {formatLastSync(settings)}
          {unsynced && (
            <span className="ml-1 font-medium text-amber-800">— osparade ändringar</span>
          )}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          <strong>Synka nu</strong> exporterar din data. På iPhone/Mac öppnas delningsmenyn
          (spara till iCloud Drive eller AirDrop). På PC laddas en JSON-fil ner.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Synka på enheten du studerat på.</li>
          <li>Flytta filen via iCloud Drive, AirDrop eller e-post.</li>
          <li>Importera JSON på den andra enheten.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleSync('auto')}
            disabled={exporting}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 min-h-11"
          >
            {exporting ? 'Synkar…' : canShareBackup() ? 'Synka nu (dela)' : 'Synka nu'}
          </button>
          <button
            type="button"
            onClick={() => handleSync('download')}
            disabled={exporting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-11"
          >
            Ladda ner JSON
          </button>
          <button
            type="button"
            onClick={async () => {
              setExporting(true)
              try {
                const data = await exportProgress()
                await copyBackupToClipboard(data)
                setStatus({ type: 'ok', message: 'JSON kopierad till urklipp.' })
              } catch {
                setStatus({ type: 'error', message: 'Kunde inte kopiera.' })
              } finally {
                setExporting(false)
              }
            }}
            disabled={exporting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-11"
          >
            Kopiera JSON
          </button>
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-11 inline-flex items-center">
            {importing ? 'Importerar…' : 'Importera JSON'}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={importing}
              onChange={(e) => handleImport(e.target.files?.[0])}
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Kör på iPhone</h2>
        <p className="mt-1 text-sm text-slate-700">
          På datorn (PC eller Mac), i projektmappen:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`npm install
npm run build
npm run preview:host`}
        </pre>
        <p className="mt-3 text-sm text-slate-700">
          Öppna på iPhone (samma Wi‑Fi):{' '}
          <code className="rounded bg-white px-1">http://&lt;datorns-ip&gt;:4173</code>
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Safari → Dela → <strong>Lägg till på hemskärmen</strong>. Synka via iCloud Drive
          mellan iPhone och Mac för enklast överföring.
        </p>
      </section>

      {status && (
        <p
          className={`rounded-lg px-4 py-2 text-sm ${
            status.type === 'ok'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  )
}
