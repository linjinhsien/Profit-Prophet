import type { ChatMessage } from '../types/conversation'
import { CareEventBadge } from './CareEventBadge'
import { formatRelativeTime } from '../lib/formatTime'

interface ChatBubbleProps {
  message: ChatMessage
  onPlayAudio?: (text: string) => void
  isPlaying?: boolean
}

export function ChatBubble({ message, onPlayAudio, isPlaying }: ChatBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <article
      role="article"
      aria-label={`${message.role} 訊息`}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-teal-50 text-slate-900'
            : 'bg-white text-slate-900 ring-1 ring-slate-200'
        }`}
      >
        <p className="whitespace-pre-wrap leading-7">{message.content}</p>

        {!isUser && message.metadata?.category && (
          <div className="mt-2">
            <CareEventBadge
              category={message.metadata.category}
              confidence={message.metadata.confidence}
            />
          </div>
        )}

        {!isUser && (
          <p className="mt-2 text-xs italic text-slate-500">
            此為 AI 產生建議，請依專業判斷確認
          </p>
        )}

        <div className="mt-2 flex items-center gap-3">
          <time
            dateTime={message.timestamp}
            className="text-xs text-slate-400"
          >
            {formatRelativeTime(message.timestamp)}
          </time>

          {!isUser && onPlayAudio && (
            <button
              className="text-xs font-medium text-teal-700 hover:text-teal-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 rounded disabled:text-slate-400"
              disabled={isPlaying}
              onClick={() => onPlayAudio(message.content)}
              type="button"
            >
              {isPlaying ? '播放中…' : '播放語音'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
