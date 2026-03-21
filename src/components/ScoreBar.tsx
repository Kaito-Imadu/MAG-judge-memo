import type { Apparatus } from '../types';
import MiniCanvas from './MiniCanvas';

interface Props {
  apparatus: Apparatus;
  eScoreCount: number;
}

const showCV = (a: Apparatus) => a === 'FX' || a === 'HB';

export default function ScoreBar({ apparatus, eScoreCount }: Props) {
  const hasCV = showCV(apparatus);
  // E欄の数
  const eLabels: string[] = [];
  for (let i = 0; i < eScoreCount; i++) {
    eLabels.push(i === 0 ? 'E(自分)' : `E${i + 1}`);
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800 border-t-2 border-primary dark:border-accent shrink-0 px-2 py-1.5 flex items-end gap-1.5 overflow-x-auto">
      {/* D */}
      <MiniCanvas width={72} height={36} label="D" />

      <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 shrink-0" />

      {/* E scores */}
      {eLabels.map((label, i) => (
        <MiniCanvas key={i} width={i === 0 ? 80 : 64} height={36} label={label} highlight={i === 0} />
      ))}

      <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 shrink-0" />

      {/* ND */}
      <MiniCanvas width={56} height={36} label="ND" />

      {/* CV (FX, HB) */}
      {hasCV && <MiniCanvas width={56} height={36} label="CV" />}

      {/* 決定点 */}
      <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 shrink-0" />
      <MiniCanvas width={100} height={40} label="決定点" highlight className="ml-auto" />
    </div>
  );
}
