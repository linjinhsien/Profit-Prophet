import axios from 'axios';
import {
  ELDER_PROFILES,
  ELDER_MEMORIES,
  ELDER_LIFE_RECORDS,
  ELDER_EMOTION_STATS,
  getElderById,
  getElderList,
} from '../data/mockElders';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 是否使用模擬資料（當後端不可用時自動 fallback）
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || true;

// 語音對話 API
export const chatAPI = {
  // 文字對話
  sendMessage: async (elderId, message, language = 'zh-TW') => {
    if (USE_MOCK) {
      return _mockChatResponse(elderId, message, language);
    }
    const response = await apiClient.post('/chat', {
      elder_id: elderId,
      message,
      language,
    });
    return response.data;
  },

  // 語音對話 - 上傳音訊取得回應
  sendSpeech: async (elderId, audioBlob, language = 'zh-TW') => {
    if (USE_MOCK) {
      return _mockSpeechResponse(elderId, language);
    }
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('elder_id', elderId);
    formData.append('language', language);

    const response = await apiClient.post('/speech', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'json',
    });
    return response.data;
  },
};

// 摘要 API
export const summaryAPI = {
  // 取得每日摘要
  getDailySummary: async (elderId, date) => {
    if (USE_MOCK) {
      return _mockSummaryResponse(elderId, date);
    }
    const response = await apiClient.post('/summary', {
      elder_id: elderId,
      date,
    });
    return response.data;
  },

  // 取得週摘要
  getWeeklySummary: async (elderId) => {
    if (USE_MOCK) {
      return _mockWeeklySummaryResponse(elderId);
    }
    const response = await apiClient.post('/summary', {
      elder_id: elderId,
      type: 'weekly',
    });
    return response.data;
  },
};

// 記憶 API
export const memoryAPI = {
  // 取得長者記憶
  getMemory: async (elderId) => {
    if (USE_MOCK) {
      return _mockMemoryResponse(elderId);
    }
    const response = await apiClient.get(`/memory/${elderId}`);
    return response.data;
  },
};

// 長者資料 API
export const profileAPI = {
  // 取得所有長者列表
  getElderList: async () => {
    if (USE_MOCK) {
      return { elders: getElderList() };
    }
    const response = await apiClient.get('/profile');
    return response.data;
  },

  // 取得長者資料
  getProfile: async (elderId) => {
    if (USE_MOCK) {
      const profile = getElderById(elderId);
      return { elder_id: elderId, profile };
    }
    const response = await apiClient.get(`/profile/${elderId}`);
    return response.data;
  },

  // 更新長者資料
  updateProfile: async (elderId, data) => {
    if (USE_MOCK) {
      return { elder_id: elderId, profile: data, message: '更新成功' };
    }
    const response = await apiClient.put(`/profile/${elderId}`, data);
    return response.data;
  },
};

// 生活紀錄 API
export const lifeRecordAPI = {
  // 取得長者生活紀錄
  getRecords: async (elderId) => {
    if (USE_MOCK) {
      return { elder_id: elderId, records: ELDER_LIFE_RECORDS[elderId] || [] };
    }
    const response = await apiClient.get(`/records/${elderId}`);
    return response.data;
  },

  // 取得情緒統計
  getEmotionStats: async (elderId) => {
    if (USE_MOCK) {
      return { elder_id: elderId, stats: ELDER_EMOTION_STATS[elderId] || [] };
    }
    const response = await apiClient.get(`/records/${elderId}/emotions`);
    return response.data;
  },
};

export default apiClient;

// ==================== Mock 回應函數 ====================

