import type { BoxStats, HistBin } from './stats';

// ===== 共通定数 =====
export const CHART_COLORS = {
  bg: '#ffffff',
  text: '#1A1A2E',
  textMuted: '#6B7280',
  axis: '#9CA3AF',
  grid: '#E5E7EB',
  primary: '#1B4F72',
  accent: '#2E86C1',
  success: '#27AE60',
  danger: '#E74C3C',
  warning: '#F39C12',
};

export const ATHLETE_PALETTE = [
  '#2E86C1', '#E74C3C', '#27AE60', '#F39C12',
  '#8E44AD', '#16A085', '#D35400', '#2C3E50',
  '#C0392B', '#2980B9', '#7F8C8D', '#1ABC9C',
];

const FONT_REG = (size: number) => `${size}px "Noto Sans JP", -apple-system, system-ui, sans-serif`;
const FONT_BOLD = (size: number) => `bold ${size}px "Noto Sans JP", -apple-system, system-ui, sans-serif`;
const FONT_MONO = (size: number) => `${size}px "SF Mono", "Menlo", "Consolas", monospace`;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ===== 共通ヘルパー =====

// "いい感じ" 目盛間隔を返す（最大5〜10本になる程度）
function niceTickStep(range: number, targetTicks = 6): number {
  const rough = range / targetTicks;
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow10;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * pow10;
}

