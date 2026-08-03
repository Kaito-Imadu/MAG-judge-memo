import type { Apparatus } from '../types';
import { APPARATUS_LIST, APPARATUS_MAP } from '../constants/apparatus';
import { formatScore, formatBonus, FINAL_SCORE_DECIMALS } from './scoreCalc';

// ===== 共通定数 =====
const CANVAS_W = 1080;
const PADDING = 24;
const HEADER_H = 80;
const FOOTER_H = 36;
const DPR = 2;

const BG = '#ffffff';
const PRIMARY = '#1B4F72';
const ACCENT = '#2E86C1';
const SUCCESS = '#27AE60';
const TEXT = '#1A1A2E';
const TEXT_MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const ALT_ROW = '#F8F9FA';
const HEADER_BG = '#F3F4F6';

const FONT_BOLD = (size: number) =>
  `bold ${size}px "Noto Sans JP", -apple-system, system-ui, sans-serif`;
const FONT_REG = (size: number) =>
  `${size}px "Noto Sans JP", -apple-system, system-ui, sans-serif`;
const FONT_MONO = (size: number) =>
  `${size}px "SF Mono", "Menlo", "Consolas", monospace`;
const FONT_MONO_BOLD = (size: number) =>
  `bold ${size}px "SF Mono", "Menlo", "Consolas", monospace`;

function formatJaDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function setupCanvas(w: number, h: number): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  const c = canvas.getContext('2d')!;
  c.scale(DPR, DPR);
  c.textBaseline = 'alphabetic';
  c.fillStyle = BG;
  c.fillRect(0, 0, w, h);
  return { canvas, c };
}

function drawHeader(
  c: CanvasRenderingContext2D,
  w: number,
  title: string,
  subtitle: string,
): void {
  c.fillStyle = PRIMARY;
  c.fillRect(0, 0, w, HEADER_H);
  c.fillStyle = '#ffffff';
  c.font = FONT_BOLD(24);
  c.textAlign = 'left';
  c.fillText(title, PADDING, 36);
  c.font = FONT_REG(14);
  c.fillStyle = '#ffffffcc';
  c.fillText(subtitle, PADDING, 60);
}

function drawFooter(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  info: string,
): void {
  c.fillStyle = HEADER_BG;
  c.fillRect(0, h - FOOTER_H, w, FOOTER_H);
  c.fillStyle = TEXT_MUTED;
  c.font = FONT_REG(12);
  c.textAlign = 'left';
  c.fillText(info, PADDING, h - 14);
  c.fillStyle = '#9CA3AF';
  c.font = FONT_REG(11);
  const appName = 'MAG Judge Memo';
  c.textAlign = 'right';
  c.fillText(appName, w - PADDING, h - 14);
  c.textAlign = 'left';
}

function rankLabel(rank: number | undefined): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  if (typeof rank === 'number') return `${rank}位`;
  return '-';
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });
}

// ===== AAタブ用（試技会） =====

export interface AAApparatusEntry {
  d?: number;
  eFinal?: number;
  nd?: number;
  bonus: boolean;
  bonusValue?: number;
  final?: number;
}

export interface AAItem {
  rank: number | undefined;
  name: string;
  total: number | undefined;
  perApp: Partial<Record<Apparatus, AAApparatusEntry>>;
}

const AA_PER_PAGE = 3;
const AA_CARD_HEADER_H = 50;
const AA_TABLE_HEADER_H = 32;
const AA_TABLE_ROW_H = 32;
const AA_CARD_GAP = 16;
const AA_CARD_INNER_PAD = 16;

// AA 表の列定義（cardW = CANVAS_W - PADDING*2 = 1032 を想定）
const AA_COLS = [
  { key: 'app', label: '種目', w: 100, align: 'left' as const },
  { key: 'd', label: 'D', w: 150, align: 'right' as const },
  { key: 'eFinal', label: 'E決定', w: 200, align: 'right' as const },
  { key: 'nd', label: 'ND', w: 150, align: 'right' as const },
  { key: 'bonus', label: '加点', w: 130, align: 'right' as const },
  { key: 'final', label: '決定点', w: 270, align: 'right' as const },
];

