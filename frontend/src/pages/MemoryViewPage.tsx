// @ts-nocheck
import React, { useState } from 'react';
import { Brain, Clock, MessageCircle, Heart, Utensils, Moon, Activity } from 'lucide-react';
import ElderSelector from '../components/ElderSelector';
import {
  getElderById,
  ELDER_MEMORIES,
  ELDER_LIFE_RECORDS,
} from '../data/mockElders';

export function MemoryViewPage({ elderId, onElderChange }: { elderId: string; onElderChange: (id: string) => void }) {
  
  const elder = getElderById(elderId);
  const memory = ELDER_MEMORIES[elderId];
  const lifeRecords = ELDER_LIFE_RECORDS[elderId] || [];

  if (!elder) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">找不到長者資料</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 頂部 */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Brain size={28} className="text-primary-600" />
          <h2 className="text-2xl font-bold text-gray-800">長期記憶系統</h2>
        </div>
        <ElderSelector selectedElderId={elderId} onSelect={onElderChange} />
      </div>

      <p className="text-gray-500">
        系統自動從對話中整理長者的重要資訊，並在每次對話前載入，提供個人化的陪伴體驗。
        目前顯示：<span className="font-medium text-gray-700">{elder.name}</span> 的記憶資料。
      </p>

      {/* 個人偏好 */}
      <MemorySection title="個人偏好" color="bg-primary-50 border-primary-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MemoryItem label="喜愛食物" value={elder.preferences.favorite_food} />
          <MemoryItem label="喜愛話題" value={elder.preferences.favorite_topics?.join('、')} />
          <MemoryItem label="不喜歡的事" value={elder.preferences.dislike} />
          <MemoryItem label="語言偏好" value={elder.preferences.preferred_language} />
          <MemoryItem label="起床時間" value={elder.preferences.wake_time} />
          <MemoryItem label="就寢時間" value={elder.preferences.sleep_time} />
        </div>
      </MemorySection>

      {/* 家庭資訊 */}
      <MemorySection title="家庭資訊" color="bg-amber-50 border-amber-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MemoryItem label="子女" value={elder.family_info.children} />
          <MemoryItem label="孫輩" value={elder.family_info.grandchildren} />
          <MemoryItem label="配偶" value={elder.family_info.spouse} />
          <MemoryItem label="常探訪者" value={elder.family_info.frequent_visitor} />
        </div>
      </MemorySection>

      {/* 健康資訊 */}
      <MemorySection title="健康資訊" color="bg-rose-50 border-rose-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="text-sm text-gray-500">健康狀況</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {elder.diseases.map((c, i) => (
                <span key={i} className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-sm">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-500">用藥</p>
            <ul className="mt-1 space-y-0.5">
              {elder.medications.map((m, i) => (
                <li key={i} className="text-sm text-gray-700">• {m}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm text-gray-500">過敏</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {elder.allergies.map((a, i) => (
                <span key={i} className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-sm">
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      </MemorySection>

      {/* 近七天 AI 摘要 */}
      {memory && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Clock size={20} className="text-gray-500" />
            近期 AI 對話摘要（每日自動生成）
          </h3>
          <div className="space-y-4">
            {memory.recent_summary.map((item, idx) => (
              <div key={idx} className="flex gap-4 pb-4 border-b border-gray-100 last:border-0">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <MessageCircle size={18} className="text-gray-500" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-gray-400">{item.date}</p>
                    <span className="text-xs bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded">
                      {item.conversation_count} 次對話
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{item.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 詳細生活紀錄 */}
      {lifeRecords.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Activity size={20} className="text-primary-600" />
            詳細生活紀錄（AI 自動擷取）
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">日期</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">
                    <span className="flex items-center gap-1"><Moon size={12} />睡眠</span>
                  </th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">
                    <span className="flex items-center gap-1"><Utensils size={12} />飲食</span>
                  </th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">
                    <span className="flex items-center gap-1"><Activity size={12} />活動</span>
                  </th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">用藥</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">
                    <span className="flex items-center gap-1"><Heart size={12} />情緒</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lifeRecords.map((record, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-2 text-gray-600 whitespace-nowrap">{record.date}</td>
                    <td className="py-2 px-2 text-gray-700">{record.sleep}</td>
                    <td className="py-2 px-2 text-gray-700 max-w-[200px] truncate" title={record.food}>{record.food}</td>
                    <td className="py-2 px-2 text-gray-700">{record.activity}</td>
                    <td className="py-2 px-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        record.drug.includes('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {record.drug}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        _getEmotionColor(record.emotion)
                      }`}>
                        {record.emotion}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MemorySection({ title, color, children }) {
  return (
    <div className={`card border ${color}`}>
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function MemoryItem({ label, value }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value || '—'}</p>
    </div>
  );
}

function _getEmotionColor(emotion) {
  if (!emotion) return 'bg-gray-50 text-gray-600';
  const positive = ['開心', '愉快', '好', '精神', '放心', '成就', '舒適'];
  const negative = ['低落', '焦慮', '擔心', '不適', '沮喪', '悶', '迷糊', '痛'];
  if (positive.some((w) => emotion.includes(w))) return 'bg-green-50 text-green-700';
  if (negative.some((w) => emotion.includes(w))) return 'bg-red-50 text-red-700';
  return 'bg-blue-50 text-blue-700';
}

