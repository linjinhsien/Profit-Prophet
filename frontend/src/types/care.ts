export type CareEvent =
  | 'health_status'
  | 'emotion_state'
  | 'daily_activities'
  | 'medication_records'
  | 'emergency_events'
  | 'social_interaction'
  | 'nutrition'
  | 'sleep_patterns'
  | 'unclassified'

export const CARE_EVENTS: readonly CareEvent[] = [
  'health_status',
  'emotion_state',
  'daily_activities',
  'medication_records',
  'emergency_events',
  'social_interaction',
  'nutrition',
  'sleep_patterns',
  'unclassified',
]

export interface CareEventCandidate {
  category: Exclude<CareEvent, 'unclassified'>
  confidence: number
}

export interface Citation {
  id: string
  excerpt: string
  uri?: string
  score?: number
}

export interface CareAnswer {
  answer: string
  category: CareEvent
  confidence: number
  candidates: CareEventCandidate[]
  citations: Citation[]
  usedStructuredOutputFallback: boolean
}

export interface ConversationRecord extends CareAnswer {
  id: string
  queryText: string
  timestamp: string
}

export interface ElderSubject {
  id: string
  displayName: string
}

export const CARE_EVENT_META: Record<CareEvent, { label: string; className: string }> = {
  health_status: { label: '健康狀態', className: 'bg-rose-100 text-rose-800 ring-rose-200' },
  emotion_state: { label: '情緒狀態', className: 'bg-violet-100 text-violet-800 ring-violet-200' },
  daily_activities: { label: '日常活動', className: 'bg-sky-100 text-sky-800 ring-sky-200' },
  medication_records: { label: '用藥紀錄', className: 'bg-amber-100 text-amber-800 ring-amber-200' },
  emergency_events: { label: '緊急事件', className: 'bg-red-100 text-red-800 ring-red-200' },
  social_interaction: { label: '社交互動', className: 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200' },
  nutrition: { label: '營養攝取', className: 'bg-lime-100 text-lime-800 ring-lime-200' },
  sleep_patterns: { label: '睡眠模式', className: 'bg-indigo-100 text-indigo-800 ring-indigo-200' },
  unclassified: { label: '待確認分類', className: 'bg-slate-100 text-slate-800 ring-slate-300' },
}

export function isCareEvent(value: unknown): value is CareEvent {
  return typeof value === 'string' && CARE_EVENTS.some((careEvent) => careEvent === value)
}

export function isClassifiedCareEvent(
  value: CareEvent,
): value is Exclude<CareEvent, 'unclassified'> {
  return value !== 'unclassified'
}