function aaCardHeight(): number {
  return AA_CARD_HEADER_H + AA_TABLE_HEADER_H + AA_TABLE_ROW_H * 6 + AA_CARD_INNER_PAD;
}

function aaPageHeight(itemCount: number): number {
  return (
    HEADER_H +
    PADDING +
    itemCount * aaCardHeight() +
    Math.max(0, itemCount - 1) * AA_CARD_GAP +
    PADDING +
    FOOTER_H
  );
}

function drawAACard(
  c: CanvasRenderingContext2D,
  y: number,
  item: AAItem,
  decimals: number,
): number {
  const cardX = PADDING;
  const cardW = CANVAS_W - PADDING * 2;
  const cardH = aaCardHeight();

  // カード背景・枠
  c.fillStyle = '#ffffff';
  c.fillRect(cardX, y, cardW, cardH);

  // タイトル行
  const titleY = y + 32;
  let tx = cardX + AA_CARD_INNER_PAD;
  // 順位
  const rankText = rankLabel(item.rank);
  const isMedal = item.rank !== undefined && item.rank <= 3;
  c.font = isMedal ? FONT_REG(28) : FONT_BOLD(20);
  c.fillStyle = TEXT;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillText(rankText, tx, titleY);
  tx += c.measureText(rankText).width + 16;

  // 名前
  c.font = FONT_BOLD(20);
  c.fillStyle = TEXT;
  c.fillText(item.name, tx, titleY);

  // AA合計（右寄せ） — 決定点と同じく常に3桁
  const aaVal = formatScore(item.total, FINAL_SCORE_DECIMALS) || '-';
  c.font = FONT_BOLD(22);
  const aaValW = c.measureText(aaVal).width;
  c.font = FONT_REG(13);
  c.fillStyle = TEXT_MUTED;
  const aaLabel = 'AA合計';
  const aaLabelW = c.measureText(aaLabel).width;
  c.fillText(aaLabel, cardX + cardW - AA_CARD_INNER_PAD - aaValW - 8 - aaLabelW, titleY);
  c.font = FONT_BOLD(22);
  c.fillStyle = ACCENT;
  c.fillText(aaVal, cardX + cardW - AA_CARD_INNER_PAD - aaValW, titleY);

  // 表
  const tableX = cardX + AA_CARD_INNER_PAD;
  const tableY = y + AA_CARD_HEADER_H;
  const tableW = cardW - AA_CARD_INNER_PAD * 2;

  // 表ヘッダー
  c.fillStyle = ALT_ROW;
  c.fillRect(tableX, tableY, tableW, AA_TABLE_HEADER_H);
  c.font = FONT_BOLD(13);
  c.fillStyle = TEXT_MUTED;
  let cx = tableX;
  for (const col of AA_COLS) {
    if (col.align === 'left') {
      c.textAlign = 'left';
      c.fillText(col.label, cx + 12, tableY + 21);
    } else {
      c.textAlign = 'right';
      c.fillText(col.label, cx + col.w - 12, tableY + 21);
    }
    cx += col.w;
  }

  // 行
  for (let i = 0; i < APPARATUS_LIST.length; i++) {
    const a = APPARATUS_LIST[i];
    const e = item.perApp[a.code];
    const rowY = tableY + AA_TABLE_HEADER_H + AA_TABLE_ROW_H * i;

    if (i % 2 === 1) {
      c.fillStyle = ALT_ROW;
      c.fillRect(tableX, rowY, tableW, AA_TABLE_ROW_H);
    }

    cx = tableX;

    // 種目
    c.fillStyle = TEXT;
    c.font = FONT_BOLD(14);
    c.textAlign = 'left';
    c.fillText(a.code, cx + 12, rowY + 21);
    cx += AA_COLS[0].w;

    // 数値列
    c.font = FONT_MONO(13);
    c.fillStyle = TEXT;

    const dStr = e ? formatScore(e.d, 1) : '';
    c.textAlign = 'right';
    c.fillText(dStr, cx + AA_COLS[1].w - 12, rowY + 21);
    cx += AA_COLS[1].w;

    const eStr = e ? formatScore(e.eFinal, decimals) : '';
    c.fillText(eStr, cx + AA_COLS[2].w - 12, rowY + 21);
    cx += AA_COLS[2].w;

    const ndStr = e ? formatScore(e.nd ?? 0, 1) : '';
    c.fillText(ndStr, cx + AA_COLS[3].w - 12, rowY + 21);
    cx += AA_COLS[3].w;

    const bonusStr = formatBonus(e?.bonusValue ?? 0);
    c.fillStyle = e?.bonus ? SUCCESS : TEXT;
    c.font = FONT_MONO_BOLD(13);
    c.fillText(bonusStr, cx + AA_COLS[4].w - 12, rowY + 21);
    cx += AA_COLS[4].w;

    const finalStr = e ? formatScore(e.final, FINAL_SCORE_DECIMALS) : '';
    c.font = FONT_MONO_BOLD(15);
    c.fillStyle = ACCENT;
    c.fillText(finalStr, cx + AA_COLS[5].w - 12, rowY + 21);
  }
  c.textAlign = 'left';

  // カード枠
  c.strokeStyle = BORDER;
  c.lineWidth = 1;
  c.strokeRect(cardX + 0.5, y + 0.5, cardW - 1, cardH - 1);

  return y + cardH + AA_CARD_GAP;
}

