import { useEffect, useMemo, useState } from 'react'
import { deleteAllConversations, loadConversationHistory } from '../api/conversations'
import { ErrorAlert } from '../components/ErrorAlert'
import { RecordCard } from '../components/RecordCard'
import { RecordFilters, type CategoryFilter } from '../components/RecordFilters'
import { hasValidConversationPassphrase } from '../lib/conversationCrypto'
import type { ConversationRecord } from '../types/care'

interface CaregiverDashboardPageProps {
  historyPassphrase: string
  onHistoryLoaded: (records: ConversationRecord[]) => void
  onHistoryPassphraseChange: (value: string) => void
  records: ConversationRecord[]
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : '無法讀取對話紀錄。'
}

function matchesKeyword(record: ConversationRecord, query: string): boolean {
  const lower = query.toLowerCase()
  return (
    record.queryText.toLowerCase().includes(lower) ||
    record.answer.toLowerCase().includes(lower)
  )
}

export function CaregiverDashboardPage({
  historyPassphrase,
  onHistoryLoaded,
  onHistoryPassphraseChange,
  records,
}: CaregiverDashboardPageProps) {
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [historyError, setHistoryError] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | undefined>()
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<string | undefined>()
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

  const filteredRecords = useMemo(() => {
    let result = records

    if (filter !== 'all') {
      result = result.filter((record) => record.category === filter)
    }

    if (searchQuery.trim().length > 0) {
      result = result.filter((record) => matchesKeyword(record, searchQuery))
    }

    return result
  }, [filter, searchQuery, records])

  function handleToggle(recordId: string) {
    setExpandedId((current) => (current === recordId ? undefined : recordId))
  }

  async function handleDeleteAll(): Promise<void> {
    const confirmed = window.confirm('確定要刪除所有對話紀錄嗎？此操作無法復原。')

    if (!confirmed) {
      return
    }

    setIsDeleting(true)
    setDeleteMessage(undefined)

    try {
      const count = await deleteAllConversations()
      onHistoryLoaded([])
      setDeleteMessage(`已刪除 ${count} 筆紀錄。`)
    } catch (error) {
      setDeleteMessage(`刪除失敗：${messageForError(error)}`)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header>
        <p className="text-sm font-bold tracking-[0.18em] text-teal-700">照護紀錄</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">對話與分類紀錄</h1>
        <p className="mt-2 text-slate-600">最多顯示 50 筆、依時間倒序排列的加密對話紀錄。</p>
      </header>

      <section aria-labelledby="history-encryption-title" className="mt-7 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 id="history-encryption-title" className="font-bold text-slate-900">解鎖加密歷史紀錄</h2>
        <p id="history-passphrase-help" className="mt-1 text-sm text-slate-600">通關碼只存在此瀏覽器工作階段，至少 12 個字元；忘記後無法讀取先前加密資料。</p>
        <label className="mt-4 block font-medium text-slate-800" htmlFor="history-passphrase">對話加密通關碼</label>
        <input
          aria-describedby="history-passphrase-help"
          className="mt-2 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          id="history-passphrase"
          minLength={12}
          onChange={(event) => onHistoryPassphraseChange(event.target.value)}
          type="password"
          value={historyPassphrase}
        />
        {canLoadHistory ? null : <p className="mt-2 text-sm text-amber-800">輸入至少 12 個字元後才會讀取遠端歷史紀錄。</p>}
        {canLoadHistory ? (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <button
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDeleting || records.length === 0}
              onClick={() => void handleDeleteAll()}
              type="button"
            >
              {isDeleting ? '刪除中…' : '刪除我的全部紀錄'}
            </button>
            {deleteMessage !== undefined && (
              <p aria-live="polite" className="mt-2 text-sm text-slate-700">{deleteMessage}</p>
            )}
          </div>
        ) : null}
      </section>

      <RecordFilters
        onCategoryChange={setFilter}
        onSearchChange={setSearchQuery}
        searchQuery={searchQuery}
        selectedCategory={filter}
      />

      <p aria-live="polite" className="mt-6 text-sm text-slate-600">
        顯示 {filteredRecords.length} 筆紀錄
      </p>

      <div className="mt-4 space-y-4">
        {historyError === undefined ? null : <ErrorAlert message={historyError} title="讀取對話紀錄失敗" />}
        {isLoading ? <p aria-live="polite" className="rounded-xl bg-slate-100 p-4 text-slate-700">正在讀取歷史紀錄…</p> : null}
        {!isLoading && filteredRecords.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">目前沒有符合篩選條件的對話紀錄。</p> : null}
        {filteredRecords.map((record) => (
          <RecordCard
            isExpanded={expandedId === record.id}
            key={record.id}
            onToggle={() => handleToggle(record.id)}
            record={record}
          />
        ))}
      </div>
    </main>
  )
}
