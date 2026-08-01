import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, Globe, Send, Languages } from 'lucide-react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { generateContextualReply } from '../services/contextualChat';

const LANGUAGE_OPTIONS = [
  { value: 'zh-TW', label: '國語', emoji: '🇹🇼' },
  { value: 'nan-TW', label: '台語', emoji: '🗣️' },
];

function VoiceChat() {
  const [language, setLanguage] = useState('zh-TW');
  const [elderId] = useState('elder-001');
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const messagesEndRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  const {
    isListening,
    transcript,
    interimTranscript,
    error: speechError,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  // 當語音辨識完成（偵測到最終結果）時自動處理
  useEffect(() => {
    if (transcript && !isListening && !isProcessing) {
      handleUserMessage(transcript);
      resetTranscript();
    }
  }, [transcript, isListening]);

  // 自動滾動到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleVoiceToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening(language);
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    const input = e.target.elements.message;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handleUserMessage(text);
  };

  const handleUserMessage = (text) => {
    // 加入使用者訊息
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, timestamp: new Date().toISOString() },
    ]);

    setIsProcessing(true);

    // 模擬短暫思考時間，然後生成情境感知回應
    setTimeout(() => {
      const reply = generateContextualReply(text, elderId, language);

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
      ]);

      // 使用瀏覽器 TTS 朗讀回應
      speakText(reply);
      setIsProcessing(false);
    }, 600 + Math.random() * 800); // 0.6-1.4 秒的自然延遲
  };

  const speakText = (text) => {
    if (!synthRef.current) return;

    // 取消之前的語音
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW';
    utterance.rate = 0.85; // 稍慢，適合長者
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // 選擇中文語音
    const voices = synthRef.current.getVoices();
    const zhVoice = voices.find(v => v.lang.includes('zh') && v.lang.includes('TW'))
      || voices.find(v => v.lang.includes('zh'))
      || voices[0];
    if (zhVoice) utterance.voice = zhVoice;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    synthRef.current.speak(utterance);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (language === 'nan-TW') {
      if (hour < 12) return '透早好！我是你的陪伴助手';
      if (hour < 18) return '下晝好！我是你的陪伴助手';
      return '暗暝好！我是你的陪伴助手';
    }
    if (hour < 12) return '早安！我是您的陪伴助手';
    if (hour < 18) return '午安！我是您的陪伴助手';
    return '晚安！我是您的陪伴助手';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      {/* 頂部 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">{getGreeting()}</h2>
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-gray-500" />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            aria-label="選擇語言"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.emoji} {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 語言提示 */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 mb-4">
        <p className="text-xs text-blue-700">
          {language === 'zh-TW' && '🇹🇼 國語模式：按麥克風說話，或直接打字。系統會即時辨識您的語音並以語音回應。'}
          {language === 'nan-TW' && '🗣️ 台語模式：系統會以台語回應。語音辨識使用中文模型，台語口說會盡力辨識。'}
        </p>
      </div>

      {/* 對話區域 */}
      <div className="card flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Mic size={48} className="mb-4" />
            <p className="text-lg">按下麥克風按鈕開始對話</p>
            <p className="text-sm mt-2">我會陪您聊天、關心您的生活</p>
            <div className="mt-4 text-xs text-gray-300 space-y-1">
              <p>支援語音和文字輸入</p>
              <p>我會根據時間和話題動態回應</p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-primary-500 text-white rounded-br-md'
                  : msg.role === 'system'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              }`}
            >
              <p className="text-sm leading-relaxed">{msg.content}</p>
              <span className={`text-xs mt-1 block ${
                msg.role === 'user' ? 'text-primary-100' : 'text-gray-400'
              }`}>
                {new Date(msg.timestamp).toLocaleTimeString('zh-TW', {
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 即時辨識結果顯示 */}
      {(isListening || interimTranscript) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 mb-3 text-sm text-yellow-800">
          <span className="font-medium">辨識中：</span>
          {interimTranscript || '正在聆聽...'}
        </div>
      )}

      {/* 錯誤提示 */}
      {speechError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-3 text-red-700 text-sm">
          {speechError}
        </div>
      )}

      {/* 輸入區域 */}
      <div className="flex items-center gap-4">
        <form onSubmit={handleTextSubmit} className="flex-1 flex gap-2">
          <input
            type="text"
            name="message"
            placeholder={language === 'nan-TW' ? '輸入台語或中文...' : '輸入文字訊息...'}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            disabled={isProcessing}
            aria-label="輸入訊息"
          />
          <button type="submit" className="btn-primary text-sm flex items-center gap-1" disabled={isProcessing}>
            <Send size={16} /> 送出
          </button>
        </form>

        {/* 語音按鈕 */}
        <button
          onClick={handleVoiceToggle}
          disabled={isProcessing || !isSupported}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg ${
            isListening
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-primary-500 hover:bg-primary-600'
          } ${(!isSupported || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-label={isListening ? '停止錄音' : '開始錄音'}
        >
          {isListening ? (
            <MicOff size={28} className="text-white" />
          ) : (
            <Mic size={28} className="text-white" />
          )}
        </button>

        {isPlaying && (
          <div className="flex items-center gap-1 text-primary-600">
            <Volume2 size={20} className="animate-pulse" />
          </div>
        )}
      </div>

      {/* 狀態提示 */}
      {isListening && (
        <div className="text-center text-sm text-red-500 mt-2 animate-pulse">
          🎙️ 正在聆聽...說完後按一次停止
        </div>
      )}
      {isProcessing && (
        <div className="text-center text-sm text-gray-500 mt-2 animate-pulse">
          正在思考回應...
        </div>
      )}

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}

export default VoiceChat;
