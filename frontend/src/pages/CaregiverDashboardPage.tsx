import { useEffect, useMemo, useState } from 'react'
import { loadConversationHistory } from '../api/conversations'
import { CareEventBadge } from '../components/CareEventBadge'
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

export function CaregiverDashboardPage({
  historyPassphrase,
  onHistoryLoaded,
  onHistoryPassphraseChange,
  records,
}: CaregiverDashboardPageProps) {
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [historyError, setHistoryError] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(false)
  const canLoadHistory = hasValidConversationPassphrase(historyPassphrase)

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

  const filteredRecords = useMemo(
    () => records.filter((record) => filter === 'all' || record.category === filter),
    [filter, records],
  )

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header>
        <p className="text-sm font-bold tracking-[0.18em] text-teal-700">照護總覽</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">對話與分類紀錄</h1>
        <p className="mt-2 text-slate-600">最多顯示 50 筆、依時間倒序排列的加密對話紀錄。</p>
      </header>

      <section aria-labelledby="history-encryption-title" className="mt-7 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 id="history-encryption-title" className="font-bold text-slate-900">解鎖加密歷史紀錄</h2>
        <p id="history-passphrase-help" className="mt-1 text-sm text-slate-600">通關碼只存在此瀏覽器工作階段，至少 12 個字元；忘記後無法讀取先前加密資料。</p>
        <label className="mt-4 block font-medium text-slate-800" htmlFor="history-passphrase">對話加密通關碼</label>
        <input
          aria-describedby="history-passphrase-help"
          className="mt-2 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2"
          id="history-passphrase"
          minLength={12}
          onChange={(event) => onHistoryPassphraseChange(event.target.value)}
          type="password"
          value={historyPassphrase}
        />
        {canLoadHistory ? null : <p className="mt-2 text-sm text-amber-800">輸入至少 12 個字元後才會讀取遠端歷史紀錄。</p>}
      </section>

      <section aria-labelledby="filter-title" className="mt-7 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 id="filter-title" className="font-bold text-slate-900">依照護分類篩選</h2>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="照護分類篩選">
          <button
            aria-pressed={filter === 'all'}
            className={`rounded-full px-3 py-2 text-sm font-semibold ${filter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            onClick={() => setFilter('all')}
            type="button"
          >
            全部
          </button>
          {CARE_EVENTS.map((category) => (
            <button
              aria-pressed={filter === category}
              className={`rounded-full px-3 py-2 text-sm font-semibold ${
                filter === category ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              key={category}
              onClick={() => setFilter(category)}
              type="button"
            >
              {CARE_EVENT_META[category].label}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-6 space-y-4">
        {historyError === undefined ? null : <ErrorAlert message={historyError} title="讀取對話紀錄失敗" />}
        {isLoading ? <p aria-live="polite" className="rounded-xl bg-slate-100 p-4 text-slate-700">正在讀取歷史紀錄…</p> : null}
        {!isLoading && filteredRecords.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">目前沒有符合篩選條件的對話紀錄。</p> : null}
        {filteredRecords.map((record) => (
          <article key={record.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-slate-500">{new Date(record.timestamp).toLocaleString('zh-TW')}</p>
                <h2 className="mt-2 font-bold text-slate-900">{record.queryText}</h2>
              </div>
              <CareEventBadge category={record.category} confidence={record.confidence} />
            </div>
            <p className="mt-3 whitespace-pre-wrap leading-6 text-slate-700">{record.answer}</p>
            <p className="mt-3 text-sm text-slate-500">來源數：{record.citations.length}</p>
          </article>
        ))}
      </div>
    </main>
  )
}
