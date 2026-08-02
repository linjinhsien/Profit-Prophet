import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadConversationHistory } from '../api/conversations'
import { CareEventBadge } from '../components/CareEventBadge'
import { CitationList } from '../components/CitationList'
import { ErrorAlert } from '../components/ErrorAlert'
import { hasValidConversationPassphrase } from '../lib/conversationCrypto'
import {
  CARE_EVENTS,
  CARE_EVENT_META,
  type CareEvent,
  type ConversationRecord,
} from '../types/care'

interface CaregiverDashboardPageProps {
  historyPassphrase: string
  onHistoryLoaded: (records: ConversationRecord[]) => void
  onHistoryPassphraseChange: (value: string) => void
  records: ConversationRecord[]
}

type CategoryFilter = CareEvent | 'all'

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : '無法讀取對話紀錄。'
}

// --- Debounce hook ---

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}

// --- Keyword matching ---

function matchesKeyword(record: ConversationRecord, keyword: string): boolean {
  if (keyword === '') {
    return true
  }

  const lowerKeyword = keyword.toLowerCase()
  return (
    record.queryText.toLowerCase().includes(lowerKeyword) ||
    record.answer.toLowerCase().includes(lowerKeyword)
  )
}

// --- Expandable Record Card ---

interface RecordCardProps {
  record: ConversationRecord
  isExpanded: boolean
  onToggle: () => void
}

