// @ts-nocheck
/**
 * 情境感知對話引擎 - CareMate AI
 *
 * 當後端（Bedrock Claude）不可用時，提供在地的情境感知對話能力。
 * 根據以下因素動態生成回應：
 * - 使用者輸入的內容（關鍵詞比對）
 * - 目前時間（早/中/晚）
 * - 語言偏好（國語/台語）
 * - 對話歷史（記住之前聊過的事）
 * - 長者的個人資料（偏好、健康狀況）
 */

import { getElderById } from '../data/mockElders';
import { TAIWANESE_GREETINGS, TAIWANESE_CARE_PHRASES } from '../data/taiwaneseVocabulary';

// 對話記憶（記錄本次會話中提到的主題）
let conversationMemory = {
  topics: [],
  mood: 'neutral',
  lastMealMentioned: false,
  lastMedMentioned: false,
  lastSleepMentioned: false,
};

/**
 * 根據使用者輸入和情境生成動態回應
 */
export function generateContextualReply(userMessage, elderId, language) {
  const elder = getElderById(elderId);
  const hour = new Date().getHours();
  const timeContext = getTimeContext(hour);
  const isNanTW = language === 'nan-TW' || language === 'nan';

  // 分析使用者意圖
  const intent = analyzeIntent(userMessage);

  // 更新對話記憶
  updateMemory(intent, userMessage);

  // 根據意圖和情境生成回應
  let reply;
  switch (intent.category) {
    case 'greeting':
      reply = generateGreeting(timeContext, elder, isNanTW);
      break;
    case 'food':
      reply = generateFoodResponse(userMessage, timeContext, elder, isNanTW);
      break;
    case 'sleep':
      reply = generateSleepResponse(userMessage, timeContext, elder, isNanTW);
      break;
    case 'medication':
      reply = generateMedResponse(userMessage, elder, isNanTW);
      break;
    case 'emotion_positive':
      reply = generatePositiveResponse(userMessage, elder, isNanTW);
      break;
    case 'emotion_negative':
      reply = generateNegativeResponse(userMessage, elder, isNanTW);
      break;
    case 'health':
      reply = generateHealthResponse(userMessage, elder, isNanTW);
      break;
    case 'activity':
      reply = generateActivityResponse(userMessage, timeContext, elder, isNanTW);
      break;
    case 'family':
      reply = generateFamilyResponse(userMessage, elder, isNanTW);
      break;
    case 'weather':
      reply = generateWeatherResponse(timeContext, isNanTW);
      break;
    case 'memory':
      reply = generateMemoryResponse(userMessage, elder, isNanTW);
      break;
    default:
      reply = generateGeneralResponse(userMessage, timeContext, elder, isNanTW);
  }

  return reply;
}

/**
 * 分析使用者輸入的意圖
 */
function analyzeIntent(message) {
  const msg = message.toLowerCase();

  // 問候
  if (/^(你好|嗨|早安|午安|晚安|哈囉|hello|hi|透早好|食飽未)/.test(msg) ||
      /好無|按怎/.test(msg) && msg.length < 10) {
    return { category: 'greeting' };
  }

  // 飲食相關
  if (/吃|飯|餐|食|早餐|午餐|晚餐|肚子餓|煮|菜|湯|粥|麵|飽|餓|食飽|食飯|好料/.test(msg)) {
    return { category: 'food' };
  }

  // 睡眠相關
  if (/睡|覺|眠|失眠|睏|醒|作夢|夢|困|疲|累|睏|歇困|睏袂去/.test(msg)) {
    return { category: 'sleep' };
  }

  // 用藥相關
  if (/藥|吃藥|服藥|忘記吃|血壓|血糖|藥仔|食藥/.test(msg)) {
    return { category: 'medication' };
  }

  // 正面情緒
  if (/開心|高興|快樂|好棒|很好|不錯|歡喜|足好|真好|感恩|謝謝/.test(msg)) {
    return { category: 'emotion_positive' };
  }

  // 負面情緒
  if (/難過|傷心|孤單|寂寞|無聊|煩|害怕|擔心|想哭|不開心|袂爽|心情袂好|艱苦/.test(msg)) {
    return { category: 'emotion_negative' };
  }

  // 健康相關
  if (/痛|不舒服|暈|頭|胸|腳|手|醫|看診|檢查|袂爽快|頭殼痛/.test(msg)) {
    return { category: 'health' };
  }

  // 活動相關
  if (/散步|運動|走|公園|出去|電視|唱歌|下棋|泡茶|種花|跳舞/.test(msg)) {
    return { category: 'activity' };
  }

  // 家人相關
  if (/兒子|女兒|孫|老伴|家人|小孩|媳婦|來看|探望|打電話/.test(msg)) {
    return { category: 'family' };
  }

  // 天氣
  if (/天氣|下雨|太陽|熱|冷|風|溫度/.test(msg)) {
    return { category: 'weather' };
  }

  // 回憶
  if (/以前|年輕|從前|那時候|記得|想起|回憶|古早/.test(msg)) {
    return { category: 'memory' };
  }

  return { category: 'general' };
}

