import type { DigitalScores } from '../types';

// E審判数ごとのE決定算出ルール
// 1〜3人: 全員平均（小数第2位まで）
// 4〜5人: 高低カット平均（最高1・最低1を除外して残りを平均、小数第3位まで）
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
  return roundN(avg(trimmed), eFinalDecimals(eScores));
}

// E決定の表示桁数。1〜3人=2桁、4人以上=3桁。
export function eFinalDecimals(eScores: (number | undefined)[]): number {
  const n = eScores.filter(v => typeof v === 'number').length;
  return n <= 3 ? 2 : 3;
}

// 決定点 = D + E決定 − ND + (加点 ? 0.1 : 0)
// finalManual が指定されていればそれを優先。
// E決定は eFinalManual があればそれ、なければ eScores から計算。
// 表示桁数は常に小数第3位まで。最低値は 0.000 にクランプ。
export function calcFinal(s: DigitalScores): number | undefined {
  if (typeof s.finalManual === 'number') return Math.max(0, roundN(s.finalManual, 3));
  const eFinal = typeof s.eFinalManual === 'number' ? s.eFinalManual : calcEFinal(s.e);
  if (typeof s.d !== 'number' || typeof eFinal !== 'number') return undefined;
  const nd = typeof s.nd === 'number' ? s.nd : 0;
  const bonus = s.bonus ? 0.1 : 0;
  const raw = s.d + eFinal - nd + bonus;
  return Math.max(0, roundN(raw, 3));
}

// 決定点表示用桁数（常に3桁固定）
export const FINAL_SCORE_DECIMALS = 3;

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

// 表示用フォーマッタ（自然桁）: 値の自然な桁数で表示（最大 maxDigits まで）。
// 例) 8 → "8" / 8.5 → "8.5" / 8.55 → "8.55" / 8.5555 → "8.556"
// 個人E スコアなど「ユーザが入力した有効数字をそのまま見たい」用途。
export function formatNatural(v: number | undefined, maxDigits = 3): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '';
  const s = v.toString();
  if (!s.includes('.')) return s;
  const decLen = s.length - s.indexOf('.') - 1;
  if (decLen > maxDigits) return v.toFixed(maxDigits);
  return s;
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function roundN(x: number, n: number): number {
  const f = Math.pow(10, n);
  return Math.round(x * f) / f;
}
