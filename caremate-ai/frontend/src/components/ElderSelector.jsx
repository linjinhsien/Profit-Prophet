import React from 'react';
import { Users } from 'lucide-react';
import { ELDER_PROFILES } from '../data/mockElders';

/**
 * 長者選擇器組件
 * 用於各頁面切換不同長者的資料
 */
function ElderSelector({ selectedElderId, onSelect, showDetails = false }) {
  const selectedElder = ELDER_PROFILES.find((e) => e.elder_id === selectedElderId);

  return (
    <div className="flex items-center gap-3">
      <Users size={18} className="text-gray-500" />
      <select
        value={selectedElderId}
        onChange={(e) => onSelect(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent min-w-[160px]"
        aria-label="選擇長者"
      >
        {ELDER_PROFILES.map((elder) => (
          <option key={elder.elder_id} value={elder.elder_id}>
            {elder.name}（{elder.age}歲，{elder.gender}）
          </option>
        ))}
      </select>
      {showDetails && selectedElder && (
        <span className="text-xs text-gray-500">
          {selectedElder.address} ・ {selectedElder.language === 'nan-TW' ? '台語' : '國語'}
        </span>
      )}
    </div>
  );
}

export default ElderSelector;
