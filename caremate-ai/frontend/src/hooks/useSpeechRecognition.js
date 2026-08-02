import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * 自訂 Hook：使用瀏覽器 Web Speech API 進行即時語音辨識
 * 支援國語（zh-TW）語音辨識
 *
 * Web Speech API 優勢：
 * - 免後端、免費
 * - 即時串流辨識（邊說邊轉文字）
 * - Chrome/Edge 支援良好，支援中文
 *
 * 限制：
 * - 台語辨識精度有限（會嘗試以中文辨識）
 * - 需要網路連線（使用 Google 語音辨識服務）
 */
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    // 檢查瀏覽器是否支援 Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSupported(true);
    } else {
      setIsSupported(false);
      setError('您的瀏覽器不支援語音辨識，建議使用 Chrome 或 Edge');
    }
  }, []);

  const startListening = useCallback((language = 'zh-TW') => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('瀏覽器不支援語音辨識');
      return;
    }

    setError(null);
    setTranscript('');
    setInterimTranscript('');

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'nan-TW' ? 'zh-TW' : language; // 台語用中文模型
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      if (finalText) {
        setTranscript(finalText);
      }
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event) => {
      console.error('語音辨識錯誤:', event.error);
      if (event.error === 'not-allowed') {
        setError('請允許麥克風權限以使用語音功能');
      } else if (event.error === 'no-speech') {
        setError('未偵測到語音，請再試一次');
      } else if (event.error === 'network') {
        setError('網路連線問題，請檢查網路');
      } else {
        setError(`語音辨識錯誤：${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}