async function renderAAPage(opts: {
  pageItems: AAItem[];
  pageIndex: number;
  totalPages: number;
  sessionName: string;
  sessionDate: Date;
  eJudgeCount: number;
}): Promise<Blob> {
  const decimals = opts.eJudgeCount <= 3 ? 2 : 3;
  const h = aaPageHeight(opts.pageItems.length);
  const { canvas, c } = setupCanvas(CANVAS_W, h);

  const pageInfo = opts.totalPages > 1 ? `  (${opts.pageIndex + 1}/${opts.totalPages})` : '';
  drawHeader(
    c,
    CANVAS_W,
    `🏆 AA総合ランキング${pageInfo}`,
    `${opts.sessionName}  /  ${formatJaDate(opts.sessionDate)}`,
  );

  let y = HEADER_H + PADDING;
  for (const item of opts.pageItems) {
    y = drawAACard(c, y, item, decimals);
  }

  drawFooter(c, CANVAS_W, h, `E審判 ${opts.eJudgeCount}名`);

  return canvasToBlob(canvas);
}

// ===== 種目別/大会用 中間表 =====

export interface ApparatusItem {
  rank: number | undefined;
  prefix?: string; // 大会モード: '#3' (ページ番号)
  name: string;
  team?: string; // 大会モード: 所属団体名
  d?: number;
  eFinal?: number;
  nd?: number;
  bonus: boolean;
  bonusValue?: number;
  final?: number;
}

const APP_PER_PAGE = 10;
const APP_TABLE_HEADER_H = 40;
const APP_TABLE_ROW_H = 42;

// 種目別/大会の列定義 (cardW = 1032)
function appCols(hasPrefix: boolean, hasTeam: boolean): { key: string; label: string; w: number; align: 'left' | 'right' }[] {
  // 順位 + (#プレフィックス) + 選手 + (団体) + D + E決定 + ND + 加点 + 決定点
  const cols: { key: string; label: string; w: number; align: 'left' | 'right' }[] = [];
  cols.push({ key: 'rank', label: '順位', w: 80, align: 'left' });
  if (hasPrefix) cols.push({ key: 'prefix', label: '#', w: 70, align: 'left' });
  // 選手列の幅は残りから算出
  const fixedRest = 130 + 170 + 130 + 110 + 170; // D + E決定 + ND + 加点 + 決定点
  const teamW = hasTeam ? 150 : 0;
  const tableW = CANVAS_W - PADDING * 2;
  const taken = cols.reduce((s, x) => s + x.w, 0);
  const nameW = tableW - taken - fixedRest - teamW;
  cols.push({ key: 'name', label: '選手', w: nameW, align: 'left' });
  if (hasTeam) cols.push({ key: 'team', label: '団体', w: teamW, align: 'left' });
  cols.push({ key: 'd', label: 'D', w: 130, align: 'right' });
  cols.push({ key: 'eFinal', label: 'E決定', w: 170, align: 'right' });
  cols.push({ key: 'nd', label: 'ND', w: 130, align: 'right' });
  cols.push({ key: 'bonus', label: '加点', w: 110, align: 'right' });
  cols.push({ key: 'final', label: '決定点', w: 170, align: 'right' });
  return cols;
}

