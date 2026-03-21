import type { Apparatus } from '../types';
import { APPARATUS_MAP } from '../constants/apparatus';

interface Props {
  apparatus: Apparatus;
  playerName?: string;
  dScore?: number;
  eScore?: number;
  ndTotal?: number;
}

export default function ScoreBoard({ apparatus, playerName, dScore, eScore, ndTotal }: Props) {
  const info = APPARATUS_MAP[apparatus];
  const hasBoth = dScore != null && eScore != null;
  const finalScore = hasBoth ? dScore + eScore - (ndTotal ?? 0) : undefined;

  return (
    <div className="bg-primary text-white px-4 py-2 flex items-center gap-4 text-sm flex-wrap">
      <span className="font-bold">{info.code} {info.name}</span>
      {playerName && <span className="opacity-80">{playerName}</span>}
      <div className="flex gap-4 ml-auto">
        <span>D: <b>{dScore != null ? dScore.toFixed(3) : '—'}</b></span>
        <span>E: <b>{eScore != null ? eScore.toFixed(3) : '—'}</b></span>
        <span>ND: <b>{ndTotal != null && ndTotal > 0 ? ndTotal.toFixed(1) : '—'}</b></span>
        <span className="text-yellow-200 font-bold">
          決定点: {finalScore != null ? finalScore.toFixed(3) : '—'}
        </span>
      </div>
    </div>
  );
}
