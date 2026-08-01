import { useCallback, useEffect, useRef, useState } from 'react'

type CaptionMessage =
  | { type: 'ready'; engine: string; region: string; language: string }
  | { type: 'partial'; original: string; segmentId: string }
  | { type: 'final'; original: string; startTime: number; lang?: string; speakers?: string[]; confidence?: number; segmentId: string }
  | { type: 'done'; stats: Record<string, unknown> }
  | { type: 'error'; message: string }

interface FinalCaption {
  id: string
  text: string
  startTime: number
  lang?: string
  speakers?: string[]
  confidence?: number
}

const SAMPLE_RATE = 16_000
const CHUNK_MS = 100

export function LiveCaptionPage() {
  const [isRecording, setIsRecording] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null)
  const [status, setStatus] = useState('尚未開始')
  const [error, setError] = useState<string | undefined>()
  const [engine, setEngine] = useState('—')
  const [region, setRegion] = useState('—')
  const [language, setLanguage] = useState('—')
  const [sentSeconds, setSentSeconds] = useState(0)
  const [partial, setPartial] = useState('')
  const [finals, setFinals] = useState<FinalCaption[]>([])
  const [level, setLevel] = useState(0)
  const [preset, setPreset] = useState('clinic')
  const [lang, setLang] = useState('')
  const [engineSelect, setEngineSelect] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const sentRef = useRef(0)
  const captionsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => {
        if (!r.ok) { setBackendAvailable(false); return }
        return r.json()
      })
      .then((config) => {
        if (config) {
          setEngine(config.engine)
          setRegion(config.region)
          setBackendAvailable(true)
        }
      })
      .catch(() => {
        setBackendAvailable(false)
      })
  }, [])

  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [finals, partial])

  const cleanup = useCallback(() => {
    workletNodeRef.current?.port.close()
    sourceNodeRef.current?.disconnect()
    workletNodeRef.current?.disconnect()
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    void audioContextRef.current?.close()
    workletNodeRef.current = null
    sourceNodeRef.current = null
    mediaStreamRef.current = null
    audioContextRef.current = null
  }, [])

  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = JSON.parse(event.data as string) as CaptionMessage
    switch (msg.type) {
      case 'ready':
        setEngine(msg.engine)
        setRegion(msg.region)
        setLanguage(msg.language.startsWith('auto:') ? '自動辨識' : msg.language)
        setStatus('正在聆聽')
        setIsConnecting(false)
        setIsRecording(true)
        break
      case 'partial':
        setPartial(msg.original)
        break
      case 'final':
        setPartial('')
        setFinals((prev) => [...prev, {
          id: msg.segmentId,
          text: msg.original,
          startTime: msg.startTime,
          lang: msg.lang,
          speakers: msg.speakers,
          confidence: msg.confidence,
        }])
        break
      case 'done':
        setStatus('已結束')
        setIsRecording(false)
        break
      case 'error':
        setError(msg.message)
        setStatus('發生錯誤')
        setIsRecording(false)
        setIsConnecting(false)
        break
    }
  }, [])

  const start = useCallback(async () => {
    setError(undefined)
    setIsConnecting(true)
    setStatus('連線中…')
    sentRef.current = 0
    setSentSeconds(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      mediaStreamRef.current = stream

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      audioContextRef.current = ctx
      await ctx.audioWorklet.addModule('/pcm-worklet.js')

      const params = new URLSearchParams({ preset })
      if (lang) params.set('lang', lang)
      if (engineSelect) params.set('engine', engineSelect)
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
      const wsUrl = `${scheme}://${location.host}/ws/captions?${params}`

      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      ws.onmessage = handleMessage
      ws.onerror = () => setError('WebSocket 連線失敗')
      ws.onclose = () => {
        setIsRecording(false)
        setIsConnecting(false)
        setLevel(0)
        cleanup()
      }
      wsRef.current = ws

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.addEventListener('error', reject, { once: true })
      })

      const source = ctx.createMediaStreamSource(stream)
      sourceNodeRef.current = source

      const worklet = new AudioWorkletNode(ctx, 'pcm-chunker', {
        numberOfOutputs: 0,
        processorOptions: { chunkMs: CHUNK_MS },
      })
      workletNodeRef.current = worklet

      worklet.port.onmessage = ({ data }: MessageEvent<{ pcm: ArrayBuffer; dbfs: number }>) => {
        const dbfs = data.dbfs
        const ratio = Number.isFinite(dbfs) ? Math.max(0, Math.min(1, (dbfs + 60) / 60)) : 0
        setLevel(ratio)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data.pcm)
          sentRef.current += data.pcm.byteLength / 2 / SAMPLE_RATE
          setSentSeconds(sentRef.current)
        }
      }

      source.connect(worklet)
    } catch (err) {
      setError(`啟動失敗：${err instanceof Error ? err.message : String(err)}`)
      setStatus('尚未開始')
      setIsConnecting(false)
      cleanup()
    }
  }, [preset, lang, engineSelect, handleMessage, cleanup])

  const stop = useCallback(() => {
    setStatus('收尾中…')
    sourceNodeRef.current?.disconnect()
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }))
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    setLevel(0)
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
    }
  }, [cleanup])

  const meterColor = level > 0.9 ? 'bg-red-500' : level > 0.58 ? 'bg-green-500' : 'bg-amber-500'

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header>
        <p className="text-sm font-bold tracking-[0.18em] text-teal-700">安心聽 CARECAPTION</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">即時語音字幕</h1>
        <p className="mt-2 text-slate-600">對著麥克風說話，即時轉錄字幕會出現在下方。</p>
      </header>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        {backendAvailable === false ? (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
            <strong>即時字幕後端未連線。</strong> 此功能需要在本機啟動 LiveCaption backend（port 8000）。
            其他頁面功能不受影響。
          </div>
        ) : null}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600" htmlFor="lc-preset">情境</label>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={isRecording || isConnecting}
              id="lc-preset"
              onChange={(e) => setPreset(e.target.value)}
              value={preset}
            >
              <option value="clinic">看診／衛教（固定中文）</option>
              <option value="caregiver">照服員與長者（自動判語言）</option>
              <option value="elder">長者自己用（低延遲）</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600" htmlFor="lc-lang">語言</label>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={isRecording || isConnecting}
              id="lc-lang"
              onChange={(e) => setLang(e.target.value)}
              value={lang}
            >
              <option value="">依情境預設</option>
              <option value="zh-TW">中文（台灣）</option>
              <option value="auto">自動辨識</option>
              <option value="en-US">英語</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600" htmlFor="lc-engine">引擎</label>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={isRecording || isConnecting}
              id="lc-engine"
              onChange={(e) => setEngineSelect(e.target.value)}
              value={engineSelect}
            >
              <option value="">依環境變數</option>
              <option value="aws">aws（Amazon Transcribe）</option>
              <option value="elevenlabs">elevenlabs（Scribe v2）</option>
              <option value="mock">mock（離線模擬）</option>
              <option value="auto">auto（連不上就退回 mock）</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isRecording || isConnecting || backendAvailable === false}
              onClick={() => void start()}
              type="button"
            >
              {isConnecting ? '連線中…' : '開始說話'}
            </button>
            <button
              className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={!isRecording}
              onClick={stop}
              type="button"
            >
              結束
            </button>
          </div>
        </div>

        {/* 音量條 */}
        <div className="mt-4 h-6 overflow-hidden rounded-lg bg-slate-100">
          <div
            className={`h-full transition-all duration-75 ${meterColor}`}
            style={{ width: `${(level * 100).toFixed(1)}%` }}
          />
        </div>

        {/* 狀態列 */}
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
          <span>
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${isRecording ? 'bg-green-500' : error ? 'bg-red-500' : 'bg-slate-400'}`} />
            <strong className="text-slate-800">{status}</strong>
          </span>
          <span>引擎 <strong className="text-slate-800">{engine}</strong></span>
          <span>區域 <strong className="text-slate-800">{region}</strong></span>
          <span>語言 <strong className="text-slate-800">{language}</strong></span>
          <span>已送出 <strong className="text-slate-800">{sentSeconds.toFixed(1)}</strong> 秒</span>
        </div>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </section>

      {/* 字幕區 */}
      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-sm font-bold tracking-wider text-slate-500">字幕</h2>
        <div aria-live="polite" className="min-h-40 space-y-3 text-lg leading-relaxed text-slate-800">
          {finals.length === 0 && !partial ? (
            <p className="text-slate-400">按「開始說話」後，字幕會出現在這裡。</p>
          ) : null}
          {finals.map((f) => (
            <p key={f.id} className="border-b border-slate-100 pb-2">
              <span className="block text-xs text-slate-400">
                {f.startTime.toFixed(1)}s
                {f.lang ? ` · ${f.lang}` : ''}
                {f.speakers?.length ? ` · 語者 ${f.speakers.join('/')}` : ''}
                {f.confidence != null ? ` · 信賴度 ${f.confidence.toFixed(2)}` : ''}
              </span>
              {f.text}
            </p>
          ))}
          {partial ? <p className="text-amber-600">{partial}</p> : null}
          <div ref={captionsEndRef} />
        </div>
      </section>

      <p className="mt-4 text-sm text-slate-400">
        黃色是還在辨識中的文字（可能會被改寫），黑色是定稿。瀏覽器需要麥克風權限。
      </p>
    </main>
  )
}