function getTimeContext(hour) {
  if (hour >= 5 && hour < 9) return 'early_morning';
  if (hour >= 9 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}

function updateMemory(intent, message) {
  conversationMemory.topics.push(intent.category);
  if (conversationMemory.topics.length > 10) {
    conversationMemory.topics.shift();
  }
  if (intent.category === 'food') conversationMemory.lastMealMentioned = true;
  if (intent.category === 'medication') conversationMemory.lastMedMentioned = true;
  if (intent.category === 'sleep') conversationMemory.lastSleepMentioned = true;
}

// =========== 各情境回應生成器 ===========

function generateGreeting(timeContext, elder, isNanTW) {
  const name = elder?.name || '';
  if (isNanTW) {
    // 使用台語詞彙庫中的道地問候語
    let greetingPool;
    if (timeContext === 'early_morning' || timeContext === 'morning') {
      greetingPool = TAIWANESE_GREETINGS.morning;
    } else if (timeContext === 'noon' || timeContext === 'afternoon') {
      greetingPool = TAIWANESE_GREETINGS.afternoon;
    } else if (timeContext === 'evening') {
      greetingPool = TAIWANESE_GREETINGS.evening;
    } else {
      greetingPool = TAIWANESE_GREETINGS.night;
    }
    const selected = greetingPool[Math.floor(Math.random() * greetingPool.length)];
    // 替換名稱
    return selected.taiwanese.replace(/阿公\/阿嬤/, name || '阿公');
  } else {
    const greetings = {
      early_morning: `${name}，早安！起得真早呢，昨晚有睡好嗎？`,
      morning: `${name}，早安！今天天氣不錯，有什麼想聊的嗎？`,
      noon: `${name}，午安！中午有好好吃飯嗎？`,
      afternoon: `${name}，下午好！有出去走走或是在家休息呢？`,
      evening: `${name}，晚上好！晚餐吃了什麼呢？今天過得開心嗎？`,
      night: `${name}，夜深了，差不多該休息了喔。今天辛苦了！`,
    };
    return greetings[timeContext] || `${name}，您好！今天感覺怎麼樣？`;
  }
}

function generateFoodResponse(message, timeContext, elder, isNanTW) {
  const favoriteFood = elder?.preferences?.favorite_food || '';

  if (/沒吃|不想吃|沒食|袂想食|無胃口/.test(message)) {
    if (isNanTW) {
      const phrases = TAIWANESE_CARE_PHRASES.food.filter(p => p.taiwanese.includes('胃口') || p.taiwanese.includes('食淡薄'));
      if (phrases.length > 0) return phrases[Math.floor(Math.random() * phrases.length)].taiwanese;
      return `按呢袂使喔，身體愛顧好才有力。${favoriteFood ? `你上愛食的${favoriteFood}，欲食看覓無？` : '食淡薄仔粥也好。'}`;
    }
    return `這樣不行喔，身體需要營養。如果沒胃口，喝碗粥或湯也好。${favoriteFood ? `要不要吃點您喜歡的${favoriteFood}？` : ''}`;
  }

  if (/好吃|很好|食飽|吃飽|真好食/.test(message)) {
    if (isNanTW) return '按呢真好！有食飽身體才有力氣。記得嘛愛飲水喔！';
    return '太好了！吃飽了身體才有精神。記得多喝水喔！';
  }

  if (isNanTW) {
    const pool = TAIWANESE_CARE_PHRASES.food;
    return pool[Math.floor(Math.random() * pool.length)].taiwanese;
  }
  const responses = [
    `今天${timeContext === 'noon' ? '中午' : '晚上'}想吃什麼呢？${favoriteFood ? `我記得您喜歡吃${favoriteFood}。` : ''}`,
    '飲食要均衡喔，記得多吃蔬菜水果。有按時吃三餐嗎？',
    '天氣熱要多喝水，煮碗湯也不錯。身體補充水分很重要。',
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function generateSleepResponse(message, timeContext, elder, isNanTW) {
  if (/失眠|睡不著|睏袂去/.test(message)) {
    if (isNanTW) {
      const pool = TAIWANESE_CARE_PHRASES.sleep.filter(p => p.taiwanese.includes('袂去') || p.taiwanese.includes('輕鬆'));
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)].taiwanese;
      return '暝時若睏袂去，莫煩惱，聽較輕鬆的音樂放鬆一下。若是一直睏袂去，明仔載佮照顧者講一下。';
    }
    return '失眠真辛苦。試試看睡前聽些輕音樂，或喝杯溫牛奶。如果一直睡不著，明天跟照護者說一聲比較好喔。';
  }

  if (/睡得好|睡好|睏好/.test(message)) {
    if (isNanTW) return '按呢足好！有睏好精神就好，今仔日會當做較多代誌。';
    return '太好了！睡得好精神就好，今天可以活力滿滿呢！';
  }

  if (timeContext === 'night') {
    if (isNanTW) {
      const pool = TAIWANESE_CARE_PHRASES.sleep.filter(p => p.taiwanese.includes('差不多') || p.taiwanese.includes('時間'));
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)].taiwanese;
      return '時間到了，差不多會當去睏了。早睏早起身體好！';
    }
    return '時間不早了，差不多該休息了。把燈調暗，放鬆心情，祝您有個好夢！';
  }

  if (isNanTW) {
    const pool = TAIWANESE_CARE_PHRASES.sleep;
    return pool[Math.floor(Math.random() * pool.length)].taiwanese;
  }
  return '睡眠對身體很重要。您平常幾點睡覺？有睡夠嗎？';
}

