import type { CareEvent, Citation, CareEventCandidate } from './care'

/** Role of a participant in a conversation turn. */
export type MessageRole = 'user' | 'assistant'

/** A single message in a multi-turn conversation. */
export interface ChatMessage {
  /** Unique identifier for this message. */
  id: string
  /** Which participant sent the message. */
  role: MessageRole
  /** The text content of the message. */
  content: string
  /** ISO 8601 timestamp when the message was created. */
  timestamp: string
  /** Optional metadata attached to assistant messages. */
  metadata?: {
    category?: CareEvent
    confidence?: number
    candidates?: CareEventCandidate[]
    citations?: Citation[]
  }
}

/** A multi-turn conversation containing ordered messages and optional care metadata. */
export interface Conversation {
  /** Unique identifier for this conversation session. */
  conversationId: string
  /** Ordered list of messages, oldest first. */
  messages: ChatMessage[]
  /** ISO 8601 timestamp when conversation was started. */
  createdAt: string
  /** ISO 8601 timestamp of last message. */
  updatedAt: string
}

/** A persisted care record that ties a conversation to classified care event data. */
export interface CareRecord {
  /** Unique record ID (also the DynamoDB sort key prefix). */
  id: string
  /** Conversation this record belongs to. */
  conversationId: string
  /** The user's original query text. */
  queryText: string
  /** The AI-generated answer. */
  answer: string
  /** Primary care event category. */
  category: CareEvent
  /** Confidence score for the primary category (0–1). */
  confidence: number
  /** Candidate categories with scores. */
  candidates: CareEventCandidate[]
  /** Source citations from the knowledge base. */
  citations: Citation[]
  /** Whether the structured output fallback was used. */
  usedStructuredOutputFallback: boolean
  /** ISO 8601 timestamp. */
  timestamp: string
}

/** Summary of care events for a given category in a time period. */
export interface CareEventSummary {
  /** The care event category. */
  category: CareEvent
  /** Number of records in this category. */
  count: number
  /** Average confidence score across records. */
  averageConfidence: number
  /** ISO 8601 timestamp of the most recent record in this category. */
  latestTimestamp: string
}