function ceilTo(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

function floorTo(v: number, step: number): number {
  return Math.floor(v / step) * step;
}

function fmt(v: number, digits = 2): string {
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(digits).replace(/\.?0+$/, '');
}

// Y 軸（数値軸）描画。返す関数で値→Y座標に変換。
function drawYAxis(
  c: CanvasRenderingContext2D,
  area: Rect,
  yMin: number,
  yMax: number,
): (v: number) => number {
  const step = niceTickStep(yMax - yMin);
  const lo = floorTo(yMin, step);
  const hi = ceilTo(yMax, step);
  const range = hi - lo;
  const yScale = (v: number) => area.y + area.h - ((v - lo) / range) * area.h;

  // グリッド線
  c.strokeStyle = CHART_COLORS.grid;
  c.lineWidth = 1;
  c.fillStyle = CHART_COLORS.textMuted;
  c.font = FONT_REG(11);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  for (let v = lo; v <= hi + step / 2; v += step) {
    const yy = yScale(v);
    c.beginPath();
    c.moveTo(area.x, yy);
    c.lineTo(area.x + area.w, yy);
    c.stroke();
    c.fillText(fmt(v, 2), area.x - 6, yy);
  }
  // Y 軸線
  c.strokeStyle = CHART_COLORS.axis;
  c.beginPath();
  c.moveTo(area.x + 0.5, area.y);
  c.lineTo(area.x + 0.5, area.y + area.h);
  c.stroke();

  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  return yScale;
}

// X カテゴリ軸（ラベル文字列をプロット領域下に並べる）
function drawXCategories(
  c: CanvasRenderingContext2D,
  area: Rect,
  labels: string[],
): { centers: number[] } {
  const n = labels.length;
  const slot = area.w / n;
  const centers: number[] = [];
  c.fillStyle = CHART_COLORS.text;
  c.font = FONT_BOLD(13);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (let i = 0; i < n; i++) {
    const cx = area.x + slot * (i + 0.5);
    centers.push(cx);
    c.fillText(labels[i], cx, area.y + area.h + 8);
  }
  // X 軸線
  c.strokeStyle = CHART_COLORS.axis;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(area.x, area.y + area.h + 0.5);
  c.lineTo(area.x + area.w, area.y + area.h + 0.5);
  c.stroke();
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  return { centers };
}

function drawTitle(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  title: string,
  subtitle?: string,
): void {
  c.fillStyle = CHART_COLORS.text;
  c.font = FONT_BOLD(16);
  c.textAlign = 'left';
  c.fillText(title, x, y);
  if (subtitle) {
    c.fillStyle = CHART_COLORS.textMuted;
    c.font = FONT_REG(12);
    c.fillText(subtitle, x, y + 18);
  }
}

// 「データなし」プレースホルダ
function drawEmpty(c: CanvasRenderingContext2D, area: Rect, msg = 'データがありません'): void {
  c.fillStyle = CHART_COLORS.textMuted;
  c.font = FONT_REG(13);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(msg, area.x + area.w / 2, area.y + area.h / 2);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

// ===== レーダーチャート =====
export interface RadarSeries {
  label: string;
  color: string;
  values: (number | undefined)[]; // 軸数と同じ長さ
}

export function drawRadar(
  c: CanvasRenderingContext2D,
  area: Rect,
  axes: string[],
  series: RadarSeries[],
  axisMax: number, // 軸の最大値（例: 16）
): void {
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const r = Math.min(area.w, area.h) / 2 - 36;
  const n = axes.length;
  if (n < 3) {
    drawEmpty(c, area, '軸数が不足しています');
    return;
  }
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;

  // グリッド（同心多角形）
  const ringSteps = 4;
  c.strokeStyle = CHART_COLORS.grid;
  c.fillStyle = CHART_COLORS.bg;
  for (let k = 1; k <= ringSteps; k++) {
    const rk = (r * k) / ringSteps;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = angle(i);
      const x = cx + rk * Math.cos(a);
      const y = cy + rk * Math.sin(a);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.stroke();
  }
  // 軸線・ラベル
  c.strokeStyle = CHART_COLORS.axis;
  c.fillStyle = CHART_COLORS.text;
  c.font = FONT_BOLD(13);
  for (let i = 0; i < n; i++) {
    const a = angle(i);
    const ex = cx + r * Math.cos(a);
    const ey = cy + r * Math.sin(a);
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(ex, ey);
    c.stroke();
    // ラベル
    const lx = cx + (r + 18) * Math.cos(a);
    const ly = cy + (r + 18) * Math.sin(a);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(axes[i], lx, ly);
  }
  // 目盛値（軸0方向にだけ）
  c.fillStyle = CHART_COLORS.textMuted;
  c.font = FONT_REG(10);
  c.textAlign = 'center';
  for (let k = 1; k <= ringSteps; k++) {
    const rk = (r * k) / ringSteps;
    const v = (axisMax * k) / ringSteps;
    c.fillText(fmt(v, 1), cx, cy - rk - 4);
  }

  // 系列描画
  for (const s of series) {
    const pts: { x: number; y: number; v: number | undefined }[] = [];
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      if (typeof v !== 'number') {
        pts.push({ x: cx, y: cy, v: undefined });
        continue;
      }
      const ratio = Math.max(0, Math.min(1, v / axisMax));
      const rr = r * ratio;
      pts.push({ x: cx + rr * Math.cos(angle(i)), y: cy + rr * Math.sin(angle(i)), v });
    }
    // 値が無い軸はグラフが歪むのでスキップ表示。全軸とも揃ってる場合のみ多角形を閉じて塗る。
    const allDefined = s.values.every((v) => typeof v === 'number');
    if (allDefined) {
      c.fillStyle = s.color + '33'; // alpha
      c.strokeStyle = s.color;
      c.lineWidth = 2;
      c.beginPath();
      pts.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
      c.closePath();
      c.fill();
      c.stroke();
    } else {
      // 線のみつなぐ（値が無い軸は中心点になる→飛ばし表示）
      c.strokeStyle = s.color;
      c.lineWidth = 2;
      c.beginPath();
      let started = false;
      for (const p of pts) {
        if (p.v === undefined) {
          started = false;
          continue;
        }
        if (!started) {
          c.moveTo(p.x, p.y);
          started = true;
        } else {
          c.lineTo(p.x, p.y);
        }
      }
      c.stroke();
    }
    // 頂点ドット
    for (const p of pts) {
      if (p.v === undefined) continue;
      c.fillStyle = s.color;
      c.beginPath();
      c.arc(p.x, p.y, 3, 0, Math.PI * 2);
      c.fill();
    }
  }

  // 凡例（右下）
  drawLegend(c, area.x + area.w - 8, area.y + 8, series.map((s) => ({ label: s.label, color: s.color })));
}

function drawLegend(
  c: CanvasRenderingContext2D,
  rightX: number,
  topY: number,
  items: { label: string; color: string }[],
): void {
  c.font = FONT_REG(12);
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  let y = topY + 12;
  for (const it of items) {
    const tw = c.measureText(it.label).width;
    const dotX = rightX - tw - 16;
    c.fillStyle = it.color;
    c.beginPath();
    c.arc(dotX, y, 5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = CHART_COLORS.text;
    c.fillText(it.label, rightX, y);
    y += 18;
  }
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

// ===== 箱ひげ図 =====
export interface BoxGroup {
  label: string;
  stats: BoxStats | undefined;
}

export function drawBoxplot(
  c: CanvasRenderingContext2D,
  area: Rect,
  groups: BoxGroup[],
  yMin?: number,
  yMax?: number,
): void {
  const validGroups = groups.filter((g) => g.stats);
  if (validGroups.length === 0) {
    drawEmpty(c, area);
    return;
  }
  // y range 自動
  let lo = yMin ?? Infinity;
  let hi = yMax ?? -Infinity;
  for (const g of validGroups) {
    const s = g.stats!;
    lo = Math.min(lo, s.min);
    hi = Math.max(hi, s.max);
  }
  if (lo === hi) {
    lo -= 0.5;
    hi += 0.5;
  }
  // 余白
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;

  const plotArea: Rect = { x: area.x + 50, y: area.y, w: area.w - 60, h: area.h - 40 };
  const yScale = drawYAxis(c, plotArea, lo, hi);
  const { centers } = drawXCategories(c, plotArea, groups.map((g) => g.label));

  const boxW = Math.min(40, (plotArea.w / groups.length) * 0.5);
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!g.stats) continue;
    const s = g.stats;
    const cx = centers[i];
    const x = cx - boxW / 2;
    const yQ1 = yScale(s.q1);
    const yQ3 = yScale(s.q3);
    const yMed = yScale(s.median);
    const yLo = yScale(s.lowerWhisker);
    const yHi = yScale(s.upperWhisker);

    // ひげ
    c.strokeStyle = CHART_COLORS.primary;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx, yLo);
    c.lineTo(cx, yQ3);
    c.moveTo(cx, yQ1);
    c.lineTo(cx, yHi);
    // ひげキャップ
    c.moveTo(cx - boxW / 4, yLo);
    c.lineTo(cx + boxW / 4, yLo);
    c.moveTo(cx - boxW / 4, yHi);
    c.lineTo(cx + boxW / 4, yHi);
    c.stroke();

    // 箱
    c.fillStyle = CHART_COLORS.accent + '55';
    c.strokeStyle = CHART_COLORS.accent;
    c.lineWidth = 1.5;
    c.fillRect(x, yQ3, boxW, yQ1 - yQ3);
    c.strokeRect(x, yQ3, boxW, yQ1 - yQ3);

    // 中央値
    c.strokeStyle = CHART_COLORS.primary;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, yMed);
    c.lineTo(x + boxW, yMed);
    c.stroke();

    // 外れ値
    c.fillStyle = CHART_COLORS.danger;
    for (const v of s.outliers) {
      c.beginPath();
      c.arc(cx, yScale(v), 3, 0, Math.PI * 2);
      c.fill();
    }

    // n=数 ラベル
    c.fillStyle = CHART_COLORS.textMuted;
    c.font = FONT_REG(10);
    c.textAlign = 'center';
    c.fillText(`n=${s.n}`, cx, area.y + area.h - 8);
    c.textAlign = 'left';
  }
}

