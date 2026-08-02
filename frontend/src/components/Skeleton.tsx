/**
 * Skeleton loading placeholders for ChatHistory and RecordCard list.
 * Uses animated pulse to indicate loading state.
 */

export function ChatHistorySkeleton() {
  return (
    <div aria-busy="true" aria-label="對話載入中" className="flex flex-1 flex-col gap-4 p-4" role="status">
      {/* User bubble placeholder - right aligned */}
      <div className="flex justify-end">
        <div className="h-12 w-48 animate-pulse rounded-2xl bg-teal-100" />
      </div>
      {/* Assistant bubble placeholder - left aligned */}
      <div className="flex justify-start">
        <div className="h-20 w-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
      {/* User bubble placeholder */}
      <div className="flex justify-end">
        <div className="h-12 w-40 animate-pulse rounded-2xl bg-teal-100" />
      </div>
      <span className="sr-only">載入對話中…</span>
    </div>
  )
}

export function RecordCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="mt-3 h-5 w-3/4 rounded bg-slate-200" />
        </div>
        <div className="h-6 w-16 rounded-full bg-slate-200" />
      </div>
      <div className="mt-4 h-4 w-full rounded bg-slate-100" />
      <div className="mt-2 h-4 w-2/3 rounded bg-slate-100" />
    </div>
  )
}

export function RecordListSkeleton() {
  return (
    <div aria-busy="true" aria-label="紀錄載入中" className="mt-4 space-y-4" role="status">
      <RecordCardSkeleton />
      <RecordCardSkeleton />
      <RecordCardSkeleton />
      <span className="sr-only">載入紀錄中…</span>
    </div>
  )
}
