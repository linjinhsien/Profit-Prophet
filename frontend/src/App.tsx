// @ts-nocheck
import { useCallback, useEffect, useState } from 'react'
import { getConfigurationIssues, loadRemoteConfig } from './lib/config'
import { CaregiverDashboardPage } from './pages/CaregiverDashboardPage'
import { ChatPage } from './pages/ChatPage'
import { ElderManagementPage } from './pages/ElderManagementPage'
import { LiveCaptionPage } from './pages/LiveCaptionPage'
import { CareDashboardPage } from './pages/CareDashboardPage'
import { MemoryViewPage } from './pages/MemoryViewPage'
import { VoiceChatPage } from './pages/VoiceChatPage'
import ElderSelector from './components/ElderSelector'
import { ELDER_PROFILES } from './data/mockElders'
import { loadElderProfiles, seedDefaultElders } from './api/elderProfiles'
import { type ConversationRecord } from './types/care'

import { ElderSelectScreen } from './pages/ElderSelectScreen'

type Role = 'select' | 'caregiver' | 'elder' | 'elder-select'
type CaregiverPage = 'elders' | 'chat' | 'care-dashboard' | 'memory' | 'dashboard' | 'caption'
type ElderPage = 'voice-chat' | 'caption'

function mergeRecords(current: ConversationRecord[], incoming: ConversationRecord[]): ConversationRecord[] {
  const byId = new Map<string, ConversationRecord>()
  for (const r of [...current, ...incoming]) byId.set(r.id, r)
  return [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50)
}

