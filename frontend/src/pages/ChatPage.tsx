import { useEffect, useRef, useState, type FormEvent } from 'react'
import { queryKnowledgeBase, QueryValidationError } from '../api/bedrock'
import { saveConversation } from '../api/conversations'
import { synthesizeSpeech } from '../api/polly'
import { ChatHistory } from '../components/ChatHistory'
import { ErrorAlert } from '../components/ErrorAlert'
import { VoiceButton } from '../components/VoiceButton'
import { hasValidConversationPassphrase } from '../lib/conversationCrypto'
import { useVoiceInput } from '../lib/useVoiceInput'
import type { CareAnswer, ConversationRecord, ElderSubject } from '../types/care'
import type { ChatMessage } from '../types/conversation'

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
  const [isQuerying, setIsQuerying] = useState(false)
  const [isSyntheticStorageConfirmed, setIsSyntheticStorageConfirmed] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID())
  const [playingMessageId, setPlayingMessageId] = useState<string | undefined>()

  const audioUrlRef = useRef<string | undefined>(undefined)
  const voice = useVoiceInput()
  const prevTranscriptRef = useRef('')

  // Auto-send when voice transcript becomes available
  useEffect(() => {
    if (voice.transcript !== '' && voice.transcript !== prevTranscriptRef.current) {
      prevTranscriptRef.current = voice.transcript
      if (voice.status === 'idle') {
        void handleSend(voice.transcript)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.transcript, voice.status])

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrlRef.current !== undefined) {
        URL.revokeObjectURL(audioUrlRef.current)
      }
    }
  }, [])

  async function persistConversation(query: string, result: CareAnswer): Promise<void> {
    try {
      const record = await saveConversation({ queryText: query, ...result, conversationId }, historyPassphrase)
      onConversationSaved(record)
      setStorageMessage('已以工作階段加密通關碼加密後寫入您的 Cognito identity 記錄。')
    } catch (error) {
      setStorageMessage(`回覆已顯示，但無法儲存對話：${messageForError(error)}`)
    }
  }

  async function handleSend(text?: string): Promise<void> {
    const normalized = (text ?? queryText).trim()

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

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: normalized,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg])
    setQueryText('')
    setIsQuerying(true)

    try {
      const result = await queryKnowledgeBase(normalized)

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.answer,
        timestamp: new Date().toISOString(),
        metadata: {
          category: result.category,
          confidence: result.confidence,
          candidates: result.candidates,
          citations: result.citations,
        },
      }

      setMessages((prev) => [...prev, assistantMsg])

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
      setIsQuerying(false)
    }
  }

  function submitQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSend()
  }

  async function playAudio(text: string, messageId?: string): Promise<void> {
    setSpeechError(undefined)

    if (audioUrlRef.current !== undefined) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = undefined
    }

    setPlayingMessageId(messageId)

    try {
      const audio = await synthesizeSpeech(text)
      const url = URL.createObjectURL(audio)
      audioUrlRef.current = url

      const audioEl = new Audio(url)
      audioEl.addEventListener('ended', () => {
        setPlayingMessageId(undefined)
      })
      audioEl.addEventListener('error', () => {
        setPlayingMessageId(undefined)
      })
      await audioEl.play()
    } catch (error) {
      setSpeechError(`語音合成失敗：${messageForError(error)}`)
      setPlayingMessageId(undefined)
    }
  }

  function handlePlayAudio(text: string): void {
    // Find the assistant message that matches the text to get its ID
    const targetMessage = messages.find(
      (m) => m.role === 'assistant' && m.content === text,
    )
    void playAudio(text, targetMessage?.id)
  }

  function toggleVoiceInput() {
    if (voice.status === 'listening') {
      voice.stop()
      return
    }
    void voice.start()
  }

  function resetConversation() {
    setMessages([])
    setConversationId(crypto.randomUUID())
    setQueryText('')
    setQueryError(undefined)
    setServiceError(undefined)
    setStorageMessage(undefined)
    setSpeechError(undefined)
    setPlayingMessageId(undefined)
    prevTranscriptRef.current = ''
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-4xl flex-col px-4 py-8">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm font-bold tracking-[0.18em] text-teal-700">即時照護問答</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">照護資訊查詢</h1>
          <p className="mt-2 text-slate-600">
            查詢對象：<strong>{elder?.displayName ?? '尚未選擇個案'}</strong>
          </p>
        </div>
        <button
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          onClick={resetConversation}
          type="button"
        >
          新對話
        </button>
      </header>

      <div className="mt-6 flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" style={{ height: 'calc(100vh - 200px)' }}>
        <ChatHistory
          messages={messages}
          isLoading={isQuerying}
          onPlayAudio={handlePlayAudio}
          playingMessageId={playingMessageId}
        />

        <div className="border-t border-slate-200 p-4">
          {serviceError !== undefined && (
            <div className="mb-3">
              <ErrorAlert message={serviceError} title="知識庫查詢失敗" />
            </div>
          )}

          {speechError !== undefined && (
            <p className="mb-3 text-sm text-amber-800">{speechError}</p>
          )}

          {storageMessage !== undefined && (
            <p aria-live="polite" className="mb-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
              {storageMessage}
            </p>
          )}

          <form className="flex gap-3" onSubmit={submitQuery} noValidate>
            <label className="sr-only" htmlFor="care-query">照護問題</label>
            <input
              aria-describedby={queryError === undefined ? undefined : 'care-query-error'}
              aria-invalid={queryError === undefined ? undefined : true}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 leading-6 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              disabled={isQuerying}
              id="care-query"
              maxLength={2000}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="輸入照護問題…"
              type="text"
              value={queryText}
            />
            <button
              className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isQuerying || elder === undefined}
              type="submit"
            >
              {isQuerying ? '查詢中…' : '送出'}
            </button>
          </form>

          {queryError !== undefined && (
            <p id="care-query-error" className="mt-2 text-sm text-red-700">{queryError}</p>
          )}

          <div className="mt-3 flex flex-wrap items-start gap-4">
            <VoiceButton
              status={voice.status}
              isSupported={voice.isSupported}
              disabled={isQuerying}
              onToggle={toggleVoiceInput}
              interimTranscript={voice.interimTranscript}
              errorMessage={voice.errorMessage}
            />
          </div>

          <fieldset className="mt-4 rounded-xl border border-slate-200 p-4">
            <legend className="px-1 font-semibold text-slate-800">選擇性加密儲存</legend>
            <p id="storage-help" className="mt-1 text-sm text-slate-600">
              只可儲存合成資料。內容會先在瀏覽器以 AES-GCM 加密，通關碼不會寫入瀏覽器或 DynamoDB。
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
              <input
                checked={isSyntheticStorageConfirmed}
                className="mt-1"
                onChange={(event) => setIsSyntheticStorageConfirmed(event.target.checked)}
                type="checkbox"
              />
              我確認這次對話只包含合成、非個人且非健康敏感資料。
            </label>
            <label className="mt-3 block font-medium text-slate-800" htmlFor="chat-passphrase">
              對話加密通關碼
            </label>
            <input
              aria-describedby="storage-help"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              id="chat-passphrase"
              minLength={12}
              onChange={(event) => onHistoryPassphraseChange(event.target.value)}
              type="password"
              value={historyPassphrase}
            />
          </fieldset>
        </div>
      </div>
    </main>
  )
}
