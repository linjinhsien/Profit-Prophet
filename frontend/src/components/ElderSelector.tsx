// @ts-nocheck
import { ELDER_PROFILES } from '../data/mockElders';

interface ElderItem {
  elder_id: string;
  name: string;
  age: number;
}

interface ElderSelectorProps {
  elderId: string;
  onElderChange: (id: string) => void;
  compact?: boolean;
  elders?: ElderItem[];
}

export default function ElderSelector({ elderId, onElderChange, compact, elders }: ElderSelectorProps) {
  const list = elders && elders.length > 0 ? elders : ELDER_PROFILES;

  return (
    <select
      value={elderId}
      onChange={(e) => onElderChange(e.target.value)}
      className={compact 
        ? "rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white"
        : "rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white w-full max-w-xs"
      }
    >
      {list.map((elder) => (
        <option key={elder.elder_id} value={elder.elder_id}>
          {elder.name}（{elder.age}歲）
        </option>
      ))}
    </select>
  );
}