// ===================== 角色選擇畫面 =====================
function RoleSelectScreen({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-10">
          <p className="text-sm font-bold tracking-[0.2em] text-teal-700">CAREMATE AI</p>
          <h1 className="mt-3 text-4xl font-bold text-slate-900">智慧長照陪伴系統</h1>
          <p className="mt-3 text-lg text-slate-600">請選擇您的使用身分</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* 照護人員 */}
          <button
            onClick={() => onSelect('caregiver')}
            className="group rounded-3xl bg-white p-8 text-left shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-xl hover:ring-teal-300 hover:-translate-y-1"
          >
            <div className="w-16 h-16 rounded-2xl bg-teal-100 flex items-center justify-center text-3xl mb-5 group-hover:bg-teal-200 transition-colors">
              👩‍⚕️
            </div>
            <h2 className="text-2xl font-bold text-slate-900">照護人員</h2>
            <p className="mt-3 text-slate-600 leading-relaxed">
              管理長者資料、查詢照護知識庫、檢視照護紀錄與分析報表。
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-slate-500">
              <li>📋 個案管理（新增/編輯長者）</li>
              <li>💬 即時問答（AI 照護知識庫）</li>
              <li>📊 照護面板（圖表分析）</li>
              <li>🧠 記憶系統（生活紀錄）</li>
              <li>📝 照護總覽（歷史紀錄）</li>
              <li>🎤 即時字幕</li>
            </ul>
            <div className="mt-6 text-sm font-semibold text-teal-700 group-hover:text-teal-800">
              進入照護介面 →
            </div>
          </button>

          {/* 長者 */}
          <button
            onClick={() => onSelect('elder-select')}
            className="group rounded-3xl bg-white p-8 text-left shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-xl hover:ring-amber-300 hover:-translate-y-1"
          >
            <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center text-3xl mb-5 group-hover:bg-amber-200 transition-colors">
              👴
            </div>
            <h2 className="text-2xl font-bold text-slate-900">長者使用</h2>
            <p className="mt-3 text-slate-600 leading-relaxed">
              簡化介面，用語音和系統聊天、聽字幕。大按鈕、大字體。
            </p>
            <ul className="mt-4 space-y-1.5 text-sm text-slate-500">
              <li>🗣️ 語音陪伴（說話就能聊天）</li>
              <li>🎤 即時字幕（看得見的聲音）</li>
            </ul>
            <div className="mt-6 text-sm font-semibold text-amber-700 group-hover:text-amber-800">
              進入長者介面 →
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

// ===================== 主 App =====================
function App() {
  const [role, setRole] = useState<Role>('select')
  const [caregiverPage, setCaregiverPage] = useState<CaregiverPage>('elders')
  const [elderPage, setElderPage] = useState<ElderPage>('voice-chat')
  const [elderId, setElderId] = useState(ELDER_PROFILES[0]?.elder_id || 'elder-001')
  const [records, setRecords] = useState<ConversationRecord[]>([])
  const [historyPassphrase, setHistoryPassphrase] = useState('')
  const [configLoaded, setConfigLoaded] = useState(false)
  const [elderProfiles, setElderProfiles] = useState(ELDER_PROFILES)
  const configurationIssues = configLoaded ? getConfigurationIssues() : []

  const selectedElderProfile = elderProfiles.find(e => e.elder_id === elderId) || ELDER_PROFILES.find(e => e.elder_id === elderId)
  const selectedElder = selectedElderProfile
    ? { id: selectedElderProfile.elder_id, displayName: selectedElderProfile.name }
    : undefined
  const elders = elderProfiles.map(e => ({ id: e.elder_id, displayName: e.name }))

  // Load elder profiles from DynamoDB
  const refreshElderProfiles = useCallback(async () => {
    try {
      let data = await loadElderProfiles()
      if (data.length === 0) {
        await seedDefaultElders(ELDER_PROFILES)
        data = await loadElderProfiles()
      }
      if (data.length > 0) {
        setElderProfiles(data.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')))
      }
    } catch {
      // Keep local fallback
    }
  }, [])

  useEffect(() => {
    loadRemoteConfig().then(() => {
      setConfigLoaded(true)
      refreshElderProfiles()
    }).catch(() => setConfigLoaded(true))
  }, [])

  const handleConversationSaved = useCallback((record: ConversationRecord) => {
    setRecords(current => mergeRecords(current, [record]))
  }, [])

  const handleHistoryLoaded = useCallback((history: ConversationRecord[]) => {
    setRecords(current => mergeRecords(current, history))
  }, [])

  // ===================== 角色選擇 =====================
  if (role === 'select') {
    return <RoleSelectScreen onSelect={setRole} />
  }

  // ===================== 長者選擇名字 =====================
  if (role === 'elder-select') {
    return <ElderSelectScreen onSelect={(id) => { setElderId(id); setRole('elder'); }} />
  }

  // ===================== 長者介面 =====================
  if (role === 'elder') {
    return (
      <div className="min-h-screen bg-amber-50 text-slate-900">
        <header className="border-b border-amber-200 bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
            <div>
              <p className="text-lg font-bold text-amber-700">安心伴</p>
              {selectedElderProfile && <p className="text-sm text-slate-500">{selectedElderProfile.name}</p>}
            </div>
            <div className="flex items-center gap-3">
              <ElderSelector elderId={elderId} onElderChange={setElderId} compact elders={elderProfiles} />
              <nav className="flex gap-2">
                <button
                  onClick={() => setElderPage('voice-chat')}
                  className={`rounded-lg px-4 py-2 text-base font-bold ${elderPage === 'voice-chat' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-amber-100'}`}
                >
                  🗣️ 聊天
                </button>
                <button
                  onClick={() => setElderPage('caption')}
                  className={`rounded-lg px-4 py-2 text-base font-bold ${elderPage === 'caption' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-amber-100'}`}
                >
                  🎤 字幕
                </button>
              </nav>
              <button onClick={() => setRole('select')} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
                切換身分
              </button>
            </div>
          </div>
        </header>
        <div>
          {elderPage === 'voice-chat' && <VoiceChatPage elderId={elderId} />}
          {elderPage === 'caption' && <LiveCaptionPage />}
        </div>
      </div>
    )
  }

  // ===================== 照護人員介面 =====================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm font-bold tracking-[0.18em] text-teal-700">CAREMATE AI</p>
              <p className="mt-0.5 text-xs text-slate-500">照護人員介面</p>
            </div>
            <ElderSelector elderId={elderId} onElderChange={setElderId} compact elders={elderProfiles} />
          </div>
          <div className="flex items-center gap-2">
            <nav aria-label="主要導覽" className="flex flex-wrap gap-1.5">
              {([
                ['elders', '個案管理'],
                ['chat', '即時問答'],
                ['care-dashboard', '照護面板'],
                ['memory', '記憶系統'],
                ['dashboard', '照護總覽'],
                ['caption', '即時字幕'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  aria-current={caregiverPage === key ? 'page' : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    caregiverPage === key ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => setCaregiverPage(key)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </nav>
            <button onClick={() => setRole('select')} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 border border-slate-200">
              切換身分
            </button>
          </div>
        </div>
      </header>

      {configurationIssues.length > 0 && (
        <aside className="border-b border-amber-200 bg-amber-50" role="status">
          <div className="mx-auto max-w-7xl px-4 py-2 text-sm text-amber-950">
            部分功能需要 AWS 連線。離線功能（照護面板、記憶系統）可正常使用。
          </div>
        </aside>
      )}

      <div>
        {caregiverPage === 'elders' && (
          <ElderManagementPage elders={elders} onAdd={() => refreshElderProfiles()} onDelete={() => refreshElderProfiles()} onSelect={setElderId} selectedElderId={elderId} onProfilesLoaded={(profiles) => setElderProfiles(profiles)} />
        )}
        {caregiverPage === 'chat' && (
          <ChatPage elder={selectedElder} historyPassphrase={historyPassphrase} onConversationSaved={handleConversationSaved} onHistoryPassphraseChange={setHistoryPassphrase} />
        )}
        {caregiverPage === 'care-dashboard' && (
          <CareDashboardPage elderId={elderId} onElderChange={setElderId} />
        )}
        {caregiverPage === 'memory' && (
          <MemoryViewPage elderId={elderId} onElderChange={setElderId} />
        )}
        {caregiverPage === 'dashboard' && (
          <CaregiverDashboardPage historyPassphrase={historyPassphrase} onHistoryLoaded={handleHistoryLoaded} onHistoryPassphraseChange={setHistoryPassphrase} records={records} />
        )}
        {caregiverPage === 'caption' && <LiveCaptionPage />}
      </div>
    </div>
  )
}

export default App