function _mockChatResponse(elderId, message, language) {
  const elder = getElderById(elderId);
  const name = elder ? elder.name : '長者';
  const hour = new Date().getHours();

  let reply;
  if (language === 'nan-TW') {
    const greetings = hour < 12 ? '透早好' : hour < 18 ? '下晝好' : '暗暝好';
    reply = `${greetings}！${name}，我聽到你講的了。今仔日感覺按怎？有食飽無？記得愛食藥仔喔！`;
  } else {
    const greetings = hour < 12 ? '早安' : hour < 18 ? '午安' : '晚安';
    reply = `${greetings}！${name}，我聽到您說的了。今天感覺怎麼樣？有沒有按時吃飯和吃藥呢？`;
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        reply_text: reply,
        audio_url: null,
        life_record: { sleep: '', food: '', activity: '', drug: '', emotion: '' },
        language: language,
        detected_language: language,
      });
    }, 800);
  });
}

function _mockSpeechResponse(elderId, language) {
  const elder = getElderById(elderId);
  const name = elder ? elder.name : '長者';

  const transcribed = language === 'nan-TW' ? '今仔日天氣真好' : '今天天氣很好';
  const reply = language === 'nan-TW'
    ? `是啊！${name}，今仔日天氣足好的，欲去外口散步無？走一走對身體好喔！`
    : `是啊！${name}，今天天氣很好呢，要不要去外面散散步？走走路對身體很好喔！`;

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        transcribed_text: transcribed,
        reply_text: reply,
        audio_url: null,
        life_record: { sleep: '', food: '', activity: '想去散步', drug: '', emotion: '開心' },
        language: language,
        detected_language: language,
      });
    }, 1200);
  });
}

function _mockSummaryResponse(elderId, date) {
  const memory = ELDER_MEMORIES[elderId];
  if (!memory) {
    return Promise.resolve({
      elder_id: elderId,
      date: date || new Date().toISOString().slice(0, 10),
      summary: '尚無資料',
      stats: { conversation_count: 0, sleep: [], food: [], activity: [], drug: [], emotion: [] },
      alerts: [],
    });
  }

  const targetDate = date || new Date().toISOString().slice(0, 10);
  const daySummary = memory.recent_summary.find((s) => s.date === targetDate);
  const records = ELDER_LIFE_RECORDS[elderId] || [];
  const dayRecord = records.find((r) => r.date === targetDate);

  return Promise.resolve({
    elder_id: elderId,
    date: targetDate,
    type: 'daily',
    summary: daySummary ? daySummary.summary : '今天尚無對話記錄。',
    stats: {
      conversation_count: daySummary ? daySummary.conversation_count : 0,
      sleep: dayRecord ? [dayRecord.sleep] : [],
      food: dayRecord ? [dayRecord.food] : [],
      activity: dayRecord ? [dayRecord.activity] : [],
      drug: dayRecord ? [dayRecord.drug] : [],
      emotion: dayRecord ? [dayRecord.emotion] : [],
    },
    alerts: [],
  });
}

function _mockWeeklySummaryResponse(elderId) {
  const memory = ELDER_MEMORIES[elderId];
  if (!memory) {
    return Promise.resolve({ elder_id: elderId, summary: '尚無資料', stats: {} });
  }

  return Promise.resolve({
    elder_id: elderId,
    type: 'weekly',
    summary: `本週共進行 ${memory.weekly_stats.conversations} 次對話。平均睡眠 ${memory.weekly_stats.avg_sleep} 小時，正餐完成率 ${memory.weekly_stats.meal_completion}%，情緒指數 ${memory.weekly_stats.emotion_score}/10。整體狀況穩定。`,
    stats: memory.weekly_stats,
    alerts: [],
  });
}

function _mockMemoryResponse(elderId) {
  const elder = getElderById(elderId);
  const memory = ELDER_MEMORIES[elderId];

  if (!elder) {
    return Promise.resolve({ elder_id: elderId, profile: {}, recent_summary: [] });
  }

  return Promise.resolve({
    elder_id: elderId,
    profile: elder,
    personal_preferences: elder.preferences || {},
    family_info: elder.family_info || {},
    health_info: {
      conditions: elder.diseases || [],
      medications: elder.medications || [],
      allergies: elder.allergies || [],
    },
    recent_summary: memory ? memory.recent_summary : [],
    life_records: ELDER_LIFE_RECORDS[elderId] || [],
  });
}
