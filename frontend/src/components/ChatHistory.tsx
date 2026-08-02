import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../types/conversation'
import { ChatBubble } from './ChatBubble'

interface ChatHistoryProps {
  messages: ChatMessage[]
  isLoading?: boolean
  onPlayAudio?: (text: string) => void
  playingMessageId?: string
}

export function ChatHistory({
  messages,
  isLoading,
  onPlayAudio,
  playingMessageId,
}: ChatHistoryProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, isLoading, autoScroll])

  function handleScroll() {
    const container = containerRef.current
    if (!container) return

    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 40
    setAutoScroll(isAtBottom)
  }

  if (messages.length === 0 && !isLoading) {
    return (
      <div
        role="log"
        aria-live="polite"
        aria-label="對話歷史"
        className="flex flex-1 items-center justify-center p-8"
      >
        <p className="text-center text-slate-500">
          開始您的第一次照護諮詢 — 輸入文字或使用麥克風
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      role="log"
      aria-live="polite"
      aria-label="對話歷史"
      className="flex-1 space-y-4 overflow-y-auto p-4"
      onScroll={handleScroll}
    >
      {messages.map((message) => (
        <ChatBubble
          key={message.id}
          message={message}
          onPlayAudio={onPlayAudio}
          isPlaying={playingMessageId === message.id}
        />
      ))}

      {isLoading && (
        <div className="flex justify-start" role="status" aria-label="AI 正在回覆">
          <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
            </span>
            <span className="sr-only">AI 正在回覆中…</span>
          </div>
        </div>
      )}
    </div>
  )
}
