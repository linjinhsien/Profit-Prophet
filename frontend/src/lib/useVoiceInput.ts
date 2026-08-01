import { useCallback, useEffect, useRef, useState } from 'react'
import { getBackendUrl } from './config'
import { isMicrophoneSupported, requestMicrophone } from './micSupport'

const SAMPLE_RATE = 16_000
const CHUNK_MS = 100

type VoiceInputStatus = 'idle' | 'listening' | 'permission-denied' | 'error'

interface VoiceResources {
  audioContext: AudioContext
  audioStream: MediaStream
  workletNode: AudioWorkletNode
  sourceNode: MediaStreamAudioSourceNode
  ws: WebSocket
}

function releaseVoiceResources(resources: VoiceResources | undefined): void {
  if (resources === undefined) {
    return
  }

  resources.workletNode.port.close()
  resources.sourceNode.disconnect()
  resources.workletNode.disconnect()
  resources.audioStream.getTracks().forEach((track) => track.stop())
  void resources.audioContext.close()

  if (resources.ws.readyState === WebSocket.OPEN) {
    resources.ws.send(JSON.stringify({ type: 'stop' }))
  }
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
  const operationIdRef = useRef(0)

  const stop = useCallback(() => {
    operationIdRef.current += 1
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
    setErrorMessage(undefined)
    setTranscript('')
    setInterimTranscript('')

    let pendingStream: MediaStream | undefined
    let pendingContext: AudioContext | undefined

    try {
      // 取得麥克風（環境不支援時會丟出說明清楚的錯誤）
      pendingStream = await requestMicrophone({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })

      if (operationIdRef.current !== operationId) {
        pendingStream.getTracks().forEach((track) => track.stop())
        return
      }

      // 建立 AudioContext（16kHz，瀏覽器負責重取樣）
      pendingContext = new AudioContext({ sampleRate: SAMPLE_RATE })
      const audioContext = pendingContext
      const audioStream = pendingStream

      // 載入 PCM Worklet
      await audioContext.audioWorklet.addModule('/pcm-worklet.js')

      if (operationIdRef.current !== operationId) {
        audioStream.getTracks().forEach((track) => track.stop())
        void audioContext.close()
        return
      }

      // 建立 WebSocket 連線到 backend
      const backendUrl = getBackendUrl()
      const wsBase = backendUrl ? backendUrl.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
      const params = new URLSearchParams({ preset: 'clinic', lang: 'zh-TW' })
      const wsUrl = `${wsBase}/ws/captions?${params}`
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'

      // 等待 WebSocket 開啟
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.addEventListener('error', () => reject(new Error('WebSocket 連線失敗，請確認 LiveCaption backend 是否啟動。')), { once: true })
      })

      if (operationIdRef.current !== operationId) {
        ws.close()
        audioStream.getTracks().forEach((track) => track.stop())
        void audioContext.close()
        return
      }

      // 處理 WebSocket 訊息
      ws.onmessage = (event) => {
        if (operationIdRef.current !== operationId) return

        const msg = JSON.parse(event.data as string) as {
          type: string
          original?: string
          message?: string
        }

        switch (msg.type) {
          case 'ready':
            setStatus('listening')
            break
          case 'partial':
            setInterimTranscript(msg.original ?? '')
            break
          case 'final':
            setTranscript((current) =>
              `${current}${current === '' ? '' : ''}${msg.original ?? ''}`,
            )
            setInterimTranscript('')
            break
          case 'done':
            // 後端處理完畢
            break
          case 'error':
            setErrorMessage(msg.message ?? '語音辨識發生錯誤')
            setStatus('error')
            break
        }
      }

      ws.onclose = () => {
        if (operationIdRef.current === operationId) {
          resourcesRef.current = undefined
          setInterimTranscript('')
          if (status !== 'error') {
            setStatus('idle')
          }
        }
      }

      ws.onerror = () => {
        if (operationIdRef.current === operationId) {
          setErrorMessage('WebSocket 連線中斷')
          setStatus('error')
        }
      }

      // 建立音訊管線
      const sourceNode = audioContext.createMediaStreamSource(audioStream)
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-chunker', {
        numberOfOutputs: 0,
        processorOptions: { chunkMs: CHUNK_MS },
      })

      workletNode.port.onmessage = ({ data }: MessageEvent<{ pcm: ArrayBuffer; dbfs: number }>) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data.pcm)
        }
      }

      sourceNode.connect(workletNode)

      // 儲存資源參考
      resourcesRef.current = { audioContext, audioStream, workletNode, sourceNode, ws }
      pendingStream = undefined
      pendingContext = undefined
      // status 會在收到 'ready' 訊息後才設為 'listening'

    } catch (error) {
      pendingStream?.getTracks().forEach((track) => track.stop())
      void pendingContext?.close()

      if (operationIdRef.current !== operationId) {
        return
      }

      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setStatus('permission-denied')
        setErrorMessage('麥克風權限被拒絕，請改用文字輸入。')
      } else {
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : String(error))
      }
    }
  }, [])

  useEffect(() => stop, [stop])

  return {
    ...(errorMessage === undefined ? {} : { errorMessage }),
    interimTranscript,
    isSupported: isMicrophoneSupported(),
    start,
    status,
    stop,
    transcript,
  }
}
