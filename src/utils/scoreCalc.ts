import type { DigitalScores } from '../types';

// E審判数ごとのE決定算出ルール
// 1〜3人: 全員平均
// 4〜5人: 高低カット平均（最高1・最低1を除外して残りを平均）
// それ以上は将来拡張用に7-10人=2/2カット相当の規則も入れておく
export function calcEFinal(eScores: (number | undefined)[]): number | undefined {
  const valid = eScores.filter((v): v is number => typeof v === 'number');
  if (valid.length === 0) return undefined;
  const n = valid.length;
  const sorted = [...valid].sort((a, b) => a - b);
  let trimmed: number[];
  if (n <= 3) {
    trimmed = sorted;
  } else if (n <= 6) {
    trimmed = sorted.slice(1, -1);
  } else {
    // 7人以上は高2低2カット（将来用）
    trimmed = sorted.slice(2, -2);
  }
  if (trimmed.length === 0) return undefined;
  return round3(avg(trimmed));
}

// 決定点 = D + E決定 − ND + (加点 ? 0.1 : 0)
// finalManual が指定されていればそれを優先。
// E決定は eFinalManual があればそれ、なければ eScores から計算。
// D が無い、または E決定が無い場合は undefined。
export function calcFinal(s: DigitalScores): number | undefined {
  if (typeof s.finalManual === 'number') return s.finalManual;
  const eFinal = typeof s.eFinalManual === 'number' ? s.eFinalManual : calcEFinal(s.e);
  if (typeof s.d !== 'number' || typeof eFinal !== 'number') return undefined;
  const nd = typeof s.nd === 'number' ? s.nd : 0;
  const bonus = s.bonus ? 0.1 : 0;
  return round3(s.d + eFinal - nd + bonus);
}

// 表示用E決定（手動上書きを反映）
export function getEFinal(s: DigitalScores): number | undefined {
  if (typeof s.eFinalManual === 'number') return s.eFinalManual;
  return calcEFinal(s.e);
}

export function emptyScores(eJudgeCount: number): DigitalScores {
  return {
    e: Array(eJudgeCount).fill(undefined),
    bonus: false,
  };
}

// 何か1つでも値が入っているか（保存判定用）
export function hasAnyScore(s: DigitalScores | undefined): boolean {
  if (!s) return false;
  if (typeof s.d === 'number') return true;
  if (typeof s.nd === 'number') return true;
  if (typeof s.eFinalManual === 'number') return true;
  if (typeof s.finalManual === 'number') return true;
  if (s.bonus) return true;
  if (s.e.some(v => typeof v === 'number')) return true;
  return false;
}

// 表示用フォーマッタ: 指定桁の小数点以下を保持。値が undefined なら空文字。
export function formatScore(v: number | undefined, digits = 3): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '';
  return v.toFixed(digits);
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
