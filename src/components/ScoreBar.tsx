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
  const d = parseFloat(dScore) || 0;
  const n = parseFloat(nd) || 0;
  const c = showCV(apparatus) ? (parseFloat(cv) || 0) : 0;

  const eVals = eScores.map((s) => parseFloat(s)).filter((v) => !isNaN(v));
  let eFinal: number | null = null;
  if (eVals.length > 0) {
    if (eVals.length >= 3) {
      const sorted = [...eVals].sort((a, b) => a - b);
      const trimmed = sorted.slice(1, -1);
      eFinal = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    } else {
      eFinal = eVals.reduce((a, b) => a + b, 0) / eVals.length;
    }
  }

  const finalScore = d > 0 && eFinal !== null ? d + eFinal + c - n : null;

  return (
    <div className="bg-white dark:bg-gray-900 border-t-2 border-primary dark:border-accent shrink-0">
      {/* 決定点の大きな表示 */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <div className="flex items-baseline gap-6 text-sm">
          <Score label="D" value={d > 0 ? d.toFixed(3) : null} />
          <Score label="E" value={eFinal !== null ? eFinal.toFixed(3) : null} />
          {n > 0 && <Score label="ND" value={`-${n.toFixed(1)}`} danger />}
          {c > 0 && <Score label="CV" value={`+${c.toFixed(1)}`} />}
        </div>
        <div className="text-right">
          <span className="text-[10px] text-gray-400 block leading-none">決定点</span>
          <span className={`text-2xl font-bold leading-tight ${
            finalScore !== null ? 'text-primary dark:text-accent' : 'text-gray-300 dark:text-gray-600'
          }`}>
            {finalScore !== null ? finalScore.toFixed(3) : '—.———'}
          </span>
        </div>
      </div>

      {/* 入力欄 */}
      <div className="flex items-center gap-1.5 px-3 pb-2 overflow-x-auto">
        <Field label="D" value={dScore} onChange={onDScoreChange} w="w-16" />
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5" />
        {eScores.map((val, i) => (
          <Field
            key={i}
            label={i === 0 ? 'E(自)' : `E${i + 1}`}
            value={val}
            onChange={(v) => onEScoreChange(i, v)}
            w={i === 0 ? 'w-16' : 'w-14'}
            highlight={i === 0}
          />
        ))}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5" />
        <Field label="ND" value={nd} onChange={onNDChange} w="w-14" />
        {showCV(apparatus) && (
          <Field label="CV" value={cv} onChange={onCVChange} w="w-14" />
        )}
      </div>
    </div>
  );
}

function Score({ label, value, danger = false }: { label: string; value: string | null; danger?: boolean }) {
  return (
    <span className="text-gray-500 dark:text-gray-400">
      {label}{' '}
      <span className={`font-bold ${
        value === null ? 'text-gray-300 dark:text-gray-600' :
        danger ? 'text-danger' : 'text-gray-800 dark:text-gray-100'
      }`}>
        {value ?? '—'}
      </span>
    </span>
  );
}

function Field({ label, value, onChange, w, highlight = false }: {
  label: string; value: string; onChange: (v: string) => void;
  w: string; highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <span className="text-[9px] text-gray-400 leading-none mb-0.5">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.001"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className={`${w} px-1 py-0.5 border rounded text-xs text-center bg-gray-50 dark:bg-gray-800
                    dark:text-gray-100 dark:border-gray-600
                    ${highlight ? 'border-primary dark:border-accent bg-blue-50 dark:bg-blue-950/30' : ''}`}
      />
    </div>
  );
}