// ===== ヒストグラム + ドットオーバーレイ =====
export function drawHistogramWithDots(
  c: CanvasRenderingContext2D,
  area: Rect,
  bins: HistBin[],
  digits = 2,
): void {
  if (bins.length === 0) {
    drawEmpty(c, area);
    return;
  }
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  const plotArea: Rect = { x: area.x + 50, y: area.y, w: area.w - 60, h: area.h - 40 };
  // Y 軸 = 度数
  const yScale = drawYAxis(c, plotArea, 0, maxCount);

  // X 軸 = 値域（連続）
  const xLo = bins[0].start;
  const xHi = bins[bins.length - 1].end;
  const xScale = (v: number) => plotArea.x + ((v - xLo) / (xHi - xLo)) * plotArea.w;

  // X 目盛
  const step = niceTickStep(xHi - xLo, 6);
  c.strokeStyle = CHART_COLORS.axis;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(plotArea.x, plotArea.y + plotArea.h + 0.5);
  c.lineTo(plotArea.x + plotArea.w, plotArea.y + plotArea.h + 0.5);
  c.stroke();
  c.fillStyle = CHART_COLORS.textMuted;
  c.font = FONT_REG(11);
  c.textAlign = 'center';
  c.textBaseline = 'top';
  for (let v = Math.ceil(xLo / step) * step; v <= xHi + 1e-9; v += step) {
    const xx = xScale(v);
    c.fillText(fmt(v, digits), xx, plotArea.y + plotArea.h + 6);
    c.strokeStyle = CHART_COLORS.axis;
    c.beginPath();
    c.moveTo(xx, plotArea.y + plotArea.h);
    c.lineTo(xx, plotArea.y + plotArea.h + 4);
    c.stroke();
  }
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';

  // バー
  for (const b of bins) {
    const x0 = xScale(b.start);
    const x1 = xScale(b.end);
    const yTop = yScale(b.count);
    const yBot = yScale(0);
    if (b.count > 0) {
      c.fillStyle = CHART_COLORS.accent + '88';
      c.strokeStyle = CHART_COLORS.accent;
      c.lineWidth = 1;
      c.fillRect(x0 + 1, yTop, x1 - x0 - 2, yBot - yTop);
      c.strokeRect(x0 + 1, yTop, x1 - x0 - 2, yBot - yTop);
    }
  }
  // ドットオーバーレイ（実値）— bin 内の値を縦に重ねる
  c.fillStyle = CHART_COLORS.primary;
  for (const b of bins) {
    for (let i = 0; i < b.values.length; i++) {
      const v = b.values[i];
      const dotX = xScale(v);
      // bin 内の i 番目を頭から積み上げ
      const dotY = yScale(b.count) - 6 - i * 7;
      // dotY が範囲外になる場合は中央付近に詰める
      const minY = plotArea.y + 6;
      const yy = Math.max(dotY, minY);
      c.beginPath();
      c.arc(dotX, yy, 3, 0, Math.PI * 2);
      c.fill();
    }
  }
}