function RecordCard({ record, isExpanded, onToggle }: RecordCardProps) {
  const contentId = `record-content-${record.id}`

  return (
    <article className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md">
      <button
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="w-full cursor-pointer p-5 text-left"
        onClick={onToggle}
        type="button"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-500">
              {new Date(record.timestamp).toLocaleString('zh-TW')}
            </p>
            <h2 className="mt-2 font-bold text-slate-900">{record.queryText}</h2>
            {!isExpanded && (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                {record.answer}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <CareEventBadge category={record.category} confidence={record.confidence} />
            <span
              aria-hidden="true"
              className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            >
              ▼
            </span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4" id={contentId}>
          <div className="space-y-4">
            {/* 完整問題 */}
            <div>
              <h3 className="text-sm font-semibold text-slate-500">提問</h3>
              <p className="mt-1 whitespace-pre-wrap leading-6 text-slate-800">
                {record.queryText}
              </p>
            </div>

            {/* 完整回覆 */}
            <div>
              <h3 className="text-sm font-semibold text-slate-500">AI 回覆</h3>
              <p className="mt-1 whitespace-pre-wrap leading-7 text-slate-800">
                {record.answer}
              </p>
              {record.usedStructuredOutputFallback && (
                <p className="mt-2 text-sm text-amber-800">
                  模型回覆未符合結構格式，分類為待確認。
                </p>
              )}
            </div>

            {/* 分類資訊 */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-500">分類信心度：</span>
              <span className="text-sm font-semibold text-slate-800">
                {(record.confidence * 100).toFixed(0)}%
              </span>
              {record.candidates.length > 0 && (
                <span className="text-sm text-slate-500">
                  候選：{record.candidates.map((c) => CARE_EVENT_META[c.category].label).join('、')}
                </span>
              )}
            </div>

            {/* 引用來源 */}
            {record.citations.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-500">引用來源</h3>
                <div className="mt-2">
                  <CitationList citations={record.citations} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

// --- Main Dashboard Page ---

export function CaregiverDashboardPage({
  historyPassphrase,
  onHistoryLoaded,
  onHistoryPassphraseChange,
  records,
}: CaregiverDashboardPageProps) {
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [searchText, setSearchText] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [historyError, setHistoryError] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(false)
  const canLoadHistory = hasValidConversationPassphrase(historyPassphrase)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const debouncedSearchText = useDebouncedValue(searchText, 300)

  useEffect(() => {
    if (!canLoadHistory) {
      return
    }

    let active = true

    async function loadHistory() {
      setIsLoading(true)
      setHistoryError(undefined)

      try {
        const history = await loadConversationHistory(historyPassphrase)

        if (active) {
          onHistoryLoaded(history)
        }
      } catch (error) {
        if (active) {
          setHistoryError(messageForError(error))
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadHistory()

    return () => {
      active = false
    }
  }, [canLoadHistory, historyPassphrase, onHistoryLoaded])

  const filteredRecords = useMemo(() => {
    const keyword = debouncedSearchText.trim()

    return records.filter((record) => {
      const matchesCategory = filter === 'all' || record.category === filter
      const matchesSearch = matchesKeyword(record, keyword)
      return matchesCategory && matchesSearch
    })
  }, [filter, debouncedSearchText, records])

  const toggleExpand = useCallback((recordId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)

      if (next.has(recordId)) {
        next.delete(recordId)
      } else {
        next.add(recordId)
      }

      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(filteredRecords.map((r) => r.id)))
  }, [filteredRecords])

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header>
        <p className="text-sm font-bold tracking-[0.18em] text-teal-700">照護總覽</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">對話與分類紀錄</h1>
        <p className="mt-2 text-slate-600">
          最多顯示 50 筆、依時間倒序排列的加密對話紀錄。
        </p>
      </header>

      {/* 解鎖加密歷史紀錄 */}
      <section
        aria-labelledby="history-encryption-title"
        className="mt-7 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      >
        <h2 id="history-encryption-title" className="font-bold text-slate-900">
          解鎖加密歷史紀錄
        </h2>
        <p id="history-passphrase-help" className="mt-1 text-sm text-slate-600">
          通關碼只存在此瀏覽器工作階段，至少 12 個字元；忘記後無法讀取先前加密資料。
        </p>
        <label
          className="mt-4 block font-medium text-slate-800"
          htmlFor="history-passphrase"
        >
          對話加密通關碼
        </label>
        <input
          aria-describedby="history-passphrase-help"
          className="mt-2 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2"
          id="history-passphrase"
          minLength={12}
          onChange={(event) => onHistoryPassphraseChange(event.target.value)}
          type="password"
          value={historyPassphrase}
        />
        {canLoadHistory ? null : (
          <p className="mt-2 text-sm text-amber-800">
            輸入至少 12 個字元後才會讀取遠端歷史紀錄。
          </p>
        )}
      </section>

      {/* 搜尋 + 篩選 */}
      <section
        aria-labelledby="filter-title"
        className="mt-7 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      >
        <h2 id="filter-title" className="font-bold text-slate-900">
          搜尋與篩選
        </h2>

        {/* 關鍵字搜尋 */}
        <div className="mt-4">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="record-search"
          >
            關鍵字搜尋
          </label>
          <input
            ref={searchInputRef}
            aria-describedby="search-help"
            className="mt-2 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 placeholder:text-slate-400"
            id="record-search"
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜尋問題或回覆內容…"
            type="search"
            value={searchText}
          />
          <p id="search-help" className="mt-1 text-sm text-slate-500">
            會比對問題和 AI 回覆內容，輸入後自動篩選。
          </p>
        </div>

        {/* 分類篩選 */}
        <div className="mt-5">
          <p className="text-sm font-medium text-slate-700">依照護分類篩選</p>
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="group"
            aria-label="照護分類篩選"
          >
            <button
              aria-pressed={filter === 'all'}
              className={`rounded-full px-3 py-2 text-sm font-semibold ${
                filter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              onClick={() => setFilter('all')}
              type="button"
            >
              全部
            </button>
            {CARE_EVENTS.map((category) => (
              <button
                aria-pressed={filter === category}
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  filter === category
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                key={category}
                onClick={() => setFilter(category)}
                type="button"
              >
                {CARE_EVENT_META[category].label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 結果列表 */}
      <div className="mt-6">
        {/* 結果計數 + 展開/收合 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" aria-atomic="true" className="text-sm text-slate-600">
            {isLoading
              ? '正在讀取歷史紀錄…'
              : `共 ${filteredRecords.length} 筆紀錄`}
            {debouncedSearchText.trim() !== '' && !isLoading && (
              <span className="ml-1 text-slate-500">
                （搜尋：「{debouncedSearchText.trim()}」）
              </span>
            )}
          </p>
          {filteredRecords.length > 0 && (
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={expandAll}
                type="button"
              >
                全部展開
              </button>
              <button
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={collapseAll}
                type="button"
              >
                全部收合
              </button>
            </div>
          )}
        </div>

        {/* 錯誤訊息 */}
        {historyError !== undefined && (
          <ErrorAlert message={historyError} title="讀取對話紀錄失敗" />
        )}

        {/* 空狀態 */}
        {!isLoading && filteredRecords.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            目前沒有符合篩選條件的對話紀錄。
          </p>
        )}

        {/* 紀錄卡片列表 */}
        <div className="space-y-4">
          {filteredRecords.map((record) => (
            <RecordCard
              key={record.id}
              isExpanded={expandedIds.has(record.id)}
              onToggle={() => toggleExpand(record.id)}
              record={record}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
