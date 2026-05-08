import { useEffect, useRef, useState } from 'react';

interface Props {
  initial: number | undefined;
  label: string;
  min?: number;            // 範囲下限（含む）。デフォルト 0
  max?: number;            // 範囲上限（含む）。指定時は超過した値はOK時に却下
  onConfirm: (value: number | undefined) => void;
  onCancel: () => void;
}

// 数字テンキー: タップで値を組み立て、OK で確定。次セルへの自動遷移はしない（1セルずつ確定）。
// 文字列で保持して "8.", ".5" のような途中入力を許す。
export default function ScoreNumpad({ initial, label, min = 0, max, onConfirm, onCancel }: Props) {
  const [text, setText] = useState<string>(initial !== undefined ? String(initial) : '');
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter') confirm();
      else if (e.key === 'Backspace') backspace();
      else if (e.key === '.' || /^[0-9]$/.test(e.key)) press(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const press = (ch: string) => {
    setError(null);
    setText(prev => {
      if (ch === '.' && prev.includes('.')) return prev;
      if (ch === '.' && prev === '') return '0.';
      // 整数部は1〜2桁に抑える（10.0 まで対応）
      if (!prev.includes('.') && prev.length >= 2 && ch !== '.') return prev;
      // 小数部は3桁まで
      if (prev.includes('.')) {
        const decLen = prev.length - prev.indexOf('.') - 1;
        if (decLen >= 3 && ch !== '.') return prev;
      }
      return prev + ch;
    });
  };
  const backspace = () => { setError(null); setText(prev => prev.slice(0, -1)); };
  const clear = () => { setError(null); setText(''); };

  const parseValue = (): number | undefined => {
    if (text === '') return undefined;
    const n = Number(text);
    return Number.isFinite(n) ? n : undefined;
  };

  const confirm = () => {
    const v = parseValue();
    if (typeof v === 'number') {
      if (v < min || (typeof max === 'number' && v > max)) {
        setError(`${min}〜${max ?? '∞'} の範囲で入力してください`);
        return;
      }
    }
    onConfirm(v);
  };

  const onBgClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onCancel();
  };

  return (
    <div
      ref={overlayRef}
      onClick={onBgClick}
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center"
      style={{ touchAction: 'manipulation' }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 w-72 max-w-[90vw]">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          {label}
          {typeof max === 'number' && (
            <span className="ml-2 text-gray-400">({min}〜{max})</span>
          )}
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
          <button onClick={onCancel}
            className="h-14 rounded-lg bg-gray-300 dark:bg-gray-500 text-sm font-bold text-gray-800 dark:text-gray-100 active:scale-95">
            キャンセル
          </button>
          <button onClick={() => press('0')}
            className="h-14 rounded-lg bg-gray-100 dark:bg-gray-700 text-2xl font-bold text-gray-800 dark:text-gray-100 active:scale-95 hover:bg-gray-200 dark:hover:bg-gray-600 col-span-2">
            0
          </button>
          <button onClick={() => press('.')}
            className="h-14 rounded-lg bg-gray-100 dark:bg-gray-700 text-2xl font-bold text-gray-800 dark:text-gray-100 active:scale-95 hover:bg-gray-200 dark:hover:bg-gray-600">
            .
          </button>
          <button onClick={confirm}
            className="h-14 rounded-lg bg-accent text-white text-base font-bold active:scale-95">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
