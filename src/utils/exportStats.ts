import type { Apparatus } from '../types';
import { APPARATUS_LIST, APPARATUS_MAP } from '../constants/apparatus';

// 共通ヘッダー/フッター付きでCanvasをラップした PNG を生成して共有する。
// canvas: ライブで描画済みの<canvas> 参照（StatsModal の中身のCanvas）
// deviationRows: 偏差値タブ用（HTML→Canvas変換）

const HEADER_H = 70;
const FOOTER_H = 32;
const PAD = 24;
const PRIMARY = '#1B4F72';
const TEXT_MUTED = '#6B7280';

function formatJaDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function tabTitle(tab: string, mode: 'trial' | 'competition', metric: string, apparatus?: Apparatus): string {
  const metricMap: Record<string, string> = { d: 'D', eFinal: 'E決定', nd: 'ND', final: '決定点' };
  const metricLabel = metricMap[metric] ?? metric;
  switch (tab) {
    case 'radar':
      return '📊 種目別レーダーチャート';
    case 'box':
      return mode === 'trial'
        ? `📊 種目別 箱ひげ図 (${metricLabel})`
        : `📊 ${apparatus ?? ''} 箱ひげ図 (${metricLabel})`;
    case 'deviation':
      return '📊 偏差値テーブル';
    case 'bias':
      return '📊 E審判個人バイアス';
    case 'hist':
      return `📊 ${apparatus ?? ''} ヒストグラム (${metricLabel})`;
    default:
      return '📊 統計';
  }
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_');
}

async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch {
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function drawHeader(c: CanvasRenderingContext2D, w: number, title: string, subtitle: string): void {
  c.fillStyle = PRIMARY;
  c.fillRect(0, 0, w, HEADER_H);
  c.fillStyle = '#ffffff';
  c.font = 'bold 22px "Noto Sans JP", sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillText(title, PAD, 32);
  c.font = '13px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffffcc';
  c.fillText(subtitle, PAD, 54);
}

function drawFooter(c: CanvasRenderingContext2D, w: number, h: number, info: string): void {
  c.fillStyle = '#F3F4F6';
  c.fillRect(0, h - FOOTER_H, w, FOOTER_H);
  c.fillStyle = TEXT_MUTED;
  c.font = '11px "Noto Sans JP", sans-serif';
  c.textAlign = 'left';
  c.fillText(info, PAD, h - 12);
  c.fillStyle = '#9CA3AF';
  c.textAlign = 'right';
  c.fillText('MAG Judge Memo', w - PAD, h - 12);
  c.textAlign = 'left';
}

interface DeviationRow {
  name: string;
  aa: number | undefined;
  aaDev: number | undefined;
  perApp: Partial<Record<Apparatus, number>>;
}

function renderDeviationTableToCanvas(rows: DeviationRow[], w: number): { canvas: HTMLCanvasElement; totalH: number } {
  // 行ごとに 36px、ヘッダー 40px、padding込みでサイズ決定
  const rowH = 36;
  const headerH = 40;
  const innerH = headerH + rowH * Math.max(rows.length, 1);
  const totalH = HEADER_H + 16 + innerH + 16 + FOOTER_H;
  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = w * dpr;
  canvas.height = totalH * dpr;
  const c = canvas.getContext('2d')!;
  c.scale(dpr, dpr);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, totalH);

  const tableX = PAD;
  const tableY = HEADER_H + 16;
  const tableW = w - PAD * 2;

  // 列定義: 選手 / AA / FX..HB
  const cols: { key: string; label: string; w: number }[] = [];
  cols.push({ key: 'name', label: '選手', w: 180 });
  cols.push({ key: 'aa', label: 'AA', w: 110 });
  const restW = tableW - 180 - 110;
  const eachW = restW / APPARATUS_LIST.length;
  APPARATUS_LIST.forEach((a) => cols.push({ key: a.code, label: a.code, w: eachW }));

  // ヘッダー
  c.fillStyle = '#F8F9FA';
  c.fillRect(tableX, tableY, tableW, headerH);
  c.fillStyle = TEXT_MUTED;
  c.font = 'bold 13px "Noto Sans JP", sans-serif';
  let cx = tableX;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    if (i === 0) {
      c.textAlign = 'left';
      c.fillText(col.label, cx + 12, tableY + 26);
    } else {
      c.textAlign = 'right';
      c.fillText(col.label, cx + col.w - 12, tableY + 26);
    }
    cx += col.w;
  }

  // セル背景色（簡易）
  const cellBg = (dev: number | undefined): string | null => {
    if (typeof dev !== 'number') return null;
    if (dev >= 65) return '#D1FAE5';
    if (dev >= 55) return '#ECFDF5';
    if (dev >= 45) return null;
    if (dev >= 35) return '#FEE2E2';
    return '#FECACA';
  };

  // 行
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowY = tableY + headerH + rowH * i;
    if (i % 2 === 1) {
      c.fillStyle = '#F8F9FA';
      c.fillRect(tableX, rowY, tableW, rowH);
    }
    cx = tableX;
    // 選手名
    c.fillStyle = '#1A1A2E';
    c.font = 'bold 14px "Noto Sans JP", sans-serif';
    c.textAlign = 'left';
    c.fillText(r.name, cx + 12, rowY + 23);
    cx += cols[0].w;

    // AA偏差値
    const aaDev = r.aaDev;
    const aaBg = cellBg(aaDev);
    if (aaBg) {
      c.fillStyle = aaBg;
      c.fillRect(cx + 4, rowY + 4, cols[1].w - 8, rowH - 8);
    }
    c.fillStyle = '#1A1A2E';
    c.font = 'bold 14px "SF Mono", monospace';
    c.textAlign = 'right';
    c.fillText(typeof aaDev === 'number' ? aaDev.toFixed(1) : '-', cx + cols[1].w - 12, rowY + 23);
    cx += cols[1].w;

    // 種目別
    APPARATUS_LIST.forEach((a, idx) => {
      const col = cols[2 + idx];
      const dev = r.perApp[a.code];
      const bg = cellBg(dev);
      if (bg) {
        c.fillStyle = bg;
        c.fillRect(cx + 2, rowY + 4, col.w - 4, rowH - 8);
      }
      c.fillStyle = typeof dev === 'number' ? '#1A1A2E' : '#9CA3AF';
      c.font = '13px "SF Mono", monospace';
      c.textAlign = 'right';
      c.fillText(typeof dev === 'number' ? dev.toFixed(1) : '-', cx + col.w - 12, rowY + 23);
      cx += col.w;
    });
  }
  c.textAlign = 'left';

  // 表外枠
  c.strokeStyle = '#E5E7EB';
  c.lineWidth = 1;
  c.strokeRect(tableX + 0.5, tableY + 0.5, tableW - 1, innerH - 1);

  return { canvas, totalH };
}

