// @ts-nocheck
import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Volume2, Globe, Send } from 'lucide-react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { generateContextualReply } from '../services/contextualChat';
import { getBedrockConfig } from '../lib/config';
import { getCredentialsProvider } from '../lib/credentials';
import { getElderById } from '../data/mockElders';
import { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } from '@aws-sdk/client-bedrock-agent-runtime';

const LANGUAGE_OPTIONS = [
  { value: 'zh-TW', label: '國語', emoji: '🇹🇼' },
  { value: 'nan-TW', label: '台語', emoji: '🗣️' },
];

const ASR_OPTIONS = [
  { value: 'browser', label: 'Web Speech（瀏覽器）', desc: '免設定，國語為主' },
  { value: 'taiwan-tongues', label: 'Taiwan-Tongues ASR', desc: '華語+台語+客語' },
  { value: 'breeze-taigi', label: 'BreezeASR 台語專精', desc: '台語辨識最準確' },
  { value: 'transcribe', label: 'AWS Transcribe', desc: '國語高精度（需後端）' },
];

const HF_MODELS = {
  'taiwan-tongues': 'adi-gov-tw/Taiwan-Tongues-ASR-CE-pretrained-v2.0',
  'breeze-taigi': 'Speech-AI-Research-Center/Breeze-ASR-26',
};

/**
 * 透過 Hugging Face Inference API 進行語音辨識
 * 送出錄音的 audio blob → 回傳辨識文字
 */
async function transcribeWithHF(audioBlob: Blob, modelKey: string): Promise<string> {
  const modelId = HF_MODELS[modelKey];
  if (!modelId) throw new Error(`未知的模型: ${modelKey}`);

  const url = `https://api-inference.huggingface.co/models/${modelId}`;
  const arrayBuffer = await audioBlob.arrayBuffer();

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'audio/wav',
      // 免費 tier 不需要 token，但有速率限制
      // 如果有 token 可加上：'Authorization': 'Bearer hf_xxxxx'
    },
    body: arrayBuffer,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    if (resp.status === 503) throw new Error('模型載入中，請稍後 30 秒再試...');
    throw new Error(`HF API 錯誤 (${resp.status}): ${errText}`);
  }

  const result = await resp.json();
  return result.text || '';
}

async function askClaude(userMessage, elderId, language, chatHistory) {
  const config = getBedrockConfig();
  const elder = getElderById(elderId);
  const elderContext = elder
    ? `長者：${elder.name}，${elder.age}歲，疾病：${elder.diseases?.join('、')||'無'}，用藥：${elder.medications?.join('、')||'無'}，喜好：${elder.preferences?.favorite_topics?.join('、')||'無'}`
    : '';
  const langHint = language === 'nan-TW' ? '請用台語（閩南語）回應。' : '請用繁體中文回應。';
  const recentHistory = chatHistory.slice(-4).map(m => `${m.role==='user'?'長者':'助手'}：${m.content}`).join('\n');

  const prompt = `你是「安心伴」智慧長照陪伴助手。溫暖親切地陪伴長者聊天。
${elderContext}
${langHint}回應2-3句話。
${recentHistory ? `對話：\n${recentHistory}\n` : ''}
長者說：${userMessage}`;

  const client = new BedrockAgentRuntimeClient({
    region: config.region,
    credentials: getCredentialsProvider(),
  });

  const response = await client.send(new RetrieveAndGenerateCommand({
    input: { text: prompt },
    retrieveAndGenerateConfiguration: {
      type: 'KNOWLEDGE_BASE',
      knowledgeBaseConfiguration: {
        knowledgeBaseId: config.knowledgeBaseId,
        modelArn: config.modelArn,
      },
    },
  }));

  return response?.output?.text?.trim() || '我在這裡陪您。';
}

