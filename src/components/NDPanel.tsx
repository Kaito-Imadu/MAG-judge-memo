import type { Apparatus } from '../types';
import { getNDChecklist } from '../constants/deductions';

interface Props {
  apparatus: Apparatus;
  checked: Set<string>;
  onToggle: (label: string) => void;
}

export default function NDPanel({ apparatus, checked, onToggle }: Props) {
  const items = getNDChecklist(apparatus);

  if (items.length === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
      <div className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2">ND チェック</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <label
            key={item.label}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer select-none transition-colors ${
              checked.has(item.label)
                ? 'bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            <input
              type="checkbox"
              checked={checked.has(item.label)}
              onChange={() => onToggle(item.label)}
              className="w-4 h-4 accent-amber-600"
            />
            {item.label}
          </label>
        ))}
      </div>
    </div>
  );
}
