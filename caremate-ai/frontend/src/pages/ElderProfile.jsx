import React, { useState } from 'react';
import { User, Phone, MapPin, Heart, AlertCircle, Pill, Clock, Star } from 'lucide-react';
import ElderSelector from '../components/ElderSelector';
import { ELDER_PROFILES, getElderById } from '../data/mockElders';

function ElderProfile() {
  const [elderId, setElderId] = useState('elder-001');
  const profile = getElderById(elderId);

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">找不到長者資料</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 頂部：標題 + 長者選擇器 */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">長者基本資料</h2>
        <ElderSelector selectedElderId={elderId} onSelect={setElderId} />
      </div>

      {/* 基本資訊 */}
      <div className="card">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 bg-primary-100 rounded-2xl flex items-center justify-center">
            <User size={36} className="text-primary-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-800">{profile.name}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <InfoItem label="年齡" value={`${profile.age} 歲`} />
              <InfoItem label="性別" value={profile.gender} />
              <InfoItem label="慣用語言" value={profile.language === 'nan-TW' ? '台語' : '國語'} />
              <InfoItem label="居住地" value={profile.address} icon={MapPin} />
              <InfoItem label="電話" value={profile.phone} icon={Phone} />
              <InfoItem label="編號" value={profile.elder_id} />
            </div>
          </div>
        </div>
      </div>

      {/* 緊急聯絡人 */}
      <div className="card border-l-4 border-l-red-400">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <AlertCircle size={20} className="text-red-500" />
          緊急聯絡人
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoItem label="聯絡人" value={profile.emergency_contact} />
          <InfoItem label="電話" value={profile.emergency_phone} icon={Phone} />
        </div>
      </div>

      {/* 健康資訊 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Heart size={20} className="text-rose-500" />
          健康資訊
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2">疾病史</p>
            <div className="flex flex-wrap gap-2">
              {profile.diseases.map((disease, idx) => (
                <span key={idx} className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-sm">
                  {disease}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2">用藥紀錄</p>
            <ul className="space-y-1">
              {profile.medications.map((med, idx) => (
                <li key={idx} className="text-sm text-gray-700 flex items-center gap-2">
                  <Pill size={14} className="text-indigo-500" />
                  {med}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 mb-2">過敏資訊</p>
            <div className="flex flex-wrap gap-2">
              {profile.allergies.map((allergy, idx) => (
                <span key={idx} className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-sm">
                  {allergy}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 生活偏好 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Star size={20} className="text-amber-500" />
          生活偏好
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoItem label="起床時間" value={profile.preferences.wake_time} icon={Clock} />
          <InfoItem label="就寢時間" value={profile.preferences.sleep_time} icon={Clock} />
          <InfoItem label="語言偏好" value={profile.preferences.preferred_language} />
          <InfoItem label="喜愛食物" value={profile.preferences.favorite_food} />
          <InfoItem label="不喜歡" value={profile.preferences.dislike} />
          <div>
            <p className="text-sm text-gray-500">喜愛話題</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {profile.preferences.favorite_topics.map((topic, idx) => (
                <span key={idx} className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded text-sm">
                  {topic}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 家庭資訊 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">家庭資訊</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoItem label="子女" value={profile.family_info.children} />
          <InfoItem label="孫輩" value={profile.family_info.grandchildren} />
          <InfoItem label="配偶" value={profile.family_info.spouse} />
          <InfoItem label="常探訪者" value={profile.family_info.frequent_visitor} />
        </div>
      </div>

      {/* 全部長者列表 */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">全部長者列表（{ELDER_PROFILES.length} 位）</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ELDER_PROFILES.map((elder) => (
            <button
              key={elder.elder_id}
              onClick={() => setElderId(elder.elder_id)}
              className={`text-left p-3 rounded-lg border transition-all ${
                elder.elder_id === elderId
                  ? 'border-primary-300 bg-primary-50 shadow-sm'
                  : 'border-gray-200 hover:border-primary-200 hover:bg-gray-50'
              }`}
            >
              <p className="font-medium text-gray-800">{elder.name}</p>
              <p className="text-xs text-gray-500 mt-1">
                {elder.age}歲 ・ {elder.gender} ・ {elder.language === 'nan-TW' ? '台語' : '國語'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{elder.address}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {elder.diseases.slice(0, 2).map((d, i) => (
                  <span key={i} className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-xs">
                    {d}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon size={14} className="text-gray-400" />}
      <span className="text-sm text-gray-500">{label}：</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  );
}

export default ElderProfile;
