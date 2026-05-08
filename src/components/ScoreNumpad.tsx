import { useEffect, useRef, useState } from 'react';

interface Props {
  initial: number | undefined;
  label: string;
  min?: number;            // 範囲下限（含む）。デフォルト 0
  max?: number;            // 範囲上限（含む）
  onChange: (value: number | undefined) => void;  // 押すたびに値を通知（自動保存）
  onClose: () => void;
}

// 数字テンキー: タップごとに親へ値を反映（保存）。OKボタンは無く、タップ外/閉じるで終了。
// 整数部を1桁押した時点で自動的に小数点を挿入し、「X.」状態にする。
// 10.0 のみ別ボタンで一発入力。
export default function ScoreNumpad({ initial, label, min = 0, max, onChange, onClose }: Props) {
  const [text, setText] = useState<string>(initial !== undefined ? String(initial) : '');
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // text 変化を親に伝搬（範囲外なら親には undefined を渡さず、エラー表示のみ）
  useEffect(() => {
    if (text === '') {
      onChange(undefined);
      setError(null);
      return;
    }
    // "8." のように末尾が小数点の場合は中間状態として親に通知しない
    if (text.endsWith('.')) return;
    const n = Number(text);
    if (!Number.isFinite(n)) return;
    if (n < min || (typeof max === 'number' && n > max)) {
      setError(`${min}〜${max ?? '∞'} の範囲で入力してください`);
      return;
    }
    setError(null);
    onChange(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
      else if (e.key === 'Backspace') backspace();
      else if (/^[0-9]$/.test(e.key)) press(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数字を押した時の処理
  // - 空 → "X." （整数部1桁＋自動小数点）
  // - "X." → "X.Y"
  // - "X.Y" → "X.YZ"
  // - "X.YZ" → "X.YZW"（小数3桁まで）
  // ※ 10 が必要な場合は「10.0」ボタンを使う
  const press = (ch: string) => {
    setText(prev => {
      // 末尾が "." なら小数部に追記
      if (prev.endsWith('.')) {
        return prev + ch;
      }
      // 既に小数部がある場合は末尾に追加（最大3桁）
      if (prev.includes('.')) {
        const decLen = prev.length - prev.indexOf('.') - 1;
        if (decLen >= 3) return prev;
        return prev + ch;
      }
      // 整数のみの状態（通常は空のはず。空なら "X." に。それ以外は無視）
      if (prev === '') {
        return ch + '.';
      }
      // ここに来るのは backspace で "X.X" → "X" になった等、特殊な場合のみ
      return prev + ch;
    });
  };

  // backspace: 1文字削除。"X." → "" にして直前の自動小数点もまとめて消す。
  const backspace = () => {
    setText(prev => {
      if (prev === '') return prev;
      // "X." の状態は1文字ではなく整数＋小数点が両方消える
      if (prev.length === 2 && prev.endsWith('.')) return '';
      return prev.slice(0, -1);
    });
  };

  const clear = () => setText('');

  const setTen = () => setText('10.0');

  const onBgClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={onBgClick}
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center"
      style={{ touchAction: 'manipulation' }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 w-72 max-w-[90vw]">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {label}
            {typeof max === 'number' && (
              <span className="ml-2 text-gray-400">({min}〜{max})</span>
            )}
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg w-8 h-8 flex items-center justify-center">
            ×
          </button>
        </div>
        <div className="bg-gray-100 dark:bg-gray-900 rounded-lg px-4 py-3 mb-2 text-right text-3xl font-mono text-gray-900 dark:text-gray-100 min-h-[60px] flex items-center justify-end">
          {text || <span className="text-gray-400">―</span>}
        </div>
        {error && (
          <div className="text-xs text-danger mb-2">{error}</div>
        )}
        <div className="grid grid-cols-4 gap-2">
          {['7', '8', '9'].map(d => (
            <button key={d} onClick={() => press(d)}
              className="h-14 rounded-lg bg-gray-100 dark:bg-gray-700 text-2xl font-bold text-gray-800 dark:text-gray-100 active:scale-95 hover:bg-gray-200 dark:hover:bg-gray-600">
              {d}
            </button>
          ))}
          <button onClick={backspace}
            className="h-14 rounded-lg bg-gray-200 dark:bg-gray-600 text-xl font-bold text-gray-700 dark:text-gray-200 active:scale-95">
            ⌫
          </button>
          {['4', '5', '6'].map(d => (
            <button key={d} onClick={() => press(d)}
              className="h-14 rounded-lg bg-gray-100 dark:bg-gray-700 text-2xl font-bold text-gray-800 dark:text-gray-100 active:scale-95 hover:bg-gray-200 dark:hover:bg-gray-600">
              {d}
            </button>
          ))}
          <button onClick={clear}
            className="h-14 rounded-lg bg-gray-200 dark:bg-gray-600 text-xs font-bold text-gray-700 dark:text-gray-200 active:scale-95">
            クリア
          </button>
          {['1', '2', '3'].map(d => (
            <button key={d} onClick={() => press(d)}
              className="h-14 rounded-lg bg-gray-100 dark:bg-gray-700 text-2xl font-bold text-gray-800 dark:text-gray-100 active:scale-95 hover:bg-gray-200 dark:hover:bg-gray-600">
              {d}
            </button>
          ))}
          <button onClick={setTen}
            className="h-14 rounded-lg bg-accent/10 text-accent text-sm font-bold active:scale-95 hover:bg-accent/20">
            10.0
          </button>
          <button onClick={() => press('0')}
            className="h-14 rounded-lg bg-gray-100 dark:bg-gray-700 text-2xl font-bold text-gray-800 dark:text-gray-100 active:scale-95 hover:bg-gray-200 dark:hover:bg-gray-600 col-span-3">
            0
          </button>
          <button onClick={onClose}
            className="h-14 rounded-lg bg-accent text-white text-base font-bold active:scale-95">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
