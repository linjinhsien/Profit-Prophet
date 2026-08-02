import { useCallback, useEffect, useState } from 'react'
import { loadConversationHistory } from '../api/conversations'
import { hasValidConversationPassphrase } from '../lib/conversationCrypto'
import type { ConversationRecord } from '../types/care'

interface UseCareRecordsParams {
  passphrase: string
}

interface UseCareRecordsResult {
  records: ConversationRecord[]
  isLoading: boolean
  error: string | undefined
  reload: () => void
}

function messageForError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return '無法讀取對話紀錄，請稍後再試。'
}

export function useCareRecords({ passphrase }: UseCareRecordsParams): UseCareRecordsResult {
  const [records, setRecords] = useState<ConversationRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [reloadTrigger, setReloadTrigger] = useState(0)

  const isValid = hasValidConversationPassphrase(passphrase)

  useEffect(() => {
    if (!isValid) {
      return
    }

    let active = true

    async function load() {
      setIsLoading(true)
      setError(undefined)

      try {
        const history = await loadConversationHistory(passphrase)

        if (active) {
          const sorted = [...history].sort(
            (left, right) => right.timestamp.localeCompare(left.timestamp),
          )
          setRecords(sorted)
        }
      } catch (err) {
        if (active) {
          setError(messageForError(err))
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [isValid, passphrase, reloadTrigger])

  const reload = useCallback(() => {
    setReloadTrigger((previous) => previous + 1)
  }, [])

  return { records, isLoading, error, reload }
}
