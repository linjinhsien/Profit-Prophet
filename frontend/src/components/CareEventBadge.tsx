import { CARE_EVENT_META, type CareEvent } from '../types/care'

interface CareEventBadgeProps {
  category: CareEvent
  confidence?: number
}

export function CareEventBadge({ category, confidence }: CareEventBadgeProps) {
  const meta = CARE_EVENT_META[category]

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${meta.className}`}>
      <span>{meta.label}</span>
      {confidence === undefined ? null : <span>{Math.round(confidence * 100)}%</span>}
    </span>
  )
}
