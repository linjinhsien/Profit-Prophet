import { CareEventBadge } from './CareEventBadge'
import { formatRelativeTime } from '../lib/formatTime'
import type { ConversationRecord } from '../types/care'

interface RecordCardProps {
  record: ConversationRecord
  isExpanded: boolean
  onToggle: () => void
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }

  return text.slice(0, maxLength) + '…'
}

export function RecordCard({ record, isExpanded, onToggle }: RecordCardProps) {
  const contentId = `record-content-${record.id}`

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <button
        aria-controls={contentId}
        aria-expanded={isExpanded}
        className="flex w-full items-start justify-between gap-4 text-left focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 rounded-xl"
        onClick={onToggle}
        type="button"
      >
        <div className="min-w-0 flex-1">
          <time dateTime={record.timestamp} className="text-sm text-slate-500">{formatRelativeTime(record.timestamp)}</time>
          <h2 className="mt-1 font-bold text-slate-900">
            {isExpanded ? record.queryText : truncate(record.queryText, 80)}
          </h2>
          {isExpanded ? null : (
            <p className="mt-1 text-sm text-slate-600">
              {truncate(record.answer, 100)}
            </p>
          )}
        </div>
        <CareEventBadge category={record.category} confidence={record.confidence} />
      </button>

      <div
        aria-hidden={!isExpanded}
        className={isExpanded ? 'mt-4' : 'hidden'}
        id={contentId}
      >
        <p className="whitespace-pre-wrap leading-6 text-slate-700">{record.answer}</p>

        {record.candidates.length > 0 ? (
          <div className="mt-3">
            <p className="text-sm font-medium text-slate-600">其他候選分類：</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {record.candidates.map((candidate) => (
                <CareEventBadge
                  category={candidate.category}
                  confidence={candidate.confidence}
                  key={candidate.category}
                />
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-3 text-sm text-slate-500">
          來源數：{record.citations.length}
        </p>

        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ 以上內容由 AI 產生，僅供參考，不構成醫療建議。請以專業醫護人員判斷為準。
        </p>
      </div>
    </article>
  )
}
