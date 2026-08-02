interface VoiceButtonProps {
  status: 'idle' | 'listening' | 'permission-denied' | 'error'
  isSupported: boolean
  disabled?: boolean
  onToggle: () => void
  interimTranscript?: string
  errorMessage?: string
}

export function VoiceButton({
  status,
  isSupported,
  disabled,
  onToggle,
  interimTranscript,
  errorMessage,
}: VoiceButtonProps) {
  const isListening = status === 'listening'
  const isPermissionDenied = status === 'permission-denied'
  const isError = status === 'error'

  function getButtonClassName(): string {
    const focusStyles = 'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2'
    if (isListening) {
      return `animate-pulse rounded-xl border-2 border-red-500 bg-red-50 px-5 py-3 font-semibold text-red-700 hover:bg-red-100 ${focusStyles}`
    }
    if (isPermissionDenied) {
      return `rounded-xl border border-slate-300 bg-slate-100 px-5 py-3 font-semibold text-slate-400 cursor-not-allowed ${focusStyles}`
    }
    if (isError) {
      return `rounded-xl border-2 border-amber-500 px-5 py-3 font-semibold text-amber-800 hover:bg-amber-50 ${focusStyles}`
    }
    return `rounded-xl border border-teal-700 px-5 py-3 font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400 ${focusStyles}`
  }

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        aria-label={isListening ? '停止語音輸入' : '開始語音輸入'}
        aria-pressed={isListening}
        className={getButtonClassName()}
        disabled={disabled || !isSupported || isPermissionDenied}
        onClick={onToggle}
        type="button"
      >
        {isListening ? '⏹️ 停止錄音' : '🎙️ 語音輸入'}
      </button>

      {isPermissionDenied && (
        <p aria-live="assertive" className="text-xs text-slate-500">麥克風權限被拒絕，請在瀏覽器設定中允許</p>
      )}

      {isListening && interimTranscript && (
        <div aria-live="polite" aria-atomic="true" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {interimTranscript}
        </div>
      )}

      {errorMessage && (
        <p aria-live="assertive" role="alert" className="text-sm text-amber-800">{errorMessage}</p>
      )}
    </div>
  )
}
