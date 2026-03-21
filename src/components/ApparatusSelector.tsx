import { APPARATUS_LIST } from '../constants/apparatus';
import type { Apparatus } from '../types';

interface Props {
  current: Apparatus;
  onSelect: (apparatus: Apparatus) => void;
}

export default function ApparatusSelector({ current, onSelect }: Props) {
  return (
    <div className="flex gap-1">
      {APPARATUS_LIST.map((a) => (
        <button
          key={a.code}
          onClick={() => onSelect(a.code)}
          className={`px-4 py-2 min-h-[44px] rounded font-semibold text-sm transition-colors ${
            current === a.code
              ? 'bg-primary text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'
          }`}
        >
          {a.code}
        </button>
      ))}
    </div>
  );
}
