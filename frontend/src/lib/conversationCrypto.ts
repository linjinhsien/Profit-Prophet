import { type ConversationRecord } from '../types/care'

const MIN_PASSPHRASE_LENGTH = 12
const PBKDF2_ITERATIONS = 310_000

export interface EncryptedConversationPayload {
  ciphertext: string
  initializationVector: string
  salt: string
}

export class ConversationEncryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConversationEncryptionError'
  }
}

function requirePassphrase(passphrase: string): string {
  const normalized = passphrase.trim()

  if (normalized.length < MIN_PASSPHRASE_LENGTH) {
    throw new ConversationEncryptionError(`對話加密通關碼至少需要 ${MIN_PASSPHRASE_LENGTH} 個字元。`)
  }

  return normalized
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes.buffer
}

async function deriveEncryptionKey(passphrase: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    copyToArrayBuffer(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptConversation(
  conversation: ConversationRecord,
  passphrase: string,
): Promise<EncryptedConversationPayload> {
  const normalizedPassphrase = requirePassphrase(passphrase)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const initializationVector = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveEncryptionKey(normalizedPassphrase, copyToArrayBuffer(salt))
  const plaintext = copyToArrayBuffer(new TextEncoder().encode(JSON.stringify(conversation)))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: copyToArrayBuffer(initializationVector) },
    key,
    plaintext,
  )

  return {
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
    initializationVector: encodeBase64(initializationVector),
    salt: encodeBase64(salt),
  }
}

export async function decryptConversation(
  payload: EncryptedConversationPayload,
  passphrase: string,
): Promise<unknown | undefined> {
  try {
    const normalizedPassphrase = requirePassphrase(passphrase)
    const salt = decodeBase64(payload.salt)
    const initializationVector = decodeBase64(payload.initializationVector)
    const ciphertext = decodeBase64(payload.ciphertext)
    const key = await deriveEncryptionKey(normalizedPassphrase, salt)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: initializationVector },
      key,
      ciphertext,
    )
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext))

    return parsed
  } catch (error) {
    if (error instanceof ConversationEncryptionError) {
      throw error
    }

    return undefined
  }
}

export function hasValidConversationPassphrase(passphrase: string): boolean {
  return passphrase.trim().length >= MIN_PASSPHRASE_LENGTH
}
