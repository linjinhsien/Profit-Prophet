import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChatBubble } from './ChatBubble'
import type { ChatMessage } from '../types/conversation'

const userMessage: ChatMessage = {
  id: 'msg-001',
  role: 'user',
  content: '今天的睡眠狀況如何？',
  timestamp: new Date().toISOString(),
}

const assistantMessage: ChatMessage = {
  id: 'msg-002',
  role: 'assistant',
  content: '根據紀錄，今天睡眠品質良好，共睡了 7 小時。',
  timestamp: new Date().toISOString(),
  metadata: {
    category: 'sleep_patterns',
    confidence: 0.92,
  },
}

describe('ChatBubble', () => {
  it('renders user messages with right alignment', () => {
    render(<ChatBubble message={userMessage} />)

    const article = screen.getByRole('article', { name: 'user 訊息' })
    expect(article).toBeInTheDocument()
    expect(article.className).toContain('justify-end')
  })

  it('renders user message content', () => {
    render(<ChatBubble message={userMessage} />)

    expect(screen.getByText('今天的睡眠狀況如何？')).toBeInTheDocument()
  })

  it('renders assistant messages with left alignment', () => {
    render(<ChatBubble message={assistantMessage} />)

    const article = screen.getByRole('article', { name: 'assistant 訊息' })
    expect(article).toBeInTheDocument()
    expect(article.className).toContain('justify-start')
  })

  it('shows AI disclaimer for assistant messages', () => {
    render(<ChatBubble message={assistantMessage} />)

    expect(
      screen.getByText('此為 AI 產生建議，請依專業判斷確認'),
    ).toBeInTheDocument()
  })

  it('does not show AI disclaimer for user messages', () => {
    render(<ChatBubble message={userMessage} />)

    expect(
      screen.queryByText('此為 AI 產生建議，請依專業判斷確認'),
    ).not.toBeInTheDocument()
  })

  it('shows play audio button for assistant messages', () => {
    const onPlayAudio = vi.fn()
    render(<ChatBubble message={assistantMessage} onPlayAudio={onPlayAudio} />)

    const button = screen.getByRole('button', { name: '播放語音' })
    expect(button).toBeInTheDocument()
  })

  it('calls onPlayAudio with message content when play button is clicked', () => {
    const onPlayAudio = vi.fn()
    render(<ChatBubble message={assistantMessage} onPlayAudio={onPlayAudio} />)

    screen.getByRole('button', { name: '播放語音' }).click()
    expect(onPlayAudio).toHaveBeenCalledWith(assistantMessage.content)
  })

  it('does not show play audio button for user messages', () => {
    const onPlayAudio = vi.fn()
    render(<ChatBubble message={userMessage} onPlayAudio={onPlayAudio} />)

    expect(screen.queryByRole('button', { name: '播放語音' })).not.toBeInTheDocument()
  })

  it('shows care event badge for assistant messages with metadata', () => {
    render(<ChatBubble message={assistantMessage} />)

    expect(screen.getByText('睡眠模式')).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
  })

  it('renders timestamp', () => {
    render(<ChatBubble message={userMessage} />)

    const time = screen.getByRole('article').querySelector('time')
    expect(time).toBeInTheDocument()
    expect(time?.getAttribute('datetime')).toBe(userMessage.timestamp)
  })
})