export function VoiceChatPage({ elderId, language: initialLanguage }) {
  const [language, setLanguage] = useState(initialLanguage || 'zh-TW');
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [asrEngine, setAsrEngine] = useState('browser');
  const messagesEndRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [isRecordingHF, setIsRecordingHF] = useState(false);
  const [hfStatus, setHfStatus] = useState('');

  const { isListening, transcript, interimTranscript, error: speechError, isSupported, startListening, stopListening, resetTranscript } = useSpeechRecognition();

  const useHFModel = asrEngine === 'taiwan-tongues' || asrEngine === 'breeze-taigi';

  useEffect(() => {
    if (!useHFModel && transcript && !isListening && !isProcessing) {
      handleUserMessage(transcript);
      resetTranscript();
    }
  }, [transcript, isListening]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleVoiceToggle = async () => {
    if (useHFModel) {
      // MediaRecorder flow for HF models
      if (isRecordingHF) {
        // Stop recording
        mediaRecorderRef.current?.stop();
        setIsRecordingHF(false);
      } else {
        // Start recording
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };

          mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            setHfStatus('辨識中...');
            try {
              const text = await transcribeWithHF(audioBlob, asrEngine);
              setHfStatus('');
              if (text.trim()) {
                handleUserMessage(text.trim());
              } else {
                setHfStatus('未辨識到語音，請再試一次');
                setTimeout(() => setHfStatus(''), 3000);
              }
            } catch (err) {
              setHfStatus(err.message);
              setTimeout(() => setHfStatus(''), 5000);
            }
          };

          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.start();
          setIsRecordingHF(true);
          setHfStatus('');
        } catch (err) {
          setHfStatus('麥克風權限被拒絕');
        }
      }
    } else {
      // Web Speech API flow
      if (isListening) {
        stopListening();
      } else {
        startListening(language);
      }
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

  const handleUserMessage = async (text) => {
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);
    try {
      let reply;
      if (useAI) {
        try { reply = await askClaude(text, elderId, language, [...messages, userMsg]); }
        catch(e) { console.warn('AI fallback:', e); reply = generateContextualReply(text, elderId, language); }
      } else {
        await new Promise(r => setTimeout(r, 400));
        reply = generateContextualReply(text, elderId, language);
      }
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toISOString() }]);
      speakText(reply);
    } finally { setIsProcessing(false); }
  };

  const speakText = async (text) => {
    if (!text) return;
    setIsPlaying(true);
    try {
      // 使用 AWS Polly 高品質神經網路語音
      const { PollyClient, SynthesizeSpeechCommand } = await import('@aws-sdk/client-polly');
      const { getCoreAwsConfig } = await import('../lib/config');
      const config = getCoreAwsConfig();
      const pollyClient = new PollyClient({
        region: config.region,
        credentials: getCredentialsProvider(),
      });

      // 分段處理（Polly 單次最多 3000 字）
      const segments = text.match(/[^。！？.!?\n]+[。！？.!?\n]?/g) || [text];
      const audioChunks = [];

      for (const segment of segments) {
        const trimmed = segment.trim();
        if (!trimmed) continue;
        const resp = await pollyClient.send(new SynthesizeSpeechCommand({
          Engine: 'neural',
          LanguageCode: 'cmn-CN',
          OutputFormat: 'mp3',
          SampleRate: '16000',
          Text: trimmed,
          VoiceId: 'Zhiyu',
        }));
        if (resp.AudioStream) {
          const bytes = await resp.AudioStream.transformToByteArray();
          audioChunks.push(bytes);
        }
      }

      if (audioChunks.length > 0) {
        const blob = new Blob(audioChunks.map(c => c.buffer), { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { setIsPlaying(false); URL.revokeObjectURL(url); };
        audio.onerror = () => { setIsPlaying(false); URL.revokeObjectURL(url); };
        await audio.play();
      } else {
        setIsPlaying(false);
      }
    } catch (e) {
      console.warn('Polly TTS 失敗，退回瀏覽器語音：', e);
      // Fallback to browser TTS
      if (synthRef.current) {
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-TW';
        utterance.rate = 0.85;
        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);
        synthRef.current.speak(utterance);
      } else {
        setIsPlaying(false);
      }
    }
  };

  const hour = new Date().getHours();
  const greeting = language === 'nan-TW'
    ? (hour < 12 ? '透早好！' : hour < 18 ? '下晝好！' : '暗暝好！')
    : (hour < 12 ? '早安！' : hour < 18 ? '午安！' : '晚安！');
  const elderProfile = getElderById(elderId);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="flex flex-col h-[calc(100vh-220px)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{greeting} 我是 AI 陪伴助手</h1>
            {elderProfile && <p className="text-sm text-slate-500 mt-1">陪伴對象：{elderProfile.name}（{elderProfile.age}歲）</p>}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={useAI} onChange={e => setUseAI(e.target.checked)} className="rounded" />
              Claude AI
            </label>
            <select value={language} onChange={e => setLanguage(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
              {LANGUAGE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.emoji} {opt.label}</option>)}
            </select>
            <select value={asrEngine} onChange={e => setAsrEngine(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" title="語音辨識引擎">
              {ASR_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>

        <div className={`rounded-lg px-4 py-2 mb-4 text-xs ${useAI ? 'bg-teal-50 border border-teal-100 text-teal-700' : 'bg-amber-50 border border-amber-100 text-amber-700'}`}>
          {useAI ? '🤖 AI 模式：Claude Sonnet 4.5 + 照護知識庫' : '💬 離線模式：本地情境引擎'}
          {' • 語音辨識：'}
          {asrEngine === 'browser' && '瀏覽器 Web Speech'}
          {asrEngine === 'taiwan-tongues' && '🇹🇼 Taiwan-Tongues（華語+台語+客語）'}
          {asrEngine === 'breeze-taigi' && '🗣️ BreezeASR（台語專精）'}
          {asrEngine === 'transcribe' && 'AWS Transcribe（國語）'}
        </div>

        <div className="flex-1 overflow-y-auto mb-4 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Mic size={48} className="mb-4" />
              <p className="text-lg">按下麥克風或輸入文字開始對話</p>
              <p className="text-sm mt-2">我會陪您聊天、關心您的生活</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${msg.role === 'user' ? 'bg-teal-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}>
                <p className="text-sm leading-relaxed">{msg.content}</p>
                <span className={`text-xs mt-1 block ${msg.role === 'user' ? 'text-teal-200' : 'text-slate-400'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          {isProcessing && <div className="flex justify-start"><div className="bg-slate-100 text-slate-500 px-4 py-3 rounded-2xl rounded-bl-md text-sm animate-pulse">🤖 思考中...</div></div>}
          <div ref={messagesEndRef} />
        </div>

        {(isListening || interimTranscript) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-3 text-sm text-amber-800">辨識中：{interimTranscript || '正在聆聽...'}</div>
        )}
        {isRecordingHF && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-3 text-sm text-red-700 animate-pulse">🎙️ 錄音中...說完後按一次停止，系統會送出辨識</div>
        )}
        {hfStatus && !isRecordingHF && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-3 text-sm text-blue-700">{hfStatus}</div>
        )}
        {speechError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-3 text-red-700 text-sm">{speechError}</div>}

        <div className="flex items-center gap-3">
          <form onSubmit={handleTextSubmit} className="flex-1 flex gap-2">
            <input type="text" name="message" placeholder={language === 'nan-TW' ? '輸入台語或中文...' : '輸入文字...'} className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm" disabled={isProcessing} />
            <button type="submit" className="rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-slate-400 flex items-center gap-1" disabled={isProcessing}><Send size={16} /> 送出</button>
          </form>
          <button onClick={handleVoiceToggle} disabled={isProcessing} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg ${isListening || isRecordingHF ? 'bg-red-500 animate-pulse' : 'bg-teal-600 hover:bg-teal-700'} ${isProcessing?'opacity-50':''}`} aria-label={isListening || isRecordingHF ? '停止' : '錄音'}>
            {isListening || isRecordingHF ? <MicOff size={24} className="text-white" /> : <Mic size={24} className="text-white" />}
          </button>
          {isPlaying && <Volume2 size={20} className="text-teal-600 animate-pulse" />}
        </div>
        {(isListening || isRecordingHF) && <p className="text-center text-sm text-red-500 mt-2 animate-pulse">🎙️ 正在聆聽...說完後按一次停止</p>}
      </div>
    </main>
  );
}
