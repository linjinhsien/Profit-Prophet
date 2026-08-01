import { useEffect, useState, type FormEvent } from 'react'
import { queryKnowledgeBase, QueryValidationError } from '../api/bedrock'
import { saveConversation } from '../api/conversations'
import { synthesizeSpeech } from '../api/polly'
import { AudioPlayer } from '../components/AudioPlayer'
import { CareEventBadge } from '../components/CareEventBadge'
import { CategoryCandidates } from '../components/CategoryCandidates'
import { CitationList } from '../components/CitationList'
import { ErrorAlert } from '../components/ErrorAlert'
import { hasValidConversationPassphrase } from '../lib/conversationCrypto'
import { useVoiceInput } from '../lib/useVoiceInput'
import {
  type CareAnswer,
  type CareEventCandidate,
  type ConversationRecord,
  type ElderSubject,
} from '../types/care'

interface ChatPageProps {
  elder: ElderSubject | undefined
  historyPassphrase: string
  onConversationSaved: (conversation: ConversationRecord) => void
  onHistoryPassphraseChange: (value: string) => void
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : '服務發生未預期錯誤，請稍後再試。'
}

export function ChatPage({
  elder,
  historyPassphrase,
  onConversationSaved,
  onHistoryPassphraseChange,
}: ChatPageProps) {
  const [queryText, setQueryText] = useState('')
  const [queryError, setQueryError] = useState<string | undefined>()
  const [serviceError, setServiceError] = useState<string | undefined>()
  const [storageMessage, setStorageMessage] = useState<string | undefined>()
  const [speechError, setSpeechError] = useState<string | undefined>()
  const [answer, setAnswer] = useState<CareAnswer | undefined>()
  const [selectedCandidate, setSelectedCandidate] = useState<CareEventCandidate | undefined>()
  const [audioUrl, setAudioUrl] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [isSyntheticStorageConfirmed, setIsSyntheticStorageConfirmed] = useState(false)
  const voice = useVoiceInput()

  useEffect(() => {
    return () => {
      if (audioUrl !== undefined) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  async function persistConversation(query: string, result: CareAnswer): Promise<void> {
    try {
      const record = await saveConversation({ queryText: query, ...result }, historyPassphrase)
      onConversationSaved(record)
      setStorageMessage('已以工作階段加密通關碼加密後寫入您的 Cognito identity 記錄。')
    } catch (error) {
      setStorageMessage(`回覆已顯示，但無法儲存對話：${messageForError(error)}`)
    }
  }

  async function submitQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = queryText.trim()

    if (normalized.length === 0 || normalized.length > 2000) {
      setQueryError('問題需為 1 至 2000 個字元，且不可只包含空白。')
      return
    }

    if (elder === undefined) {
      setQueryError('請先在個案管理選擇一位照護個案。')
      return
    }

    setQueryError(undefined)
    setServiceError(undefined)
    setStorageMessage(undefined)
    setSpeechError(undefined)
    setSelectedCandidate(undefined)
    setAnswer(undefined)
    setIsSubmitting(true)

    try {
      const result = await queryKnowledgeBase(normalized)
      setAnswer(result)

      if (isSyntheticStorageConfirmed && hasValidConversationPassphrase(historyPassphrase)) {
        void persistConversation(normalized, result)
      } else {
        setStorageMessage('回覆僅保留在目前畫面。若要儲存，請確認資料為合成資料並設定至少 12 字元的加密通關碼。')
      }
    } catch (error) {
      if (error instanceof QueryValidationError) {
        setQueryError(error.message)
      } else {
        setServiceError(messageForError(error))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function playAnswer() {
    if (answer === undefined) {
      return
    }

    setSpeechError(undefined)
    setIsSynthesizing(true)

    try {
      const audio = await synthesizeSpeech(answer.answer)
      const nextAudioUrl = URL.createObjectURL(audio)
      setAudioUrl(nextAudioUrl)
    } catch (error) {
      setSpeechError(`語音合成失敗，已改為純文字回覆：${messageForError(error)}`)
    } finally {
      setIsSynthesizing(false)
    }
  }

  function toggleVoiceInput() {
    if (voice.status === 'listening') {
      voice.stop()
      return
    }

    void voice.start()
  }

  const displayedCategory = selectedCandidate?.category ?? answer?.category

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header>
        <p className="text-sm font-bold tracking-[0.18em] text-teal-700">即時照護問答</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">照護資訊查詢</h1>
        <p className="mt-2 text-slate-600">查詢對象：<strong>{elder?.displayName ?? '尚未選擇個案'}</strong></p>
      </header>

      <section aria-labelledby="query-form-title" className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 id="query-form-title" className="text-xl font-bold text-slate-900">輸入問題</h2>
        <form className="mt-4" onSubmit={submitQuery} noValidate>
          <label className="block font-medium text-slate-800" htmlFor="care-query">照護問題</label>
          <p id="care-query-help" className="mt-1 text-sm text-slate-500">1 至 2000 字元。請只輸入合成、非敏感的示範資訊。</p>
          <textarea
            aria-describedby={queryError === undefined ? 'care-query-help' : 'care-query-help care-query-error'}
            aria-invalid={queryError === undefined ? undefined : true}
            className="mt-2 min-h-32 w-full rounded-xl border border-slate-300 p-3 leading-6"
            disabled={isSubmitting}
            id="care-query"
            maxLength={2000}
            onChange={(event) => setQueryText(event.target.value)}
            placeholder="例如：請整理今天的睡眠與營養狀況。"
            value={queryText}
          />
          {queryError === undefined ? null : <p id="care-query-error" className="mt-2 text-sm text-red-700">{queryError}</p>}

          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400" disabled={isSubmitting || elder === undefined} type="submit">
              {isSubmitting ? '知識庫查詢中…' : '送出查詢'}
            </button>
            <button
              aria-pressed={voice.status === 'listening'}
              className="rounded-xl border border-teal-700 px-5 py-3 font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
              disabled={isSubmitting || !voice.isSupported}
              onClick={toggleVoiceInput}
              type="button"
            >
              {voice.status === 'listening' ? '停止錄音' : '使用麥克風'}
            </button>
          </div>
        </form>
        {voice.status === 'listening' ? <p className="mt-3 text-sm font-medium text-teal-800">正在逐字轉錄：{voice.interimTranscript}</p> : null}
        {voice.transcript === '' ? null : (
          <div className="mt-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-950">
            <p>已轉錄文字：{voice.transcript}</p>
            <button className="mt-2 rounded-md bg-white px-3 py-1.5 font-semibold text-teal-800 ring-1 ring-teal-700 hover:bg-teal-100" onClick={() => setQueryText(voice.transcript)} type="button">使用轉錄文字</button>
          </div>
        )}
        {voice.errorMessage === undefined ? null : <p className="mt-3 text-sm text-amber-800">{voice.errorMessage}</p>}

        <fieldset className="mt-6 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 font-semibold text-slate-800">選擇性加密儲存</legend>
          <p id="storage-help" className="mt-1 text-sm text-slate-600">只可儲存合成資料。內容會先在瀏覽器以 AES-GCM 加密，通關碼不會寫入瀏覽器或 DynamoDB。</p>
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
            <input checked={isSyntheticStorageConfirmed} className="mt-1" onChange={(event) => setIsSyntheticStorageConfirmed(event.target.checked)} type="checkbox" />
            我確認這次對話只包含合成、非個人且非健康敏感資料。
          </label>
          <label className="mt-3 block font-medium text-slate-800" htmlFor="chat-passphrase">對話加密通關碼</label>
          <input
            aria-describedby="storage-help"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
            id="chat-passphrase"
            minLength={12}
            onChange={(event) => onHistoryPassphraseChange(event.target.value)}
            type="password"
            value={historyPassphrase}
          />
        </fieldset>
      </section>

      <div className="mt-6 space-y-5">
        {serviceError === undefined ? null : <ErrorAlert message={serviceError} title="知識庫查詢失敗" />}
        {storageMessage === undefined ? null : <p aria-live="polite" className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700">{storageMessage}</p>}
        {answer === undefined ? null : (
          <section aria-labelledby="answer-title" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="answer-title" className="text-xl font-bold text-slate-950">AI 回覆</h2>
                <p className="mt-1 text-sm text-slate-500">請依專業照護流程確認，不可作為單一決策依據。</p>
              </div>
              {displayedCategory === undefined ? null : <CareEventBadge category={displayedCategory} confidence={answer.confidence} />}
            </div>
            <p className="mt-5 whitespace-pre-wrap leading-7 text-slate-800">{answer.answer}</p>
            {answer.usedStructuredOutputFallback ? <p className="mt-4 text-sm text-amber-800">模型回覆未符合結構格式，已保留可讀文字並標示為待確認分類。</p> : null}
            {answer.category === 'unclassified' ? <div className="mt-5"><CategoryCandidates candidates={answer.candidates} onSelect={setSelectedCandidate} selectedCategory={selectedCandidate?.category} /></div> : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="rounded-lg border border-teal-700 px-4 py-2 font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400" disabled={isSynthesizing} onClick={() => void playAnswer()} type="button">
                {isSynthesizing ? '準備語音中…' : '播放語音回覆'}
              </button>
            </div>
            {speechError === undefined ? null : <p className="mt-3 text-sm text-amber-800">{speechError}</p>}
            {audioUrl === undefined ? null : <div className="mt-4"><AudioPlayer audioUrl={audioUrl} /></div>}
            <div className="mt-5"><CitationList citations={answer.citations} /></div>
          </section>
        )}
      </div>
    </main>
  )
}
