import { useState } from 'react';
import type { DigitalScores, Apparatus } from '../types';
import { calcEFinal, calcFinal, formatScore, formatNatural, eFinalDecimals, FINAL_SCORE_DECIMALS } from '../utils/scoreCalc';
import ScoreNumpad from './ScoreNumpad';

interface Props {
  value: DigitalScores;
  eJudgeCount: number;
  apparatus?: Apparatus;
  onChange: (next: DigitalScores) => void;
}

type CellKind = 'd' | 'nd' | 'eFinal' | 'final' | 'e';
interface Editing { kind: CellKind; index?: number; }

// 上段: E1..EN
// 下段: D / E決定 / ND / 加点 / 決定点
// セルタップ → ScoreNumpad ポップアップ。E決定/決定点は自動計算（手動上書き可）。
export default function ScoreInputBar({ value, eJudgeCount, apparatus, onChange }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);

  // あん馬は加点 +0.1 を扱わない
  const bonusDisabled = apparatus === 'PH';

  // eJudgeCount=0 のときは E1..EN 行を非表示（個別モード用: E決定を直接入力する想定）
  const showEJudges = eJudgeCount > 0;
  const directEFinalInput = !showEJudges;
  // E配列を必ず eJudgeCount に揃える（人数変更後の安全策）
  const eArr = (() => {
    const arr = value.e.slice(0, eJudgeCount);
    while (arr.length < eJudgeCount) arr.push(undefined);
    return arr;
  })();
  const normalized: DigitalScores = {
    ...value,
    e: eArr,
    // PH では bonus を計算に反映させない
    bonus: bonusDisabled ? false : value.bonus,
  };

  const eAuto = calcEFinal(eArr);
  const eFinalDisplay = typeof normalized.eFinalManual === 'number' ? normalized.eFinalManual : eAuto;
  const finalAuto = calcFinal(normalized, apparatus);
  const finalDisplay = finalAuto;

  const cellKey = (c: Editing) => `${c.kind}:${c.index ?? ''}`;

  // 入力範囲: Eスコアは 0〜10、それ以外は 0以上のみ
  const cellRange = (c: Editing): { min: number; max?: number } => {
    if (c.kind === 'e' || c.kind === 'eFinal') return { min: 0, max: 10 };
    return { min: 0 };
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
    if (c.kind === 'eFinal') return directEFinalInput ? 'E決定' : 'E決定（手動上書き）';
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

  // テンキーから値が変わるたびに親state へ反映（自動保存）。OK は押さなくて良い。
  const onLiveChange = (v: number | undefined) => {
    if (!editing) return;
    const next = applyValue(editing, v);
    onChange(next);
  };

  const toggleBonus = () => {
    onChange({ ...normalized, bonus: !normalized.bonus });
  };

  const cellBase = 'flex flex-col items-center justify-center border-r border-[#020617] last:border-r-0 px-1 select-none';
  const labelClass = 'text-[10px] text-slate-300 leading-none mb-0.5';
  const valueClass = 'text-base font-mono font-semibold text-white leading-tight';
  const placeholderClass = 'text-base font-mono text-slate-500 leading-tight';

  const renderInputCell = (c: Editing, content: React.ReactNode, extra = '') => (
    <button
      key={cellKey(c)}
      onClick={() => setEditing(c)}
      className={`${cellBase} ${extra} h-full hover:bg-white/10 active:bg-white/15 transition-colors`}
      style={{ touchAction: 'manipulation' }}
    >
      <span className={labelClass}>{cellLabel(c).split('（')[0]}</span>
      {content}
    </button>
  );

  // E決定/決定点の表示桁数（1〜3人=2桁、4人以上=3桁）
  const decimals = eFinalDecimals(eArr);

  return (
    <>
      <div className="border-t border-[#020617] bg-[#0f172a] dark:bg-[#020617] shrink-0 shadow-[0_-1px_0_rgba(255,255,255,0.04)]">
        {/* 上段: E1..EN（少し厚め） — eJudgeCount=0 のときは非表示 */}
        {showEJudges && (
          <div className="flex h-12 border-b border-[#020617]">
            {eArr.map((v, i) => renderInputCell(
              { kind: 'e', index: i },
              v !== undefined
                ? <span className={valueClass}>{formatNatural(v, 3)}</span>
                : <span className={placeholderClass}>―</span>,
              'flex-1',
            ))}
          </div>
        )}

        {/* 下段: D / E決定 / ND / 加点 / 決定点（少し厚め） */}
        <div className={`flex h-14 ${showEJudges ? 'border-t border-[#020617]' : ''}`}>
          {renderInputCell(
            { kind: 'd' },
            normalized.d !== undefined
              ? <span className={valueClass}>{formatScore(normalized.d, 1)}</span>
              : <span className={placeholderClass}>―</span>,
            bonusDisabled ? 'w-[18%]' : 'w-[14%]',
          )}
          {renderInputCell(
            { kind: 'eFinal' },
            eFinalDisplay !== undefined
              ? <span className={`${valueClass} ${showEJudges && typeof normalized.eFinalManual === 'number' ? 'text-accent' : ''}`}>{formatScore(eFinalDisplay, decimals)}</span>
              : <span className={placeholderClass}>―</span>,
            bonusDisabled ? 'w-[24%]' : 'w-[18%]',
          )}
          {renderInputCell(
            { kind: 'nd' },
            normalized.nd !== undefined
              ? <span className={valueClass}>{formatScore(normalized.nd, 1)}</span>
              : <span className={placeholderClass}>―</span>,
            bonusDisabled ? 'w-[16%]' : 'w-[12%]',
          )}
          {/* 加点トグル（あん馬では非表示） */}
          {!bonusDisabled && (
            <button
              onClick={toggleBonus}
              className={`${cellBase} w-[16%] h-full transition-colors ${
                normalized.bonus
                  ? 'bg-success/20 hover:bg-success/25'
                  : 'hover:bg-white/10'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              <span className={labelClass}>加点</span>
              <span className={`text-base font-mono font-semibold leading-tight ${
                normalized.bonus
                  ? 'text-success'
                  : 'text-gray-500'
              }`}>
                {normalized.bonus ? '+0.1' : 'OFF'}
              </span>
            </button>
          )}
          {renderInputCell(
            { kind: 'final' },
            (typeof normalized.finalManual === 'number' || finalDisplay !== undefined)
              ? <span className={`text-lg font-mono font-bold leading-tight ${typeof normalized.finalManual === 'number' ? 'text-accent' : 'text-sky-300'}`}>{formatScore(finalDisplay, FINAL_SCORE_DECIMALS)}</span>
              : <span className={placeholderClass}>―</span>,
            'flex-1',
          )}
        </div>
      </div>

      {editing && (
        <ScoreNumpad
          initial={cellValue(editing)}
          label={cellLabel(editing)}
          min={cellRange(editing).min}
          max={cellRange(editing).max}
          onChange={onLiveChange}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
