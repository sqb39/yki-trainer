interface QuestCardProps {
  title: string
  description: string
  completed: boolean
  xp: number
}

export function QuestCard({ title, description, completed, xp }: QuestCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 active:scale-[0.99] transition-transform ${
        completed
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-xs font-medium text-indigo-600">+{xp} XP</span>
          <div className="mt-1 text-lg" aria-label={completed ? 'Klar' : 'Ej klar'}>
            {completed ? '✅' : '⬜'}
          </div>
        </div>
      </div>
    </div>
  )
}
