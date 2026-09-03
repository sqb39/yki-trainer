import { BADGE_DEFINITIONS } from '../lib/chapters'

interface BadgeListProps {
  badgeIds: string[]
  compact?: boolean
}

export function BadgeList({ badgeIds, compact = false }: BadgeListProps) {
  if (badgeIds.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Inga märken ännu — fortsätt studera för att låsa upp dem!
      </p>
    )
  }

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'gap-3'}`}>
      {badgeIds.map((id) => {
        const badge = BADGE_DEFINITIONS[id]
        if (!badge) return null
        return (
          <div
            key={id}
            title={badge.description}
            className={`inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 ${
              compact ? 'px-3 py-1 text-sm' : 'px-4 py-2'
            }`}
          >
            <span aria-hidden>{badge.emoji}</span>
            <span className="font-medium text-amber-900">{badge.label}</span>
          </div>
        )
      })}
    </div>
  )
}
