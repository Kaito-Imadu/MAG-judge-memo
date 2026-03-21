import type { Apparatus } from '../types';

interface Props {
  apparatus: Apparatus;
  dScore: string;
  eScores: string[];
  nd: string;
  cv: string;
  onDScoreChange: (v: string) => void;
  onEScoreChange: (index: number, v: string) => void;
  onNDChange: (v: string) => void;
  onCVChange: (v: string) => void;
}

const showCV = (a: Apparatus) => a === 'FX' || a === 'HB';

export default function ScoreBar({
  apparatus,
  dScore, eScores, nd, cv,
  onDScoreChange, onEScoreChange, onNDChange, onCVChange,
}: Props) {
  // 決定点計算
  const d = parseFloat(dScore) || 0;
  const n = parseFloat(nd) || 0;
  const c = parseFloat(cv) || 0;

  // Eスコア: 数値が入っているもの
  const eVals = eScores.map((s) => parseFloat(s)).filter((v) => !isNaN(v));
  let eFinal: number | null = null;
  if (eVals.length > 0) {
    if (eVals.length >= 3) {
      // 最高・最低を除いた平均
      const sorted = [...eVals].sort((a, b) => a - b);
      const trimmed = sorted.slice(1, -1);
      eFinal = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    } else {
      eFinal = eVals.reduce((a, b) => a + b, 0) / eVals.length;
    }
  }

  const finalScore = d > 0 && eFinal !== null
    ? d + eFinal + c - n
    : null;

  return (
    <div className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-3 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
      {/* D */}
      <Field label="D" value={dScore} onChange={onDScoreChange} className="w-16" />

      {/* E scores */}
      {eScores.map((val, i) => (
        <Field
          key={i}
          label={i === 0 ? 'E(自分)' : `E${i + 1}`}
          value={val}
          onChange={(v) => onEScoreChange(i, v)}
          className={i === 0 ? 'w-18 font-bold' : 'w-14'}
          highlight={i === 0}
        />
      ))}

      {/* ND */}
      <Field label="ND" value={nd} onChange={onNDChange} className="w-14" />

      {/* CV (FX, HB only) */}
      {showCV(apparatus) && (
        <Field label="CV" value={cv} onChange={onCVChange} className="w-14" />
      )}

      {/* 決定点 */}
      <div className="flex flex-col items-center ml-auto shrink-0">
        <span className="text-[10px] text-gray-400 leading-none">決定点</span>
        <span className={`text-lg font-bold leading-tight ${
          finalScore !== null ? 'text-primary dark:text-accent' : 'text-gray-300 dark:text-gray-600'
        }`}>
          {finalScore !== null ? finalScore.toFixed(3) : '—'}
        </span>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, className = '', highlight = false }: {
  label: string; value: string; onChange: (v: string) => void;
  className?: string; highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <span className="text-[10px] text-gray-400 leading-none mb-0.5">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.001"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className={`px-1 py-1 border rounded text-sm text-center bg-white dark:bg-gray-900
                    dark:text-gray-100 dark:border-gray-600 ${className}
                    ${highlight ? 'border-primary dark:border-accent ring-1 ring-primary/20' : ''}`}
      />
    </div>
  );
}
