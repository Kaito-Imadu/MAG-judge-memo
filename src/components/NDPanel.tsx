import type { Apparatus } from '../types';
import { getNDChecklist } from '../constants/deductions';
import MiniCanvas from './MiniCanvas';

interface Props {
  apparatus: Apparatus;
  open: boolean;
  onToggle: () => void;
}

export default function NDPanel({ apparatus, open, onToggle }: Props) {
  const items = getNDChecklist(apparatus);
  if (items.length === 0) return null;

  return (
    <>
      {/* タブ */}
      <button
        onClick={onToggle}
        className={`absolute right-0 top-1/4 z-20 px-1.5 py-4 rounded-l-lg text-xs font-bold shadow-lg select-none ${
          open ? 'bg-amber-500 text-white' : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
        }`}
        style={{ writingMode: 'vertical-rl', touchAction: 'manipulation' }}
      >
        ND
      </button>

      {/* パネル */}
      <div
        className={`absolute right-0 top-0 bottom-0 z-10 w-56 bg-amber-50/95 dark:bg-gray-800/95
                    backdrop-blur border-l border-amber-200 dark:border-amber-800 shadow-xl
                    transition-transform duration-200 ease-out flex flex-col select-none
                    ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
      >
        <div className="px-3 pt-3 pb-1 text-xs font-bold text-amber-700 dark:text-amber-400">
          ND チェック
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded p-1.5">
              <MiniCanvas width={44} height={36} label="" />
              <span className="text-xs text-gray-700 dark:text-gray-300 leading-tight select-none pointer-events-none">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