function generateMedResponse(message, elder, isNanTW) {
  const meds = elder?.medications || [];
  const medInfo = meds.length > 0 ? meds[0] : '';

  if (/忘記|忘了|沒吃|無食/.test(message)) {
    if (isNanTW) return `藥仔愛記得食喔！${medInfo ? `你的${medInfo}真重要，莫閣袂記得。` : ''}現在去食也可以，下擺愛記得按時食。`;
    return `藥要記得吃喔！${medInfo ? `您的${medInfo}很重要，別忘了。` : ''}現在去吃也可以，下次要記得按時服用。`;
  }

  if (/有吃|吃了|食了|有食/.test(message)) {
    if (isNanTW) {
      const pool = TAIWANESE_CARE_PHRASES.medication.filter(p => p.taiwanese.includes('認真') || p.taiwanese.includes('按時'));
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)].taiwanese;
      return '真好！有按時食藥仔身體才會好。你足認真的！';
    }
    return '很好！按時吃藥身體才會好。您很認真呢！';
  }

  if (isNanTW) {
    const pool = TAIWANESE_CARE_PHRASES.medication;
    return pool[Math.floor(Math.random() * pool.length)].taiwanese;
  }
  return `藥有記得吃嗎？${medInfo ? `您的${medInfo}要按時服用喔。` : ''}照顧好身體最重要。`;
}

