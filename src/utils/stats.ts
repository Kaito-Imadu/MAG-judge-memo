// 純粋な統計計算ユーティリティ。Canvas/DOM 非依存。

export function valid(arr: (number | undefined)[]): number[] {
  return arr.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
}

export function mean(arr: number[]): number | undefined {
  if (arr.length === 0) return undefined;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// 標本標準偏差（n-1で割る）。n<2 は undefined。
export function stdSample(arr: number[]): number | undefined {
  if (arr.length < 2) return undefined;
  const m = mean(arr)!;
  const sq = arr.reduce((a, b) => a + (b - m) ** 2, 0);
  return Math.sqrt(sq / (arr.length - 1));
}

// 母集団標準偏差（nで割る）。1サンプルでも 0 を返す。
export function stdPopulation(arr: number[]): number | undefined {
  if (arr.length === 0) return undefined;
  const m = mean(arr)!;
  const sq = arr.reduce((a, b) => a + (b - m) ** 2, 0);
  return Math.sqrt(sq / arr.length);
}

// 偏差値 = 50 + 10 × (x − μ) / σ。σ=0 のときは 50。
export function deviationScore(x: number, m: number, s: number): number {
  if (s === 0) return 50;
  return 50 + (10 * (x - m)) / s;
}

// 線形補間でパーセンタイル（numpy/R-7 デフォルトと同じ）
export function percentile(sortedAsc: number[], p: number): number | undefined {
  if (sortedAsc.length === 0) return undefined;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

export interface BoxStats {
  min: number;
  max: number;
  q1: number;
  median: number;
  q3: number;
  lowerWhisker: number;
  upperWhisker: number;
  outliers: number[];
  n: number;
}

export function boxStats(arr: number[]): BoxStats | undefined {
  if (arr.length === 0) return undefined;
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25)!;
  const median = percentile(sorted, 0.5)!;
  const q3 = percentile(sorted, 0.75)!;
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const outliers = sorted.filter((v) => v < lo || v > hi);
  let lowerWhisker = sorted[0];
  for (const v of sorted) {
    if (v >= lo) {
      lowerWhisker = v;
      break;
    }
  }
  let upperWhisker = sorted[sorted.length - 1];
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i] <= hi) {
      upperWhisker = sorted[i];
      break;
    }
  }
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    q1,
    median,
    q3,
    lowerWhisker,
    upperWhisker,
    outliers,
    n: sorted.length,
  };
}

export interface HistBin {
  start: number;
  end: number;
  count: number;
  values: number[];
}

// ヒストグラム。binWidth 優先、未指定なら nBins、それも未指定なら Sturges 則。
export function histogram(
  arr: number[],
  opts: { binWidth?: number; nBins?: number; min?: number; max?: number } = {},
): HistBin[] {
  if (arr.length === 0) return [];
  const minV = opts.min ?? Math.min(...arr);
  const maxV = opts.max ?? Math.max(...arr);
  if (minV === maxV) {
    return [{ start: minV, end: minV, count: arr.length, values: [...arr] }];
  }
  let binWidth = opts.binWidth;
  let nBins = opts.nBins;
  if (!binWidth && !nBins) {
    nBins = Math.max(3, Math.ceil(1 + Math.log2(arr.length))); // Sturges
  }
  if (!binWidth) {
    binWidth = (maxV - minV) / nBins!;
  } else {
    nBins = Math.max(1, Math.ceil((maxV - minV) / binWidth));
  }
  const bins: HistBin[] = [];
  for (let i = 0; i < nBins!; i++) {
    bins.push({
      start: minV + i * binWidth,
      end: minV + (i + 1) * binWidth,
      count: 0,
      values: [],
    });
  }
  for (const v of arr) {
    let idx = Math.floor((v - minV) / binWidth);
    if (idx >= nBins!) idx = nBins! - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
    bins[idx].values.push(v);
  }
  return bins;
}

// 「いい感じ」の bin 幅候補を返す（採点スコア用、0.5 / 0.25 / 0.1 の中から選ぶ）
export function niceBinWidth(range: number, targetBins = 8): number {
  const candidates = [0.05, 0.1, 0.2, 0.25, 0.5, 1.0];
  let best = candidates[0];
  let bestDiff = Infinity;
  for (const c of candidates) {
    const n = range / c;
    const diff = Math.abs(n - targetBins);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}
