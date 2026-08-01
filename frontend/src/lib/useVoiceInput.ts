import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
} from '@aws-sdk/client-transcribe-streaming'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getCoreAwsConfig } from './config'
import { getCredentialsProvider } from './credentials'
import { ServiceError, toServiceError } from './serviceErrors'

const TRANSCRIBE_SAMPLE_RATE = 16_000

type VoiceInputStatus = 'idle' | 'listening' | 'permission-denied' | 'error'

interface VoiceResources {
  audioContext: AudioContext
  audioStream: MediaStream
  operationId: number
  processor: ScriptProcessorNode
  queue: AudioChunkQueue
}

function releaseVoiceResources(resources: VoiceResources | undefined): void {
  if (resources === undefined) {
    return
  }

  resources.queue.close()
  resources.processor.disconnect()
  resources.audioStream.getTracks().forEach((track) => track.stop())
  void resources.audioContext.close()
}

class AudioChunkQueue {
  private chunks: Uint8Array[] = []
  private closed = false
  private resolveNext: ((chunk: Uint8Array | undefined) => void) | undefined

  push(chunk: Uint8Array): void {
    if (this.closed) {
      return
    }

    const resolve = this.resolveNext
    this.resolveNext = undefined

    if (resolve !== undefined) {
      resolve(chunk)
      return
    }

    this.chunks.push(chunk)
  }

  close(): void {
    this.closed = true
    const resolve = this.resolveNext
    this.resolveNext = undefined
    resolve?.(undefined)
  }

  async next(): Promise<Uint8Array | undefined> {
    const chunk = this.chunks.shift()

    if (chunk !== undefined) {
      return chunk
    }

    if (this.closed) {
      return undefined
    }

    return new Promise((resolve) => {
      this.resolveNext = resolve
    })
  }
}

function encodePcm(samples: Float32Array, inputSampleRate: number): Uint8Array {
  const ratio = inputSampleRate / TRANSCRIBE_SAMPLE_RATE
  const outputLength = Math.max(1, Math.round(samples.length / ratio))
  const output = new Int16Array(outputLength)

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio))
    let total = 0
    let count = 0

    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      total += samples[sourceIndex] ?? 0
      count += 1
    }

    const sample = Math.max(-1, Math.min(1, count === 0 ? 0 : total / count))
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }

  return new Uint8Array(output.buffer)
}

async function* createAudioStream(queue: AudioChunkQueue) {
  while (true) {
    const chunk = await queue.next()

    if (chunk === undefined) {
      return
    }

    yield { AudioEvent: { AudioChunk: chunk } }
  }
}

function extractTranscript(event: unknown): { text: string; partial: boolean }[] {
  if (typeof event !== 'object' || event === null || !('TranscriptEvent' in event)) {
    return []
  }

  const transcriptEvent = event.TranscriptEvent

  if (typeof transcriptEvent !== 'object' || transcriptEvent === null || !('Transcript' in transcriptEvent)) {
    return []
  }

  const transcript = transcriptEvent.Transcript

  if (typeof transcript !== 'object' || transcript === null || !('Results' in transcript)) {
    return []
  }

  const results = transcript.Results

  if (!Array.isArray(results)) {
    return []
  }

  return results.flatMap((result) => {
    if (typeof result !== 'object' || result === null || !('Alternatives' in result)) {
      return []
    }

    const alternatives = result.Alternatives

    if (!Array.isArray(alternatives) || alternatives.length === 0) {
      return []
    }

    const firstAlternative = alternatives[0]

    if (
      typeof firstAlternative !== 'object' ||
      firstAlternative === null ||
      !('Transcript' in firstAlternative) ||
      typeof firstAlternative.Transcript !== 'string' ||
      firstAlternative.Transcript.trim() === ''
    ) {
      return []
    }

    return [
      {
        text: firstAlternative.Transcript.trim(),
        partial: 'IsPartial' in result && result.IsPartial === true,
      },
    ]
  })
}