function generatePositiveResponse(message, elder, isNanTW) {
  if (isNanTW) {
    const pool = TAIWANESE_CARE_PHRASES.positive;
    return pool[Math.floor(Math.random() * pool.length)].taiwanese;
  }
  const responses = [
    '聽到您這麼開心我也很高興！是發生了什麼好事嗎？說來聽聽。',
    '太好了！保持好心情對身體很好，您今天看起來精神很不錯呢！',
    '真開心聽到！好心情會讓一整天都特別美好。有什麼想分享的嗎？',
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function generateNegativeResponse(message, elder, isNanTW) {
  if (isNanTW) {
    const pool = TAIWANESE_CARE_PHRASES.negative;
    return pool[Math.floor(Math.random() * pool.length)].taiwanese;
  }
  const responses = [
    '我聽到了，您的感受我能理解。沒關係，我陪您說說話。想聊什麼都可以。',
    '心情不好的時候，有人陪伴就比較好受。我在這裡聽您說。要不要做幾個深呼吸？',
    '辛苦了。每天都不一樣，明天可能就會好一些。您想做什麼放鬆一下嗎？',
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function generateHealthResponse(message, elder, isNanTW) {
  if (isNanTW) {
    const pool = TAIWANESE_CARE_PHRASES.health;
    return pool[Math.floor(Math.random() * pool.length)].taiwanese;
  }
  return '聽起來身體有些不舒服。如果一直沒有改善，建議跟照護者說一下，去看醫生比較安心。現在先休息一下好嗎？';
}

function generateActivityResponse(message, timeContext, elder, isNanTW) {
  if (isNanTW) {
    const pool = TAIWANESE_CARE_PHRASES.activity;
    return pool[Math.floor(Math.random() * pool.length)].taiwanese;
  }
  const activities = elder?.preferences?.favorite_topics || [];
  const activityHint = activities.length > 0 ? activities[Math.floor(Math.random() * activities.length)] : '';
  if (/散步|走/.test(message)) return '散步對身體很好！慢慢走就好，不用趕。回來記得喝水喔。';
  return `活動一下對身體很好！${activityHint ? `您想要${activityHint}嗎？` : '要不要去外面走走？'}天氣好的話出去曬曬太陽也不錯。`;
}

function generateFamilyResponse(message, elder, isNanTW) {
  if (isNanTW) {
    const pool = TAIWANESE_CARE_PHRASES.family;
    return pool[Math.floor(Math.random() * pool.length)].taiwanese;
  }
  const familyInfo = elder?.family_info || {};
  const visitor = familyInfo.frequent_visitor || '';
  return `家人是最重要的。${visitor ? `${visitor}常常來看您，真好。` : ''}想念家人的時候可以跟我說，我陪您聊聊。`;
}

function generateWeatherResponse(timeContext, isNanTW) {
  if (isNanTW) {
    return '今仔日天氣若好就出去行行，若落雨就佇厝內歇。記得穿適當的衫，莫著冷著熱。';
  }
  return '今天天氣如果好就出去走走，下雨就在家休息。記得穿合適的衣服，不要著涼了。';
}

function generateMemoryResponse(message, elder, isNanTW) {
  if (isNanTW) {
    const pool = TAIWANESE_CARE_PHRASES.memory;
    return pool[Math.floor(Math.random() * pool.length)].taiwanese;
  }
  return '您的回憶真精彩！我很喜歡聽您說以前的事。那些人生經歷都是很寶貴的，請繼續說來聽聽。';
}

function generateGeneralResponse(message, timeContext, elder, isNanTW) {
  // 根據時段和對話記憶生成適當的話題引導
  const topics = elder?.preferences?.favorite_topics || [];
  const topicSuggestion = topics.length > 0
    ? topics[Math.floor(Math.random() * topics.length)]
    : '';

  if (isNanTW) {
    const responses = [
      `我聽到了。${topicSuggestion ? `你敢有想欲講${topicSuggestion}的代誌？` : '有啥物想欲講的攏會當佮我說。'}`,
      '嗯，我佇遮聽你講。你今仔日有做啥物代誌？',
      `按呢喔。${timeContext === 'evening' || timeContext === 'night' ? '暗暝了，今仔日辛苦了，歇困較早比較好。' : '你今仔日精神按怎？有啥物想做的無？'}`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  const responses = [
    `我聽到了。${topicSuggestion ? `您想聊聊${topicSuggestion}的事嗎？` : '有什麼想聊的都可以跟我說。'}`,
    '嗯，我在聽您說。今天有做什麼事嗎？',
    `好的。${timeContext === 'evening' || timeContext === 'night' ? '晚上了，今天辛苦了，早點休息比較好喔。' : '您今天精神怎麼樣？有想做什麼事嗎？'}`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * 重置對話記憶
 */
export function resetConversationMemory() {
  conversationMemory = {
    topics: [],
    mood: 'neutral',
    lastMealMentioned: false,
    lastMedMentioned: false,
    lastSleepMentioned: false,
  };
}