function appPageHeight(itemCount: number): number {
  return (
    HEADER_H +
    PADDING +
    APP_TABLE_HEADER_H +
    APP_TABLE_ROW_H * itemCount +
    PADDING +
    FOOTER_H
  );
}

async function renderApparatusPage(opts: {
  pageItems: ApparatusItem[];
  pageIndex: number;
  totalPages: number;
  sessionName: string;
  sessionDate: Date;
  apparatus: Apparatus;
  apparatusName: string;
  eJudgeCount: number;
  hasPrefix: boolean; // 大会モード=true（# 列を出す）
  hasTeam: boolean;   // 団体登録があるセッション=true（団体 列を出す）
}): Promise<Blob> {
  const decimals = opts.eJudgeCount <= 3 ? 2 : 3;
  const h = appPageHeight(opts.pageItems.length);
  const { canvas, c } = setupCanvas(CANVAS_W, h);

  const pageInfo = opts.totalPages > 1 ? `  (${opts.pageIndex + 1}/${opts.totalPages})` : '';
  drawHeader(
    c,
    CANVAS_W,
    `🏆 ${opts.apparatus} ${opts.apparatusName} ランキング${pageInfo}`,
    `${opts.sessionName}  /  ${formatJaDate(opts.sessionDate)}`,
  );

  const cols = appCols(opts.hasPrefix, opts.hasTeam);
  const tableX = PADDING;
  const tableY = HEADER_H + PADDING;
  const tableW = CANVAS_W - PADDING * 2;

  // 表ヘッダー
  c.fillStyle = ALT_ROW;
  c.fillRect(tableX, tableY, tableW, APP_TABLE_HEADER_H);
  c.font = FONT_BOLD(13);
  c.fillStyle = TEXT_MUTED;
  let cx = tableX;
  for (const col of cols) {
    if (col.align === 'left') {
      c.textAlign = 'left';
      c.fillText(col.label, cx + 14, tableY + 26);
    } else {
      c.textAlign = 'right';
      c.fillText(col.label, cx + col.w - 14, tableY + 26);
    }
    cx += col.w;
  }

  // ヘッダー下の罫線
  c.strokeStyle = BORDER;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(tableX, tableY + APP_TABLE_HEADER_H + 0.5);
  c.lineTo(tableX + tableW, tableY + APP_TABLE_HEADER_H + 0.5);
  c.stroke();

  // 行
  for (let i = 0; i < opts.pageItems.length; i++) {
    const item = opts.pageItems[i];
    const rowY = tableY + APP_TABLE_HEADER_H + APP_TABLE_ROW_H * i;

    if (i % 2 === 1) {
      c.fillStyle = ALT_ROW;
      c.fillRect(tableX, rowY, tableW, APP_TABLE_ROW_H);
    }

    cx = tableX;
    for (const col of cols) {
      const cellY = rowY + 27;
      if (col.key === 'rank') {
        const rankText = rankLabel(item.rank);
        const isMedal = item.rank !== undefined && item.rank <= 3;
        c.font = isMedal ? FONT_REG(22) : FONT_BOLD(15);
        c.fillStyle = TEXT;
        c.textAlign = 'left';
        c.fillText(rankText, cx + 14, cellY);
      } else if (col.key === 'prefix') {
        c.font = FONT_BOLD(14);
        c.fillStyle = TEXT_MUTED;
        c.textAlign = 'left';
        c.fillText(item.prefix ?? '', cx + 14, cellY);
      } else if (col.key === 'name') {
        c.font = FONT_BOLD(16);
        c.fillStyle = TEXT;
        c.textAlign = 'left';
        c.fillText(item.name, cx + 14, cellY);
      } else if (col.key === 'team') {
        c.font = FONT_REG(13);
        c.fillStyle = TEXT_MUTED;
        c.textAlign = 'left';
        c.fillText(item.team ?? '-', cx + 14, cellY);
      } else if (col.key === 'd') {
        c.font = FONT_MONO(14);
        c.fillStyle = TEXT;
        c.textAlign = 'right';
        c.fillText(formatScore(item.d, 1), cx + col.w - 14, cellY);
      } else if (col.key === 'eFinal') {
        c.font = FONT_MONO(14);
        c.fillStyle = TEXT;
        c.textAlign = 'right';
        c.fillText(formatScore(item.eFinal, decimals), cx + col.w - 14, cellY);
      } else if (col.key === 'nd') {
        c.font = FONT_MONO(14);
        c.fillStyle = TEXT;
        c.textAlign = 'right';
        c.fillText(formatScore(item.nd ?? 0, 1), cx + col.w - 14, cellY);
      } else if (col.key === 'bonus') {
        c.font = FONT_MONO_BOLD(14);
        c.fillStyle = item.bonus ? SUCCESS : TEXT;
        c.textAlign = 'right';
        c.fillText(formatBonus(item.bonusValue ?? 0), cx + col.w - 14, cellY);
      } else if (col.key === 'final') {
        c.font = FONT_MONO_BOLD(17);
        c.fillStyle = ACCENT;
        c.textAlign = 'right';
        c.fillText(formatScore(item.final, FINAL_SCORE_DECIMALS), cx + col.w - 14, cellY);
      }
      cx += col.w;
    }
  }
  c.textAlign = 'left';

  // 表外枠
  c.strokeStyle = BORDER;
  c.lineWidth = 1;
  c.strokeRect(
    tableX + 0.5,
    tableY + 0.5,
    tableW - 1,
    APP_TABLE_HEADER_H + APP_TABLE_ROW_H * opts.pageItems.length - 1,
  );

  drawFooter(c, CANVAS_W, h, `E審判 ${opts.eJudgeCount}名`);

  return canvasToBlob(canvas);
}

