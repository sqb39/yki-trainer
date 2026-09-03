interface ProgressBarProps {
  percent: number
  label?: string
  className?: string
}

export function ProgressBar({ percent, label, className = '' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent))

  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex justify-between text-sm text-slate-600">
          <span>{label}</span>
          <span>{clamped}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