export interface VoiceInputController {
  errorMessage?: string
  interimTranscript: string
  isSupported: boolean
  start: () => Promise<void>
  status: VoiceInputStatus
  stop: () => void
  transcript: string
}

export function useVoiceInput(): VoiceInputController {
  const [status, setStatus] = useState<VoiceInputStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const resourcesRef = useRef<VoiceResources | undefined>(undefined)
  const manuallyStoppedRef = useRef(false)
  const operationIdRef = useRef(0)

  const stop = useCallback(() => {
    operationIdRef.current += 1
    manuallyStoppedRef.current = true
    const resources = resourcesRef.current
    resourcesRef.current = undefined
    releaseVoiceResources(resources)
    setInterimTranscript('')
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (resourcesRef.current !== undefined) {
      return
    }

    const operationId = operationIdRef.current + 1
    operationIdRef.current = operationId
    manuallyStoppedRef.current = false
    setErrorMessage(undefined)
    setTranscript('')
    setInterimTranscript('')
    let pendingAudioStream: MediaStream | undefined
    let pendingAudioContext: AudioContext | undefined

    try {
      const config = getCoreAwsConfig()

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('此瀏覽器不支援麥克風錄音。')
      }

      pendingAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      })

      if (operationIdRef.current !== operationId) {
        pendingAudioStream.getTracks().forEach((track) => track.stop())
        return
      }

      pendingAudioContext = new AudioContext()
      const audioStream = pendingAudioStream
      const audioContext = pendingAudioContext
      const source = audioContext.createMediaStreamSource(audioStream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      const silence = audioContext.createGain()
      const queue = new AudioChunkQueue()
      silence.gain.value = 0
      source.connect(processor)
      processor.connect(silence)
      silence.connect(audioContext.destination)
      processor.onaudioprocess = (audioEvent) => {
        const input = audioEvent.inputBuffer.getChannelData(0)
        queue.push(encodePcm(input, audioContext.sampleRate))
      }
      resourcesRef.current = { audioContext, audioStream, operationId, processor, queue }
      pendingAudioStream = undefined
      pendingAudioContext = undefined
      setStatus('listening')

      const client = new TranscribeStreamingClient({
        region: config.region,
        credentials: getCredentialsProvider(),
      })
      const response = await client.send(
        new StartStreamTranscriptionCommand({
          AudioStream: createAudioStream(queue),
          LanguageCode: 'zh-TW',
          MediaEncoding: 'pcm',
          MediaSampleRateHertz: TRANSCRIBE_SAMPLE_RATE,
          EnablePartialResultsStabilization: true,
          PartialResultsStability: 'medium',
        }),
      )

      for await (const event of response.TranscriptResultStream ?? []) {
        for (const result of extractTranscript(event)) {
          if (result.partial) {
            setInterimTranscript(result.text)
          } else {
            setTranscript((current) => `${current}${current === '' ? '' : ' '}${result.text}`)
            setInterimTranscript('')
          }
        }
      }

      if (!manuallyStoppedRef.current && operationIdRef.current === operationId) {
        const resources = resourcesRef.current

        if (resources?.operationId === operationId) {
          resourcesRef.current = undefined
          releaseVoiceResources(resources)
        }

        setInterimTranscript('')
        setStatus('idle')
      }
    } catch (error) {
      pendingAudioStream?.getTracks().forEach((track) => track.stop())
      void pendingAudioContext?.close()
      const resources = resourcesRef.current

      if (resources?.operationId === operationId) {
        resourcesRef.current = undefined
        releaseVoiceResources(resources)
      }

      if (operationIdRef.current !== operationId) {
        return
      }

      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setStatus('permission-denied')
        setErrorMessage('麥克風權限被拒絕，請改用文字輸入。')
      } else {
        const serviceError = error instanceof ServiceError ? error : toServiceError('transcribe', error)
        setStatus('error')
        setErrorMessage(serviceError.message)
      }
    }
  }, [])

  useEffect(() => stop, [stop])

  return {
    ...(errorMessage === undefined ? {} : { errorMessage }),
    interimTranscript,
    isSupported: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    start,
    status,
    stop,
    transcript,
  }
}