// ===== ページ分割 + 共有 =====

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function shareOrDownloadFiles(files: File[], title: string): Promise<void> {
  if (files.length === 0) return;

  // Web Share API（複数ファイル対応）
  if (navigator.share && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title });
      return;
    } catch {
      // ユーザーキャンセル等
      return;
    }
  }

  // フォールバック: 逐次ダウンロード
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(url);
    await new Promise((r) => setTimeout(r, 200));
  }
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_');
}

// ----- 公開 API: AA共有 -----
export async function exportAARanking(opts: {
  sessionName: string;
  sessionDate: Date;
  eJudgeCount: number;
  items: AAItem[]; // ranked & filtered (rank が定義されているものだけを推奨)
}): Promise<{ shared: number }> {
  const ranked = opts.items.filter((it) => it.rank !== undefined);
  if (ranked.length === 0) return { shared: 0 };

  const pages = chunk(ranked, AA_PER_PAGE);
  const dateStr = formatJaDate(opts.sessionDate);
  const baseName = `${sanitizeFilename(opts.sessionName)}_AA総合_${dateStr}`;

  const files: File[] = [];
  for (let i = 0; i < pages.length; i++) {
    const blob = await renderAAPage({
      pageItems: pages[i],
      pageIndex: i,
      totalPages: pages.length,
      sessionName: opts.sessionName,
      sessionDate: opts.sessionDate,
      eJudgeCount: opts.eJudgeCount,
    });
    const name = pages.length === 1 ? `${baseName}.png` : `${baseName}_p${i + 1}.png`;
    files.push(new File([blob], name, { type: 'image/png' }));
  }

  await shareOrDownloadFiles(files, `${opts.sessionName} AA総合ランキング`);
  return { shared: files.length };
}

// ----- 公開 API: 種目別/大会共有 -----
export async function exportApparatusRanking(opts: {
  sessionName: string;
  sessionDate: Date;
  apparatus: Apparatus;
  eJudgeCount: number;
  hasPrefix: boolean; // 大会モード=true
  hasTeam?: boolean;  // 団体登録があるセッション=true
  items: ApparatusItem[];
}): Promise<{ shared: number }> {
  const ranked = opts.items.filter((it) => it.rank !== undefined);
  if (ranked.length === 0) return { shared: 0 };

  const apparatusName = APPARATUS_MAP[opts.apparatus].name;
  const pages = chunk(ranked, APP_PER_PAGE);
  const dateStr = formatJaDate(opts.sessionDate);
  const baseName = `${sanitizeFilename(opts.sessionName)}_${opts.apparatus}_${dateStr}`;

  const files: File[] = [];
  for (let i = 0; i < pages.length; i++) {
    const blob = await renderApparatusPage({
      pageItems: pages[i],
      pageIndex: i,
      totalPages: pages.length,
      sessionName: opts.sessionName,
      sessionDate: opts.sessionDate,
      apparatus: opts.apparatus,
      apparatusName,
      eJudgeCount: opts.eJudgeCount,
      hasPrefix: opts.hasPrefix,
      hasTeam: opts.hasTeam ?? false,
    });
    const name = pages.length === 1 ? `${baseName}.png` : `${baseName}_p${i + 1}.png`;
    files.push(new File([blob], name, { type: 'image/png' }));
  }

  await shareOrDownloadFiles(
    files,
    `${opts.sessionName} ${opts.apparatus}(${apparatusName}) ランキング`,
  );
  return { shared: files.length };
}

