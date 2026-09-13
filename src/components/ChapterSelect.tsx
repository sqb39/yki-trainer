import { getChapter, getChapterIds } from '../lib/book'

interface ChapterSelectProps {
  value: number
  onChange: (chapterId: number) => void
}

export function ChapterSelect({ value, onChange }: ChapterSelectProps) {
  const ids = getChapterIds()

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-slate-900">Kapitel</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-slate-300 px-3 py-2"
      >
        {ids.map((id) => (
          <option key={id} value={id}>
            Kapitel {id}
            {getChapter(id) ? `: ${getChapter(id)!.title_sv}` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
