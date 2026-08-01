/**
 * 麥克風可用性檢查。
 *
 * 瀏覽器只在「安全環境」(secure context) 才會掛上 `navigator.mediaDevices`：
 * HTTPS、或 `http://localhost` / `http://127.0.0.1`。
 * 用區網 IP（例如 `http://192.168.1.20:5173`）開頁面時，
 * `navigator.mediaDevices` 會是 `undefined`，
 * 直接讀 `.getUserMedia` 就會爆 TypeError。
 */

/** 麥克風 API 是否可用。 */
export function isMicrophoneSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

/**
 * 麥克風不可用時回傳可讀的原因，可用時回傳 undefined。
 *
 * @returns 給使用者看的錯誤訊息，或 undefined 表示可以錄音
 */
export function describeMicrophoneBlocker(): string | undefined {
  if (typeof navigator === 'undefined') {
    return '目前環境沒有瀏覽器 API，無法錄音。'
  }

  if (isMicrophoneSupported()) {
    return undefined
  }

  const isSecure = typeof window !== 'undefined' && window.isSecureContext
  if (!isSecure) {
    const origin = typeof location === 'undefined' ? '目前網址' : location.origin
    return (
      `瀏覽器只在安全環境下開放麥克風，目前用 ${origin} 開啟，因此 navigator.mediaDevices 不存在。` +
      '請改用 http://localhost:5173 或 http://127.0.0.1:5173，或是把服務掛上 HTTPS。'
    )
  }

  return '此瀏覽器不支援麥克風錄音（navigator.mediaDevices.getUserMedia 不可用）。'
}

/**
 * 取得麥克風串流，環境不支援時丟出說明清楚的錯誤。
 *
 * @param constraints - 傳給 getUserMedia 的限制條件
 * @returns 麥克風音訊串流
 */
export async function requestMicrophone(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const blocker = describeMicrophoneBlocker()
  if (blocker !== undefined) {
    throw new Error(blocker)
  }

  return navigator.mediaDevices.getUserMedia(constraints)
}