// ===== 団体ランキング =====
export interface TeamRankItem {
  rank: number | undefined;       // undefined = 参考表示
  teamName: string;
  memberCount: number;
  total: number | undefined;
  pickedValues: number[];
  benchValues: number[];
}

const TEAM_TABLE_HEADER_H = 36;
const TEAM_ROW_H = 38;
const TEAM_PER_PAGE = 12;

const TEAM_COLS = [
  { key: 'rank' as const, label: '順位', w: 90, align: 'left' as const },
  { key: 'name' as const, label: '団体', w: 360, align: 'left' as const },
  { key: 'members' as const, label: '人数', w: 100, align: 'right' as const },
  { key: 'picked' as const, label: '採用構成', w: 280, align: 'right' as const },
  { key: 'total' as const, label: '団体得点', w: 202, align: 'right' as const },
];

function teamPageHeight(itemCount: number): number {
  return HEADER_H + PADDING + TEAM_TABLE_HEADER_H + TEAM_ROW_H * itemCount + PADDING + FOOTER_H;
}

async function renderTeamPage(opts: {
  pageItems: TeamRankItem[];
  pageIndex: number;
  totalPages: number;
  sessionName: string;
  sessionDate: Date;
  apparatus: Apparatus;
  eJudgeCount: number;
  topN: number;
  metricLabel: string;
}): Promise<Blob> {
  const decimals = opts.eJudgeCount <= 3 ? 2 : 3;
  const h = teamPageHeight(opts.pageItems.length);
  const { canvas, c } = setupCanvas(CANVAS_W, h);

  const pageInfo = opts.totalPages > 1 ? ` (${opts.pageIndex + 1}/${opts.totalPages})` : '';
  const apparatusName = APPARATUS_MAP[opts.apparatus].name;
  drawHeader(
    c,
    CANVAS_W,
    `🏆 ${opts.apparatus} ${apparatusName} 団体ランキング${pageInfo}`,
    `${opts.sessionName}  /  ${formatJaDate(opts.sessionDate)}  /  上位${opts.topN}合計 (${opts.metricLabel})`,
  );

  const tableX = PADDING;
  const tableY = HEADER_H + PADDING;
  const tableW = CANVAS_W - PADDING * 2;

  // ヘッダー
  c.fillStyle = ALT_ROW;
  c.fillRect(tableX, tableY, tableW, TEAM_TABLE_HEADER_H);
  c.font = FONT_BOLD(13);
  c.fillStyle = TEXT_MUTED;
  let cx = tableX;
  for (const col of TEAM_COLS) {
    if (col.align === 'left') {
      c.textAlign = 'left';
      c.fillText(col.label, cx + 14, tableY + 26);
    } else {
      c.textAlign = 'right';
      c.fillText(col.label, cx + col.w - 14, tableY + 26);
    }
    cx += col.w;
  }
  c.strokeStyle = BORDER;
  c.beginPath();
  c.moveTo(tableX, tableY + TEAM_TABLE_HEADER_H + 0.5);
  c.lineTo(tableX + tableW, tableY + TEAM_TABLE_HEADER_H + 0.5);
  c.stroke();

  // 行
  for (let i = 0; i < opts.pageItems.length; i++) {
    const item = opts.pageItems[i];
    const isRef = item.rank === undefined;
    const rowY = tableY + TEAM_TABLE_HEADER_H + TEAM_ROW_H * i;

    if (i % 2 === 1) {
      c.fillStyle = ALT_ROW;
      c.fillRect(tableX, rowY, tableW, TEAM_ROW_H);
    }
    if (isRef) {
      c.fillStyle = '#f3f4f6cc';
      c.fillRect(tableX, rowY, tableW, TEAM_ROW_H);
    }

    cx = tableX;
    for (const col of TEAM_COLS) {
      const cellY = rowY + 26;
      if (col.key === 'rank') {
        const rankText = isRef ? '参考' : rankLabel(item.rank);
        const isMedal = !isRef && item.rank !== undefined && item.rank <= 3;
        c.font = isMedal ? FONT_REG(22) : FONT_BOLD(15);
        c.fillStyle = isRef ? TEXT_MUTED : TEXT;
        c.textAlign = 'left';
        c.fillText(rankText, cx + 14, cellY);
      } else if (col.key === 'name') {
        c.font = FONT_BOLD(17);
        c.fillStyle = isRef ? TEXT_MUTED : TEXT;
        c.textAlign = 'left';
        c.fillText(item.teamName, cx + 14, cellY);
        if (isRef) {
          c.font = FONT_REG(11);
          c.fillStyle = '#9CA3AF';
          c.fillText(`(${item.memberCount}名のみ)`, cx + 14 + c.measureText(item.teamName).width + 8, cellY);
        }
      } else if (col.key === 'members') {
        c.font = FONT_MONO(14);
        c.fillStyle = TEXT_MUTED;
        c.textAlign = 'right';
        c.fillText(String(item.memberCount), cx + col.w - 14, cellY);
      } else if (col.key === 'picked') {
        c.font = FONT_MONO(12);
        c.fillStyle = TEXT_MUTED;
        c.textAlign = 'right';
        const txt = item.pickedValues.map(v => formatScore(v, decimals)).join(' + ') || '-';
        c.fillText(txt, cx + col.w - 14, cellY);
      } else if (col.key === 'total') {
        c.font = FONT_MONO_BOLD(18);
        c.fillStyle = isRef ? TEXT_MUTED : ACCENT;
        c.textAlign = 'right';
        c.fillText(formatScore(item.total, decimals), cx + col.w - 14, cellY);
      }
      cx += col.w;
    }
  }
  c.textAlign = 'left';

  c.strokeStyle = BORDER;
  c.lineWidth = 1;
  c.strokeRect(
    tableX + 0.5,
    tableY + 0.5,
    tableW - 1,
    TEAM_TABLE_HEADER_H + TEAM_ROW_H * opts.pageItems.length - 1,
  );

  drawFooter(c, CANVAS_W, h, `E審判 ${opts.eJudgeCount}名 / 集計: 上位${opts.topN}合計`);
  return canvasToBlob(canvas);
}

