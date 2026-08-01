import { useCallback, useState } from 'react'
import { getConfigurationIssues } from './lib/config'
import { hasAuthenticatedCognitoLogin } from './lib/credentials'
import { CaregiverDashboardPage } from './pages/CaregiverDashboardPage'
import { ChatPage } from './pages/ChatPage'
import { ElderManagementPage } from './pages/ElderManagementPage'
import { PersonaSelectionPage } from './pages/PersonaSelectionPage'
import { type ConversationRecord, type ElderSubject } from './types/care'

type Page = 'chat' | 'dashboard' | 'elders' | 'persona'

const INITIAL_ELDERS: ElderSubject[] = [
  { id: 'demo-elder-001', displayName: '合成示範個案 A' },
]

function mergeRecords(
  currentRecords: ConversationRecord[],
  incomingRecords: ConversationRecord[],
): ConversationRecord[] {
  const byId = new Map<string, ConversationRecord>()

  for (const record of [...currentRecords, ...incomingRecords]) {
    byId.set(record.id, record)
  }

  return [...byId.values()]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 50)
}

function App() {
  const [page, setPage] = useState<Page>('persona')
  const [elders, setElders] = useState<ElderSubject[]>(INITIAL_ELDERS)
  const [selectedElderId, setSelectedElderId] = useState<string | undefined>(INITIAL_ELDERS[0]?.id)
  const [records, setRecords] = useState<ConversationRecord[]>([])
  const [historyPassphrase, setHistoryPassphrase] = useState('')
  const configurationIssues = getConfigurationIssues()
  const selectedElder = elders.find((elder) => elder.id === selectedElderId)
  const hasAuthenticatedSession = hasAuthenticatedCognitoLogin()

  const handleConversationSaved = useCallback((record: ConversationRecord) => {
    setRecords((current) => mergeRecords(current, [record]))
  }, [])

  const handleHistoryLoaded = useCallback((history: ConversationRecord[]) => {
    setRecords((current) => mergeRecords(current, history))
  }, [])

  function deleteElder(elderId: string) {
    setElders((current) => current.filter((elder) => elder.id !== elderId))

    if (selectedElderId === elderId) {
      setSelectedElderId(undefined)
    }
  }

  if (page === 'persona') {
    return <PersonaSelectionPage onContinue={() => setPage('elders')} />
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow" href="#main-content">
        跳至主要內容
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-teal-700">PROFIT-PROPHET</p>
            <p className="mt-1 font-semibold text-slate-900">照護人員智慧助理</p>
          </div>
          <nav aria-label="主要導覽" className="flex flex-wrap gap-2">
            <button
              aria-current={page === 'elders' ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${page === 'elders' ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              onClick={() => setPage('elders')}
              type="button"
            >
              個案管理
            </button>
            <button
              aria-current={page === 'chat' ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${page === 'chat' ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              disabled={selectedElder === undefined}
              onClick={() => setPage('chat')}
              type="button"
            >
              即時問答
            </button>
            <button
              aria-current={page === 'dashboard' ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${page === 'dashboard' ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              onClick={() => setPage('dashboard')}
              type="button"
            >
              照護總覽
            </button>
          </nav>
        </div>
      </header>

      {configurationIssues.length === 0 && hasAuthenticatedSession ? null : (
        <aside className="border-b border-amber-200 bg-amber-50" role="status">
          <div className="mx-auto max-w-6xl px-4 py-3 text-sm text-amber-950">
            {configurationIssues.length > 0 ? (
              <><strong>尚未連接 AWS 基礎設施。</strong> 請在未提交的 <code>.env.local</code> 設定：{configurationIssues.join('、')}。</>
            ) : null}
            {!hasAuthenticatedSession ? (
              <><strong className={configurationIssues.length > 0 ? 'ml-2' : undefined}>尚未登入。</strong> Host 必須先以驗證過的 Cognito User Pool 或外部 IdP token 呼叫 <code>configureAuthenticatedCognitoLogins</code>；未登入身分不會取得 AWS 憑證。</>
            ) : null}
          </div>
        </aside>
      )}

      <div id="main-content">
        {page === 'elders' ? (
          <ElderManagementPage
            elders={elders}
            onAdd={(elder) => setElders((current) => [...current, elder])}
            onDelete={deleteElder}
            onSelect={setSelectedElderId}
            selectedElderId={selectedElderId}
          />
        ) : null}
        {page === 'chat' ? (
          <ChatPage
            elder={selectedElder}
            historyPassphrase={historyPassphrase}
            onConversationSaved={handleConversationSaved}
            onHistoryPassphraseChange={setHistoryPassphrase}
          />
        ) : null}
        {page === 'dashboard' ? (
          <CaregiverDashboardPage
            historyPassphrase={historyPassphrase}
            onHistoryLoaded={handleHistoryLoaded}
            onHistoryPassphraseChange={setHistoryPassphrase}
            records={records}
          />
        ) : null}
      </div>
    </div>
  )
}

export default App
