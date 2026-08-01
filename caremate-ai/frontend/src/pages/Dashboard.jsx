import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { Activity, Moon, Utensils, Pill, Heart, MessageCircle, AlertTriangle } from 'lucide-react';
import ElderSelector from '../components/ElderSelector';
import {
  ELDER_PROFILES,
  ELDER_MEMORIES,
  ELDER_LIFE_RECORDS,
  ELDER_EMOTION_STATS,
  getElderById,
} from '../data/mockElders';

function StatCard({ icon: Icon, label, value, unit, color }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-800">
          {value}
          {unit && <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>}
        </p>
      </div>
    </div>
  );
}

function Dashboard() {
  const [elderId, setElderId] = useState('elder-001');
  const [elderData, setElderData] = useState(null);
  const [weeklyChartData, setWeeklyChartData] = useState([]);
  const [emotionData, setEmotionData] = useState([]);
  const [foodData, setFoodData] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);

  useEffect(() => {
    loadElderData(elderId);
  }, [elderId]);

  const loadElderData = (id) => {
    const profile = getElderById(id);
    const memory = ELDER_MEMORIES[id];
    const lifeRecords = ELDER_LIFE_RECORDS[id] || [];
    const emotions = ELDER_EMOTION_STATS[id] || [];

    setElderData({ profile, memory });
    setEmotionData(emotions);

    // 建構週報圖表資料
    if (lifeRecords.length > 0) {
      const days = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
      const chartData = lifeRecords.slice(0, 7).map((record, idx) => {
        const sleepMatch = record.sleep.match(/(\d+\.?\d*)\s*小時/);
        const sleepHours = sleepMatch ? parseFloat(sleepMatch[1]) : 7;
        const convCount = memory?.recent_summary[idx]?.conversation_count || 0;
        // 根據情緒文字推估分數
        const emotionScore = _getEmotionScore(record.emotion);
        return {
          day: days[idx % 7],
          date: record.date,
          conversations: convCount,
          emotion_score: emotionScore,
          sleep_hours: sleepHours,
        };
      });
      setWeeklyChartData(chartData);
    }

    // 建構飲食統計
    if (lifeRecords.length > 0) {
      let breakfast = 0, lunch = 0, dinner = 0, snack = 0;
      lifeRecords.forEach((r) => {
        if (r.food.includes('早') || r.food.includes('早餐')) breakfast++;
        if (r.food.includes('午') || r.food.includes('中')) lunch++;
        if (r.food.includes('晚') || r.food.includes('暗')) dinner++;
        if (r.food.includes('點心') || r.food.includes('水果')) snack++;
      });
      setFoodData([
        { meal: '早餐', count: breakfast },
        { meal: '午餐', count: lunch },
        { meal: '晚餐', count: dinner },
        { meal: '點心/水果', count: snack },
      ]);
    }

    // 建構近期活動摘要
    if (lifeRecords.length > 0) {
      const activities = lifeRecords.slice(0, 4).map((r) => {
        const items = [];
        if (r.food) items.push({ time: r.date, event: r.food.split('；')[0], type: 'food' });
        if (r.activity) items.push({ time: r.date, event: r.activity, type: 'activity' });
        if (r.drug) items.push({ time: r.date, event: r.drug, type: 'drug' });
        if (r.emotion) items.push({ time: r.date, event: `情緒：${r.emotion}`, type: 'emotion' });
        return items;
      }).flat().slice(0, 8);
      setRecentActivities(activities);
    }
  };

  const stats = elderData?.memory?.weekly_stats || {};

  return (
    <div className="space-y-6">
      {/* 頂部：標題 + 長者選擇器 */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">照護者面板</h2>
        <div className="flex items-center gap-4">
          <ElderSelector
            selectedElderId={elderId}
            onSelect={setElderId}
            showDetails
          />
          <div className="text-sm text-gray-500">
            最後更新：{new Date().toLocaleDateString('zh-TW')}
          </div>
        </div>
      </div>

      {/* 長者快速資訊 */}
      {elderData?.profile && (
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-4 border border-primary-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary-500 rounded-full flex items-center justify-center">
              <span className="text-white text-lg font-bold">
                {elderData.profile.name[0]}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">
                {elderData.profile.name}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {elderData.profile.age}歲 ・ {elderData.profile.gender} ・
                  {elderData.profile.language === 'nan-TW' ? '台語' : '國語'}
                </span>
              </h3>
              <p className="text-sm text-gray-600">
                {elderData.profile.diseases?.join('、')} ・ {elderData.profile.address}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={MessageCircle}
          label="本週對話次數"
          value={stats.conversations || 0}
          unit="次"
          color="bg-primary-500"
        />
        <StatCard
          icon={Moon}
          label="平均睡眠"
          value={stats.avg_sleep || 0}
          unit="小時"
          color="bg-indigo-500"
        />
        <StatCard
          icon={Utensils}
          label="正餐完成率"
          value={stats.meal_completion || 0}
          unit="%"
          color="bg-amber-500"
        />
        <StatCard
          icon={Heart}
          label="情緒指數"
          value={stats.emotion_score || 0}
          unit="/10"
          color="bg-rose-500"
        />
      </div>

      {/* 圖表區域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 互動趨勢 */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">每日互動趨勢</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={weeklyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="conversations"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', strokeWidth: 2 }}
                name="對話次數"
              />
              <Line
                type="monotone"
                dataKey="emotion_score"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', strokeWidth: 2 }}
                name="情緒分數"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 情緒分佈 */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">情緒分佈</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={emotionData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
              >
                {emotionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 睡眠趨勢 */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">睡眠時數</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weeklyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} domain={[0, 10]} />
              <Tooltip />
              <Bar dataKey="sleep_hours" fill="#6366f1" radius={[4, 4, 0, 0]} name="睡眠時數" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 飲食統計 */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">本週飲食紀錄</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={foodData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" stroke="#6b7280" fontSize={12} />
              <YAxis type="category" dataKey="meal" stroke="#6b7280" fontSize={12} width={80} />
              <Tooltip />
              <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} name="次數" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI 每日摘要 */}
      {elderData?.memory?.recent_summary && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity size={20} className="text-primary-600" />
            AI 每日摘要（近 7 天）
          </h3>
          <div className="space-y-3">
            {elderData.memory.recent_summary.map((item, idx) => (
              <div key={idx} className="flex gap-4 py-3 border-b border-gray-50 last:border-0">
                <div className="flex-shrink-0 text-center">
                  <p className="text-xs text-gray-400">{item.date}</p>
                  <p className="text-sm font-medium text-primary-600">{item.conversation_count} 次對話</p>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{item.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 近期活動紀錄 */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">近期生活紀錄</h3>
        <div className="space-y-3">
          {recentActivities.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <div className={`w-2 h-2 rounded-full ${
                item.type === 'food' ? 'bg-amber-500' :
                item.type === 'activity' ? 'bg-primary-500' :
                item.type === 'drug' ? 'bg-indigo-500' :
                'bg-rose-500'
              }`} />
              <span className="text-xs text-gray-400 w-24 flex-shrink-0">{item.time}</span>
              <span className="text-sm text-gray-700">{item.event}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 所有長者總覽 */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-500" />
          全部長者狀態總覽
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 text-gray-500 font-medium">姓名</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">年齡</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">語言</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">本週對話</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">情緒指數</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">健康狀況</th>
              </tr>
            </thead>
            <tbody>
              {ELDER_PROFILES.map((elder) => {
                const mem = ELDER_MEMORIES[elder.elder_id];
                const ws = mem?.weekly_stats || {};
                return (
                  <tr
                    key={elder.elder_id}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${
                      elder.elder_id === elderId ? 'bg-primary-50' : ''
                    }`}
                    onClick={() => setElderId(elder.elder_id)}
                  >
                    <td className="py-2 px-3 font-medium text-gray-800">{elder.name}</td>
                    <td className="py-2 px-3 text-gray-600">{elder.age}歲</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        elder.language === 'nan-TW' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {elder.language === 'nan-TW' ? '台語' : '國語'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-600">{ws.conversations || '-'} 次</td>
                    <td className="py-2 px-3">
                      <span className={`font-medium ${
                        (ws.emotion_score || 0) >= 7 ? 'text-green-600' :
                        (ws.emotion_score || 0) >= 5 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {ws.emotion_score || '-'}/10
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1">
                        {elder.diseases.slice(0, 2).map((d, i) => (
                          <span key={i} className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-xs">
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 工具函數：根據情緒文字推估分數
function _getEmotionScore(emotionText) {
  if (!emotionText) return 5;
  const positiveWords = ['開心', '愉快', '好', '棒', '舒服', '滿足', '精神', '成就'];
  const negativeWords = ['低落', '難過', '焦慮', '擔心', '沮喪', '不適', '痛', '煩', '孤單', '迷糊'];

  let score = 6;
  if (positiveWords.some((w) => emotionText.includes(w))) score += 2;
  if (emotionText.includes('非常')) score += 1;
  if (negativeWords.some((w) => emotionText.includes(w))) score -= 2;
  return Math.max(1, Math.min(10, score));
}

export default Dashboard;
