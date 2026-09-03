interface StreakBadgeProps {
  days: number
}

export function StreakBadge({ days }: StreakBadgeProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-amber-900">
      <span className="text-lg" aria-hidden>
        🔥
      </span>
      <span className="font-semibold">{days}</span>
      <span className="text-sm">dagar i rad</span>
    </div>
  )
}
