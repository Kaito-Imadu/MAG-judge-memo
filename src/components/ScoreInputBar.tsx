import { useState } from 'react';
import type { DigitalScores } from '../types';
import { calcEFinal, calcFinal, formatScore } from '../utils/scoreCalc';
import ScoreNumpad from './ScoreNumpad';

interface Props {
  value: DigitalScores;
  eJudgeCount: number;
  onChange: (next: DigitalScores) => void;
}

type CellKind = 'd' | 'nd' | 'eFinal' | 'final' | 'e';
interface Editing { kind: CellKind; index?: number; }

// 上段: E1..EN
// 下段: D / E決定 / ND / 加点 / 決定点
// セルタップ → ScoreNumpad ポップアップ。E決定/決定点は自動計算（手動上書き可）。
export default function ScoreInputBar({ value, eJudgeCount, onChange }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);

  // E配列を必ず eJudgeCount に揃える（人数変更後の安全策）
  const eArr = (() => {
    const arr = value.e.slice(0, eJudgeCount);
    while (arr.length < eJudgeCount) arr.push(undefined);
    return arr;
  })();
  const normalized: DigitalScores = { ...value, e: eArr };

  const eAuto = calcEFinal(eArr);
  const eFinalDisplay = typeof normalized.eFinalManual === 'number' ? normalized.eFinalManual : eAuto;
  const finalAuto = calcFinal(normalized);
  const finalDisplay = finalAuto;

  const cells: Editing[] = [
    ...eArr.map((_, i) => ({ kind: 'e' as CellKind, index: i })),
    { kind: 'd' },
    { kind: 'eFinal' },
    { kind: 'nd' },
    { kind: 'final' },
  ];

  const cellKey = (c: Editing) => `${c.kind}:${c.index ?? ''}`;
  const isSame = (a: Editing, b: Editing) => a.kind === b.kind && a.index === b.index;

  const findNextEditable = (current: Editing): Editing | null => {
    const idx = cells.findIndex(c => isSame(c, current));
    if (idx < 0) return null;
    for (let i = idx + 1; i < cells.length; i++) {
      // 加点はトグルなのでスキップ。E決定・決定点も普通はスキップ（自動）
      if (cells[i].kind === 'eFinal' || cells[i].kind === 'final') continue;
      return cells[i];
    }
    return null;
  };

  const cellValue = (c: Editing): number | undefined => {
    if (c.kind === 'e') return c.index !== undefined ? eArr[c.index] : undefined;
    if (c.kind === 'd') return normalized.d;
    if (c.kind === 'nd') return normalized.nd;
    if (c.kind === 'eFinal') return normalized.eFinalManual;
    if (c.kind === 'final') return normalized.finalManual;
    return undefined;
  };

  const cellLabel = (c: Editing): string => {
    if (c.kind === 'e') return `E${(c.index ?? 0) + 1}`;
    if (c.kind === 'd') return 'D';
    if (c.kind === 'nd') return 'ND';
    if (c.kind === 'eFinal') return 'E決定（手動上書き）';
    if (c.kind === 'final') return '決定点（手動上書き）';
    return '';
  };

  const applyValue = (c: Editing, v: number | undefined): DigitalScores => {
    const next: DigitalScores = { ...normalized, e: [...eArr] };
    if (c.kind === 'e' && c.index !== undefined) next.e[c.index] = v;
    else if (c.kind === 'd') next.d = v;
    else if (c.kind === 'nd') next.nd = v;
    else if (c.kind === 'eFinal') next.eFinalManual = v;
    else if (c.kind === 'final') next.finalManual = v;
    return next;
  };

  const onConfirm = (v: number | undefined, advance: boolean) => {
    if (!editing) return;
    const next = applyValue(editing, v);
    onChange(next);
    if (advance) {
      const nx = findNextEditable(editing);
      setEditing(nx);
    } else {
      setEditing(null);
    }
  };

  const toggleBonus = () => {
    onChange({ ...normalized, bonus: !normalized.bonus });
  };

  const cellBase = 'flex flex-col items-center justify-center border-r border-gray-300 dark:border-gray-700 last:border-r-0 px-1 select-none';
  const labelClass = 'text-[9px] text-gray-500 dark:text-gray-400 leading-none';
  const valueClass = 'text-sm font-mono font-semibold text-gray-900 dark:text-gray-100 leading-tight';
  const placeholderClass = 'text-sm font-mono text-gray-300 dark:text-gray-600 leading-tight';

  const renderInputCell = (c: Editing, content: React.ReactNode, extra = '') => (
    <button
      key={cellKey(c)}
      onClick={() => setEditing(c)}
      className={`${cellBase} ${extra} h-full hover:bg-accent/5 active:bg-accent/10 transition-colors`}
      style={{ touchAction: 'manipulation' }}
    >
      <span className={labelClass}>{cellLabel(c).split('（')[0]}</span>
      {content}
    </button>
  );

  return (
    <>
      <div className="border-t border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        {/* 上段: E1..EN */}
        <div className="flex h-9" style={{ borderBottom: '1px solid var(--tw-color-gray-300, #d1d5db)' }}>
          {eArr.map((v, i) => renderInputCell(
            { kind: 'e', index: i },
            v !== undefined
              ? <span className={valueClass}>{formatScore(v, 1)}</span>
              : <span className={placeholderClass}>―</span>,
            'flex-1',
          ))}
        </div>

        {/* 下段: D / E決定 / ND / 加点 / 決定点 */}
        <div className="flex h-10 border-t border-gray-300 dark:border-gray-700">
          {renderInputCell(
            { kind: 'd' },
            normalized.d !== undefined
              ? <span className={valueClass}>{formatScore(normalized.d, 1)}</span>
              : <span className={placeholderClass}>―</span>,
            'w-[14%]',
          )}
          {renderInputCell(
            { kind: 'eFinal' },
            eFinalDisplay !== undefined
              ? <span className={`${valueClass} ${typeof normalized.eFinalManual === 'number' ? 'text-accent' : ''}`}>{formatScore(eFinalDisplay, 3)}</span>
              : <span className={placeholderClass}>―</span>,
            'w-[18%]',
          )}
          {renderInputCell(
            { kind: 'nd' },
            normalized.nd !== undefined
              ? <span className={valueClass}>{formatScore(normalized.nd, 1)}</span>
              : <span className={placeholderClass}>―</span>,
            'w-[12%]',
          )}
          {/* 加点トグル */}
          <button
            onClick={toggleBonus}
            className={`${cellBase} w-[16%] h-full transition-colors ${
              normalized.bonus
                ? 'bg-success/10 hover:bg-success/15'
                : 'hover:bg-accent/5'
            }`}
            style={{ touchAction: 'manipulation' }}
          >
            <span className={labelClass}>加点</span>
            <span className={`text-sm font-mono font-semibold leading-tight ${
              normalized.bonus
                ? 'text-success'
                : 'text-gray-300 dark:text-gray-600'
            }`}>
              {normalized.bonus ? '+0.1' : 'OFF'}
            </span>
          </button>
          {renderInputCell(
            { kind: 'final' },
            (typeof normalized.finalManual === 'number' || finalDisplay !== undefined)
              ? <span className={`text-base font-mono font-bold leading-tight ${typeof normalized.finalManual === 'number' ? 'text-accent' : 'text-primary dark:text-accent'}`}>{formatScore(finalDisplay, 3)}</span>
              : <span className={placeholderClass}>―</span>,
            'flex-1',
          )}
        </div>
      </div>

      {editing && (
        <ScoreNumpad
          initial={cellValue(editing)}
          label={cellLabel(editing)}
          onConfirm={v => onConfirm(v, false)}
          onNext={v => onConfirm(v, true)}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}
