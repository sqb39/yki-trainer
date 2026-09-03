import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, type WritingEntry } from '../db/schema'
import { getChapter, getChapterIds } from '../lib/book'
import { completeWritingEntry, saveWritingEntry } from '../lib/progress'
import {
  checklistComplete,
  emptyChecklist,
  TASK_TYPE_LABELS,
  WRITING_CHECKLISTS,
} from '../lib/writing'
import { XP_REWARDS } from '../lib/xp'

export function Writing() {
  const chapterIds = getChapterIds()
  const [chapterId, setChapterId] = useState(chapterIds[0] ?? 1)
  const [activeTask, setActiveTask] = useState<WritingEntry['taskType'] | null>(null)
  const [contentFi, setContentFi] = useState('')
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [, setEntryId] = useState<number | null>(null)
  const [completedAt, setCompletedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastXp, setLastXp] = useState<number | null>(null)

  const chapter = getChapter(chapterId)
  const tasks = chapter?.writing ?? []

  const savedEntries = useLiveQuery(
    () => db.writingEntries.where('chapterId').equals(chapterId).toArray(),
    [chapterId],
  )

  const completedCount = savedEntries?.filter((e) => e.completedAt != null).length ?? 0

  useEffect(() => {
    if (!activeTask) return
    const existing = savedEntries?.find((e) => e.taskType === activeTask)
    if (existing) {
      setEntryId(existing.id ?? null)
      setContentFi(existing.contentFi)
      setChecklist(existing.checklist)
      setCompletedAt(existing.completedAt)
    } else {
      setEntryId(null)
      setContentFi('')
      setChecklist(emptyChecklist(activeTask))
      setCompletedAt(null)
    }
    setLastXp(null)
  }, [activeTask, savedEntries, chapterId])

  async function persistDraft() {
    if (!activeTask || !chapter) return
    const task = tasks.find((t) => t.type === activeTask)
    if (!task) return

    setSaving(true)
    try {
      const id = await saveWritingEntry({
        chapterId,
        taskType: activeTask,
        promptSv: task.prompt_sv,
        contentFi,
        checklist,
        completedAt,
      })
      setEntryId(id)
    } finally {
      setSaving(false)
    }
  }

  async function markComplete() {
    if (!activeTask || !chapter || completedAt) return
    const task = tasks.find((t) => t.type === activeTask)
    if (!task) return
    if (!contentFi.trim() || !checklistComplete(activeTask, checklist)) return

    setSaving(true)
    try {
      const id = await saveWritingEntry({
        chapterId,
        taskType: activeTask,
        promptSv: task.prompt_sv,
        contentFi,
        checklist,
        completedAt: null,
      })
      setEntryId(id)
      const { xpGained } = await completeWritingEntry(id)
      setCompletedAt(Date.now())
      setLastXp(xpGained)
    } finally {
      setSaving(false)
    }
  }

  function toggleChecklistItem(id: string) {
    if (completedAt) return
    setChecklist((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const activeTaskDef = activeTask ? tasks.find((t) => t.type === activeTask) : null
  const canComplete =
    activeTask &&
    contentFi.trim().length > 0 &&
    checklistComplete(activeTask, checklist) &&
    !completedAt

  if (activeTask && activeTaskDef) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <button
          type="button"
          onClick={() => setActiveTask(null)}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Tillbaka till uppgifter
        </button>

        <header>
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
            {TASK_TYPE_LABELS[activeTask]}
          </span>
          <h2 className="mt-2 text-xl font-bold text-slate-900">
            Kapitel {chapterId} — skrivuppgift
          </h2>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Uppgift (svenska)
          </p>
          <p className="mt-3 whitespace-pre-wrap text-slate-800">{activeTaskDef.prompt_sv}</p>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-900">
            Ditt svar (finska)
          </label>
          <textarea
            value={contentFi}
            onChange={(e) => setContentFi(e.target.value)}
            disabled={!!completedAt}
            rows={12}
            placeholder="Skriv ditt svar på finska här…"
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 disabled:bg-slate-50"
          />
          <p className="mt-1 text-xs text-slate-400">
            {contentFi.trim().split(/\s+/).filter(Boolean).length} ord
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-900">YKI-checklista</p>
          <ul className="mt-3 space-y-2">
            {WRITING_CHECKLISTS[activeTask].map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={checklist[item.id] ?? false}
                    disabled={!!completedAt}
                    onChange={() => toggleChecklistItem(item.id)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span className={checklist[item.id] ? 'text-emerald-700' : 'text-slate-700'}>
                    {item.labelSv}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-3">
          {!completedAt && (
            <button
              type="button"
              onClick={() => void persistDraft()}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? 'Sparar…' : 'Spara utkast'}
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              onClick={() => void markComplete()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Markera som klar (+{XP_REWARDS.writing} XP)
            </button>
          )}
          {completedAt && (
            <p className="text-sm font-medium text-emerald-700">
              ✓ Klar
              {lastXp != null && (
                <span className="text-indigo-600"> — +{lastXp} XP</span>
              )}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Skriva</h1>
        <p className="mt-1 text-slate-600">
          Skrivuppgifter per kapitel med YKI-checklista
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-slate-900">Kapitel</span>
          <select
            value={chapterId}
            onChange={(e) => setChapterId(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2"
          >
            {chapterIds.map((id) => (
              <option key={id} value={id}>
                Kapitel {id}
                {getChapter(id) ? `: ${getChapter(id)!.title_sv}` : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-4 text-sm text-slate-600">
          {completedCount} av {tasks.length} uppgifter klara
        </p>
      </section>

      <ul className="space-y-3">
        {tasks.map((task) => {
          const saved = savedEntries?.find((e) => e.taskType === task.type)
          const done = saved?.completedAt != null
          const started = saved && saved.contentFi.trim().length > 0
          return (
            <li key={task.type}>
              <button
                type="button"
                onClick={() => setActiveTask(task.type)}
                className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-indigo-200 hover:shadow-sm"
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    done
                      ? 'bg-emerald-100 text-emerald-700'
                      : started
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {done ? '✓' : started ? '…' : '○'}
                </span>
                <div>
                  <p className="font-semibold text-slate-900">{TASK_TYPE_LABELS[task.type]}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{task.prompt_sv}</p>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