// ===== E審判個人バイアス棒グラフ =====
export interface BiasBar {
  label: string;
  value: number; // 平均バイアス（正=高め, 負=厳しめ）
  n: number;
}

export function drawBiasBars(
  c: CanvasRenderingContext2D,
  area: Rect,
  bars: BiasBar[],
): void {
  if (bars.length === 0) {
    drawEmpty(c, area);
    return;
  }
  const absMax = Math.max(0.05, ...bars.map((b) => Math.abs(b.value)));
  const yMin = -absMax * 1.2;
  const yMax = absMax * 1.2;

  const plotArea: Rect = { x: area.x + 50, y: area.y, w: area.w - 60, h: area.h - 40 };
  const yScale = drawYAxis(c, plotArea, yMin, yMax);
  const { centers } = drawXCategories(c, plotArea, bars.map((b) => b.label));

  // 0 線
  const y0 = yScale(0);
  c.strokeStyle = CHART_COLORS.text;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(plotArea.x, y0);
  c.lineTo(plotArea.x + plotArea.w, y0);
  c.stroke();

  const barW = Math.min(50, (plotArea.w / bars.length) * 0.55);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const cx = centers[i];
    const x = cx - barW / 2;
    const yV = yScale(b.value);
    const yTop = Math.min(y0, yV);
    const yBot = Math.max(y0, yV);
    const color = b.value >= 0 ? CHART_COLORS.danger : CHART_COLORS.accent;
    c.fillStyle = color + 'CC';
    c.strokeStyle = color;
    c.lineWidth = 1;
    c.fillRect(x, yTop, barW, yBot - yTop);
    c.strokeRect(x, yTop, barW, yBot - yTop);

    // 値ラベル
    c.fillStyle = CHART_COLORS.text;
    c.font = FONT_MONO(11);
    c.textAlign = 'center';
    const valStr = (b.value >= 0 ? '+' : '') + b.value.toFixed(3);
    if (b.value >= 0) {
      c.textBaseline = 'bottom';
      c.fillText(valStr, cx, yTop - 3);
    } else {
      c.textBaseline = 'top';
      c.fillText(valStr, cx, yBot + 3);
    }
    // n
    c.fillStyle = CHART_COLORS.textMuted;
    c.font = FONT_REG(10);
    c.textBaseline = 'top';
    c.fillText(`n=${b.n}`, cx, area.y + area.h - 8);
  }
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

// ===== タイトル付きで上記関数をラップする補助 =====
export function withTitle(
  c: CanvasRenderingContext2D,
  area: Rect,
  title: string,
  subtitle: string | undefined,
  draw: (innerArea: Rect) => void,
): void {
  drawTitle(c, area.x, area.y + 18, title, subtitle);
  const headerH = subtitle ? 44 : 28;
  draw({ x: area.x, y: area.y + headerH, w: area.w, h: area.h - headerH });
}
