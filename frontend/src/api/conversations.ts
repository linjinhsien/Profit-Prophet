import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import {
  decryptConversation,
  encryptConversation,
  type EncryptedConversationPayload,
} from '../lib/conversationCrypto'
import { getConversationConfig } from '../lib/config'
import { getCognitoIdentityId, getCredentialsProvider } from '../lib/credentials'
import { isFiniteNumber, isRecord, isSafeExternalUrl, readNumber, readString } from '../lib/guards'
import { toServiceError } from '../lib/serviceErrors'
import {
  type CareAnswer,
  type CareEventCandidate,
  type Citation,
  type ConversationRecord,
  isCareEvent,
  isClassifiedCareEvent,
} from '../types/care'

const HISTORY_LIMIT = 50

export interface ConversationInput extends CareAnswer {
  queryText: string
}

interface StoredConversation {
  encryptedPayload: EncryptedConversationPayload
  id: string
  timestamp: string
}

function getDocumentClient(): DynamoDBDocumentClient {
  const config = getConversationConfig()
  const client = new DynamoDBClient({
    region: config.region,
    credentials: getCredentialsProvider(),
  })

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  })
}

function parseCandidates(value: unknown): CareEventCandidate[] {
  if (!Array.isArray(value)) {
    return []
  }

  const candidates: CareEventCandidate[] = []

  for (const item of value) {
    if (!isRecord(item)) {
      continue
    }

    const category = readString(item, 'category')
    const confidence = readNumber(item, 'confidence')

    if (
      category !== undefined &&
      isCareEvent(category) &&
      isClassifiedCareEvent(category) &&
      confidence !== undefined &&
      confidence >= 0 &&
      confidence <= 1
    ) {
      candidates.push({ category, confidence })
    }
  }

  return candidates.slice(0, 3)
}

function parseCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) {
    return []
  }

  const citations: Citation[] = []

  for (const item of value) {
    if (!isRecord(item)) {
      continue
    }

    const id = readString(item, 'id')
    const excerpt = readString(item, 'excerpt')
    const uriCandidate = readString(item, 'uri')
    const uri = isSafeExternalUrl(uriCandidate) ? uriCandidate : undefined
    const score = readNumber(item, 'score')

    if (id !== undefined && excerpt !== undefined) {
      citations.push({
        id,
        excerpt,
        ...(uri === undefined ? {} : { uri }),
        ...(score === undefined || !isFiniteNumber(score) ? {} : { score }),
      })
    }
  }

  return citations.slice(0, 10)
}

function parseConversation(value: unknown): ConversationRecord | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const id = readString(value, 'id')
  const timestamp = readString(value, 'timestamp')
  const queryText = readString(value, 'queryText')
  const answer = readString(value, 'answer')
  const category = readString(value, 'category')
  const confidence = readNumber(value, 'confidence')

  if (
    id === undefined ||
    timestamp === undefined ||
    queryText === undefined ||
    answer === undefined ||
    category === undefined ||
    !isCareEvent(category) ||
    confidence === undefined ||
    confidence < 0 ||
    confidence > 1
  ) {
    return undefined
  }

  return {
    id,
    timestamp,
    queryText,
    answer,
    category,
    confidence,
    candidates: parseCandidates(value.candidates),
    citations: parseCitations(value.citations),
    usedStructuredOutputFallback: value.usedStructuredOutputFallback === true,
  }
}

function parseStoredConversation(value: unknown): StoredConversation | undefined {
  if (!isRecord(value) || !isRecord(value.encryptedPayload)) {
    return undefined
  }

  const id = readString(value, 'id')
  const timestamp = readString(value, 'timestamp')
  const ciphertext = readString(value.encryptedPayload, 'ciphertext')
  const initializationVector = readString(value.encryptedPayload, 'initializationVector')
  const salt = readString(value.encryptedPayload, 'salt')

  if (
    id === undefined ||
    timestamp === undefined ||
    ciphertext === undefined ||
    initializationVector === undefined ||
    salt === undefined
  ) {
    return undefined
  }

  return {
    id,
    timestamp,
    encryptedPayload: { ciphertext, initializationVector, salt },
  }
}

export async function saveConversation(
  conversation: ConversationInput,
  encryptionPassphrase: string,
): Promise<ConversationRecord> {
  try {
    const config = getConversationConfig()
    const identityId = await getCognitoIdentityId()
    const record: ConversationRecord = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...conversation,
    }
    const encryptedPayload = await encryptConversation(record, encryptionPassphrase)

    await getDocumentClient().send(
      new PutCommand({
        TableName: config.tableName,
        Item: {
          identityId,
          id: record.id,
          timestamp: record.timestamp,
          encryptedPayload,
        },
      }),
    )

    return record
  } catch (error) {
    throw toServiceError('dynamodb', error)
  }
}

export async function loadConversationHistory(
  encryptionPassphrase: string,
): Promise<ConversationRecord[]> {
  try {
    const config = getConversationConfig()
    const identityId = await getCognitoIdentityId()
    const response = await getDocumentClient().send(
      new QueryCommand({
        TableName: config.tableName,
        KeyConditionExpression: '#identityId = :identityId',
        ExpressionAttributeNames: { '#identityId': 'identityId' },
        ExpressionAttributeValues: { ':identityId': identityId },
        ScanIndexForward: false,
        Limit: HISTORY_LIMIT,
      }),
    )
    const records: ConversationRecord[] = []

    for (const item of response.Items ?? []) {
      const stored = parseStoredConversation(item)

      if (stored === undefined) {
        continue
      }

      const decrypted = await decryptConversation(stored.encryptedPayload, encryptionPassphrase)
      const record = parseConversation(decrypted)

      if (record !== undefined && record.id === stored.id && record.timestamp === stored.timestamp) {
        records.push(record)
      }
    }

    return records.sort((left, right) => right.timestamp.localeCompare(left.timestamp))
  } catch (error) {
    throw toServiceError('dynamodb', error)
  }
}