// ----- 公開 API: 団体ランキング共有 -----
export async function exportTeamRanking(opts: {
  sessionName: string;
  sessionDate: Date;
  apparatus: Apparatus;
  eJudgeCount: number;
  topN: number;
  metricLabel: string;
  items: TeamRankItem[];
}): Promise<{ shared: number }> {
  if (opts.items.length === 0) return { shared: 0 };

  const pages = chunk(opts.items, TEAM_PER_PAGE);
  const apparatusName = APPARATUS_MAP[opts.apparatus].name;
  const dateStr = formatJaDate(opts.sessionDate);
  const baseName = `${sanitizeFilename(opts.sessionName)}_${opts.apparatus}_団体_${dateStr}`;

  const files: File[] = [];
  for (let i = 0; i < pages.length; i++) {
    const blob = await renderTeamPage({
      pageItems: pages[i],
      pageIndex: i,
      totalPages: pages.length,
      sessionName: opts.sessionName,
      sessionDate: opts.sessionDate,
      apparatus: opts.apparatus,
      eJudgeCount: opts.eJudgeCount,
      topN: opts.topN,
      metricLabel: opts.metricLabel,
    });
    const name = pages.length === 1 ? `${baseName}.png` : `${baseName}_p${i + 1}.png`;
    files.push(new File([blob], name, { type: 'image/png' }));
  }

  await shareOrDownloadFiles(files, `${opts.sessionName} ${opts.apparatus}(${apparatusName}) 団体ランキング`);
  return { shared: files.length };
}
