import { useCallback, useRef, useState } from 'react'
import type { Conversation, ChatMessage, MessageRole } from '../types/conversation'

/** Status of the conversation hook. */
export type ConversationStatus = 'idle' | 'active'

export interface UseConversationReturn {
  /** The current conversation, or undefined if not started. */
  conversation: Conversation | undefined
  /** Current status of the conversation. */
  status: ConversationStatus
  /** Start a new conversation session. Returns the new conversation ID. */
  startConversation: () => string
  /** Add a message to the current conversation. Returns the created message or undefined if no active conversation. */
  addMessage: (role: MessageRole, content: string) => ChatMessage | undefined
  /** Get all messages in the current conversation. */
  messages: ChatMessage[]
  /** End the current conversation and reset state. */
  endConversation: () => void
  /** The current conversation ID, or undefined if none active. */
  conversationId: string | undefined
}

function createMessage(role: MessageRole, content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Hook that manages multi-turn conversation state.
 *
 * Provides methods to start, add messages to, and end conversations.
 * Messages are stored in order and the conversation tracks creation/update times.
 */
export function useConversation(): UseConversationReturn {
  const [conversation, setConversation] = useState<Conversation | undefined>(undefined)
  const conversationRef = useRef<Conversation | undefined>(undefined)

  const startConversation = useCallback((): string => {
    const now = new Date().toISOString()
    const conversationId = crypto.randomUUID()
    const newConversation: Conversation = {
      conversationId,
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
    conversationRef.current = newConversation
    setConversation(newConversation)
    return conversationId
  }, [])

  const addMessage = useCallback((role: MessageRole, content: string): ChatMessage | undefined => {
    const current = conversationRef.current
    if (current === undefined) {
      return undefined
    }

    const message = createMessage(role, content)
    const updatedConversation: Conversation = {
      ...current,
      messages: [...current.messages, message],
      updatedAt: message.timestamp,
    }
    conversationRef.current = updatedConversation
    setConversation(updatedConversation)
    return message
  }, [])

  const endConversation = useCallback((): void => {
    conversationRef.current = undefined
    setConversation(undefined)
  }, [])

  const messages = conversation?.messages ?? []
  const conversationId = conversation?.conversationId
  const status: ConversationStatus = conversation === undefined ? 'idle' : 'active'

  return {
    conversation,
    status,
    startConversation,
    addMessage,
    messages,
    endConversation,
    conversationId,
  }
}