export interface ExportStatsOpts {
  sessionName: string;
  sessionDate: Date;
  mode: 'trial' | 'competition';
  apparatus?: Apparatus;
  eJudgeCount: number;
  tab: string;
  metric: string;
  canvas?: HTMLCanvasElement;
  deviationRows?: { name: string; aa: number | undefined; aaDev: number | undefined; perApp: Partial<Record<Apparatus, number>> }[];
}

export async function exportStats(opts: ExportStatsOpts): Promise<{ shared: boolean }> {
  const title = tabTitle(opts.tab, opts.mode, opts.metric, opts.apparatus);
  const subtitle = `${opts.sessionName}  /  ${formatJaDate(opts.sessionDate)}${
    opts.mode === 'competition' && opts.apparatus
      ? `  /  ${opts.apparatus} ${APPARATUS_MAP[opts.apparatus].name}`
      : ''
  }`;

  // 偏差値タブ専用パス
  if (opts.tab === 'deviation') {
    if (!opts.deviationRows || opts.deviationRows.length === 0) {
      alert('共有できるデータがありません。');
      return { shared: false };
    }
    const w = 1080;
    const { canvas: inner, totalH } = renderDeviationTableToCanvas(opts.deviationRows, w);
    const c = inner.getContext('2d')!;
    drawHeader(c, w, title, subtitle);
    drawFooter(c, w, totalH, `E審判 ${opts.eJudgeCount}名`);
    const blob = await new Promise<Blob>((resolve) => inner.toBlob((b) => resolve(b!), 'image/png'));
    const fname = `${sanitizeFilename(opts.sessionName)}_偏差値_${formatJaDate(opts.sessionDate)}.png`;
    await shareOrDownload(blob, fname, title);
    return { shared: true };
  }

  // チャート系: ライブ canvas を取得し、ヘッダー/フッター付きにラップ
  if (!opts.canvas) {
    alert('共有できる画像がありません。');
    return { shared: false };
  }
  const src = opts.canvas;
  // src は DPR 込みの実ピクセル。表示サイズ（CSS）から取得。
  const cssW = parseInt(src.style.width, 10) || src.width;
  const cssH = parseInt(src.style.height, 10) || src.height;

  const w = Math.max(1080, cssW + PAD * 2);
  const innerW = cssW;
  const innerX = (w - innerW) / 2;
  const totalH = HEADER_H + 16 + cssH + 16 + FOOTER_H;

  const out = document.createElement('canvas');
  const dpr = 2;
  out.width = w * dpr;
  out.height = totalH * dpr;
  const c = out.getContext('2d')!;
  c.scale(dpr, dpr);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, totalH);

  drawHeader(c, w, title, subtitle);
  // src を DPR 補正して描画
  c.drawImage(src, innerX, HEADER_H + 16, innerW, cssH);
  drawFooter(c, w, totalH, `E審判 ${opts.eJudgeCount}名`);

  const blob = await new Promise<Blob>((resolve) => out.toBlob((b) => resolve(b!), 'image/png'));
  const tabSlug = opts.tab === 'hist' ? 'ヒストグラム'
    : opts.tab === 'box' ? '箱ひげ'
    : opts.tab === 'radar' ? 'レーダー'
    : opts.tab === 'bias' ? 'E審判バイアス'
    : opts.tab;
  const fname = `${sanitizeFilename(opts.sessionName)}_${tabSlug}_${formatJaDate(opts.sessionDate)}.png`;
  await shareOrDownload(blob, fname, title);
  return { shared: true };
}
