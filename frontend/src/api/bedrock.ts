import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
} from '@aws-sdk/client-bedrock-agent-runtime'
import { getBedrockConfig } from '../lib/config'
import { getCredentialsProvider } from '../lib/credentials'
import { isFiniteNumber, isRecord, isSafeExternalUrl, readNumber, readString } from '../lib/guards'
import { toServiceError } from '../lib/serviceErrors'
import {
  type CareAnswer,
  type CareEventCandidate,
  type Citation,
  isCareEvent,
  isClassifiedCareEvent,
} from '../types/care'

const MAX_QUERY_LENGTH = 2000
const MAX_CITATIONS = 10
const MAX_CANDIDATES = 3

const STRUCTURED_OUTPUT_PROMPT = `You are a caregiver information assistant. Use only the retrieved knowledge-base information. Do not invent care facts. Return one JSON object and no markdown or prose outside JSON.

Search results:
$search_results$

Caregiver query:
$query$

Use exactly this schema:
{"answer":"string","category":"health_status|emotion_state|daily_activities|medication_records|emergency_events|social_interaction|nutrition|sleep_patterns|unclassified","confidence":0.0,"candidates":[{"category":"one of the eight classified categories","confidence":0.0}]}

The answer must be in Traditional Chinese. If confidence is below 0.6, category must be "unclassified" and candidates must contain the top three classified categories in descending confidence order.`

export class QueryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueryValidationError'
  }
}

function validateQueryText(queryText: string): string {
  const normalized = queryText.trim()

  if (normalized.length === 0 || normalized.length > MAX_QUERY_LENGTH) {
    throw new QueryValidationError('問題需為 1 至 2000 個字元，且不可只包含空白。')
  }

  return normalized
}

function removeMarkdownFence(text: string): string {
  const trimmed = text.trim()
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return match?.[1] ?? trimmed
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(removeMarkdownFence(text))
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function isConfidence(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

function parseCandidates(value: unknown): CareEventCandidate[] {
  if (!Array.isArray(value)) {
    return []
  }

  const candidates: CareEventCandidate[] = []

  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue
    }

    const category = readString(candidate, 'category')
    const confidence = readNumber(candidate, 'confidence')

    if (
      category !== undefined &&
      isCareEvent(category) &&
      isClassifiedCareEvent(category) &&
      isConfidence(confidence)
    ) {
      candidates.push({ category, confidence })
    }
  }

  return candidates
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_CANDIDATES)
}

function parseStructuredAnswer(text: string): Omit<CareAnswer, 'citations'> | undefined {
  const parsed = parseJsonObject(text)

  if (parsed === undefined) {
    return undefined
  }

  const answer = readString(parsed, 'answer')
  const category = readString(parsed, 'category')
  const confidence = readNumber(parsed, 'confidence')

  if (
    answer === undefined ||
    category === undefined ||
    !isCareEvent(category) ||
    !isConfidence(confidence)
  ) {
    return undefined
  }

  const candidates = parseCandidates(parsed.candidates)
  const resolvedCategory = confidence < 0.6 ? 'unclassified' : category

  return {
    answer,
    category: resolvedCategory,
    confidence,
    candidates: resolvedCategory === 'unclassified' ? candidates : [],
    usedStructuredOutputFallback: false,
  }
}

function readCitationUri(location: Record<string, unknown>): string | undefined {
  for (const key of ['s3Location', 'webLocation', 'confluenceLocation', 'salesforceLocation']) {
    const nested = location[key]

    if (isRecord(nested)) {
      const uri = readString(nested, 'uri')

      if (uri !== undefined) {
        return uri
      }
    }
  }

  return undefined
}

function parseCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) {
    return []
  }

  const citations: Citation[] = []

  for (const citation of value) {
    if (!isRecord(citation) || !Array.isArray(citation.retrievedReferences)) {
      continue
    }

    for (const reference of citation.retrievedReferences) {
      if (!isRecord(reference)) {
        continue
      }

      const content = isRecord(reference.content) ? readString(reference.content, 'text') : undefined
      const uri = isRecord(reference.location) ? readCitationUri(reference.location) : undefined
      const safeUri = isSafeExternalUrl(uri) ? uri : undefined
      const score = readNumber(reference, 'score')

      if (content !== undefined) {
        citations.push({
          id: safeUri ?? `citation-${citations.length + 1}`,
          excerpt: content,
          ...(safeUri === undefined ? {} : { uri: safeUri }),
          ...(score === undefined ? {} : { score }),
        })
      }
    }
  }

  return citations.slice(0, MAX_CITATIONS)
}

export function parseBedrockResponse(value: unknown): CareAnswer {
  const response = isRecord(value) ? value : undefined
  const output = response !== undefined && isRecord(response.output) ? response.output : undefined
  const outputText = output === undefined ? undefined : readString(output, 'text')
  const citations = response === undefined ? [] : parseCitations(response.citations)

  if (outputText === undefined) {
    return {
      answer: '系統未收到可顯示的回覆內容。',
      category: 'unclassified',
      confidence: 0,
      candidates: [],
      citations,
      usedStructuredOutputFallback: true,
    }
  }

  const structuredAnswer = parseStructuredAnswer(outputText)

  if (structuredAnswer !== undefined) {
    return { ...structuredAnswer, citations }
  }

  return {
    answer: outputText,
    category: 'unclassified',
    confidence: 0,
    candidates: [],
    citations,
    usedStructuredOutputFallback: true,
  }
}

export async function queryKnowledgeBase(queryText: string): Promise<CareAnswer> {
  const text = validateQueryText(queryText)

  try {
    const config = getBedrockConfig()
    const client = new BedrockAgentRuntimeClient({
      region: config.region,
      credentials: getCredentialsProvider(),
    })
    const response = await client.send(
      new RetrieveAndGenerateCommand({
        input: { text },
        retrieveAndGenerateConfiguration: {
          type: 'KNOWLEDGE_BASE',
          knowledgeBaseConfiguration: {
            knowledgeBaseId: config.knowledgeBaseId,
            modelArn: config.modelArn,
            generationConfiguration: {
              promptTemplate: { textPromptTemplate: STRUCTURED_OUTPUT_PROMPT },
            },
          },
        },
      }),
    )

    return parseBedrockResponse(response)
  } catch (error) {
    if (error instanceof QueryValidationError) {
      throw error
    }

    throw toServiceError('bedrock', error)
  }
}
