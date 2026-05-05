import { useState } from 'react';
import { loadJudgeSettings, saveJudgeSettings } from '../utils/settings';
import type { JudgeSettings } from '../utils/settings';

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<JudgeSettings>(() => loadJudgeSettings());

  const update = (patch: Partial<JudgeSettings>) => {
    setSettings(prev => saveJudgeSettings({ ...prev, ...patch }));
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">設定</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="設定を閉じる"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          <label className="block">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-200">文字の太さ</span>
              <span className="text-sm font-mono text-gray-500">{settings.penWidth.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="6"
              step="0.5"
              value={settings.penWidth}
              onChange={e => update({ penWidth: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
          </label>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-gray-700 dark:text-gray-200">横線を最初から入れる</div>
              <div className="text-xs text-gray-500 mt-1">新しい採点用紙を開いた時に1本追加します。</div>
            </div>
            <button
              onClick={() => update({ autoHorizontalLine: !settings.autoHorizontalLine })}
              className={`w-16 h-9 rounded-full p-1 transition-colors shrink-0 ${
                settings.autoHorizontalLine ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'
              }`}
              aria-pressed={settings.autoHorizontalLine}
            >
              <span
                className={`block w-7 h-7 rounded-full bg-white shadow transition-transform ${
                  settings.autoHorizontalLine ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <label className="block">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-200">横線の長さ</span>
              <span className="text-sm font-mono text-gray-500">
                {Math.round(settings.horizontalLineLengthRatio * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              value={settings.horizontalLineLengthRatio}
              onChange={e => update({ horizontalLineLengthRatio: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
          </label>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 min-h-[44px] rounded-lg bg-primary text-white font-bold"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
