/**
 * JudgeSheet と同じテンプレート描画ロジック（PNGエクスポート用）。
 * v4 でスコア行は HTML/React UI に移行したため、エクスポート時は
 * 共有画像に2段スコアバーとして焼き込む。
 */
import type { Apparatus, DigitalScores } from '../types';
import type { StrokeData } from '../db/database';
import { APPARATUS_LIST } from '../constants/apparatus';
import { getNDChecklist } from '../constants/deductions';
import { calcFinal, getEFinal, formatScore, formatNatural, eFinalDecimals, FINAL_SCORE_DECIMALS, isBonusApplicable } from './scoreCalc';

// JudgeSheet と同じ定数
const LABEL_H = 52;
// PNG下部にデジタルスコア表示用の領域。Canvas表示と異なり、エクスポートにはスコアを焼き込む。
export const SHEET_SCORE_FOOTER_H = 80;
const SCORE_E_ROW_H = 36;
const CV_LABEL_H = 28;
const ND_WIDTH_RATIO = 0.2;
const LINE_WIDTH = 2;
const HLINE_LEFT_MARGIN = 10;

interface HLine { y: number; right: number }

// 跳馬画像キャッシュ
let vaultImgCache: HTMLImageElement | null = null;
let vaultImgLoading: Promise<HTMLImageElement | null> | null = null;

function loadVaultImage(): Promise<HTMLImageElement | null> {
  if (vaultImgCache) return Promise.resolve(vaultImgCache);
  if (vaultImgLoading) return vaultImgLoading;
  vaultImgLoading = new Promise((resolve) => {
    const img = new Image();
    img.src = (import.meta.env.BASE_URL || '/') + 'vault_image.jpeg';
    img.onload = () => { vaultImgCache = img; resolve(img); };
    img.onerror = () => resolve(null);
  });
  return vaultImgLoading;
}

interface RenderOptions {
  w: number;
  h: number;
  apparatus: Apparatus;
  eJudgeCount: number;
  mode: 'trial' | 'competition' | 'individual';
  athleteName: string;
  strokes: StrokeData[];
  lines?: HLine[];
  vaultImg?: HTMLImageElement | null;
  digitalScores?: DigitalScores;
  digitalAthleteName?: string;
  renderScale?: number;
}

interface ScoreCell {
  label: string;
  value: string;
  missing?: boolean;
  strong?: boolean;
}

function drawScoreCell(
  c: CanvasRenderingContext2D,
  cell: ScoreCell,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  c.fillStyle = cell.missing ? '#FEF2F2' : cell.strong ? '#EFF6FF' : '#ffffff';
  c.fillRect(x, y, w, h);
  c.strokeStyle = cell.missing ? '#EF4444' : '#D1D5DB';
  c.lineWidth = cell.missing ? 1.5 : 1;
  c.strokeRect(x, y, w, h);

  c.fillStyle = cell.missing ? '#B91C1C' : '#6B7280';
  c.font = 'bold 10px "Noto Sans JP", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.fillText(cell.label, x + w / 2, y + 13);

  c.fillStyle = cell.missing ? '#DC2626' : cell.strong ? '#1B4F72' : '#111827';
  c.font = cell.strong
    ? 'bold 16px "Noto Sans JP", sans-serif'
    : 'bold 14px "Noto Sans JP", sans-serif';
  c.fillText(cell.missing ? '未入力' : cell.value, x + w / 2, y + h - 9);
}

function drawScoreRow(
  c: CanvasRenderingContext2D,
  cells: ScoreCell[],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (cells.length === 0) return;
  const cellW = w / cells.length;
  cells.forEach((cell, i) => {
    drawScoreCell(c, cell, x + cellW * i, y, cellW, h);
  });
}

function drawScoreFooter(
  c: CanvasRenderingContext2D,
  opts: {
    w: number;
    scoreRowTop: number;
    apparatus: Apparatus;
    eJudgeCount: number;
    digitalScores?: DigitalScores;
  },
): void {
  const { w, scoreRowTop, apparatus, eJudgeCount, digitalScores } = opts;
  const eArr = (() => {
    const src = digitalScores?.e ?? [];
    const arr = src.slice(0, eJudgeCount);
    while (arr.length < eJudgeCount) arr.push(undefined);
    return arr;
  })();

  const eFinalVal = digitalScores ? getEFinal(digitalScores) : undefined;
  const finalVal = digitalScores ? calcFinal(digitalScores, apparatus) : undefined;
  const decimals = eFinalDecimals(eArr);
  const bonusEnabled = isBonusApplicable(apparatus);

  c.save();
  c.fillStyle = '#ffffff';
  c.fillRect(0, scoreRowTop, w, SHEET_SCORE_FOOTER_H);
  c.strokeStyle = '#111827';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, scoreRowTop);
  c.lineTo(w, scoreRowTop);
  c.stroke();

  if (eJudgeCount > 0) {
    drawScoreRow(
      c,
      eArr.map((v, i) => ({
        label: `E${i + 1}`,
        value: formatNatural(v, 3),
        missing: typeof v !== 'number',
      })),
      0,
      scoreRowTop,
      w,
      SCORE_E_ROW_H,
    );
  }

  const lowerTop = scoreRowTop + (eJudgeCount > 0 ? SCORE_E_ROW_H : 0);
  const lowerH = SHEET_SCORE_FOOTER_H - (eJudgeCount > 0 ? SCORE_E_ROW_H : 0);
  const lowerCells: ScoreCell[] = [
    {
      label: 'D',
      value: formatScore(digitalScores?.d, 1),
      missing: typeof digitalScores?.d !== 'number',
    },
    {
      label: 'E決定',
      value: formatScore(eFinalVal, decimals),
      missing: typeof eFinalVal !== 'number',
    },
    {
      label: 'ND',
      value: formatScore(digitalScores?.nd, 1),
      missing: typeof digitalScores?.nd !== 'number',
    },
  ];

  if (bonusEnabled) {
    lowerCells.push({
      label: '加点',
      value: digitalScores?.bonus ? '+0.1' : 'OFF',
    });
  }

  lowerCells.push({
    label: '決定点',
    value: formatScore(finalVal, FINAL_SCORE_DECIMALS),
    missing: typeof finalVal !== 'number',
    strong: true,
  });

  drawScoreRow(c, lowerCells, 0, lowerTop, w, lowerH);
  c.restore();
}

/**
 * オフスクリーン Canvas に、JudgeSheet と同じテンプレート＋ストロークを描画して返す。
 * 返される Canvas は CSS ピクセルサイズ (w × (h + スコアバー高)) で描画済み。
 */
export function renderSheetCanvas(opts: RenderOptions): HTMLCanvasElement {
  const { w, h, apparatus, eJudgeCount, mode, athleteName, strokes, lines, vaultImg, digitalScores, digitalAthleteName, renderScale = 1 } = opts;
  const outH = h + SHEET_SCORE_FOOTER_H;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * renderScale);
  canvas.height = Math.ceil(outH * renderScale);
  const c = canvas.getContext('2d')!;
  c.scale(renderScale, renderScale);

  // 白背景
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, outH);

  const hasND = getNDChecklist(apparatus).length > 0;
  const ndItems = getNDChecklist(apparatus);
  const hasCV = apparatus === 'FX' || apparatus === 'HB';
  const apparatusInfo = APPARATUS_LIST.find(a => a.code === apparatus);

  const ndW = hasND ? Math.floor(w * ND_WIDTH_RATIO) : 0;
  const mainW = w - ndW;
  // 保存済みCanvas本体の下に、共有画像用のスコアバーを追加する。
  const scoreRowTop = h;

  c.save();

  // --- モード別ヘッダー領域 ---
  if (mode === 'trial' || mode === 'individual') {
    c.fillStyle = '#1B4F72';
    c.font = 'bold 16px "Noto Sans JP", sans-serif';
    const label = `${athleteName} ${apparatus} ${apparatusInfo?.name ?? ''}`;
    c.fillText(label, 10, LABEL_H / 2 + 6);
    c.strokeStyle = '#aaa';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, LABEL_H);
    c.lineTo(w, LABEL_H);
    c.stroke();
  } else {
    c.fillStyle = '#1B4F72';
    c.font = 'bold 16px "Noto Sans JP", sans-serif';
    const apparatusLabel = `${apparatus} ${apparatusInfo?.name ?? ''}`;
    c.fillText(apparatusLabel, 10, LABEL_H / 2 + 6);
    const labelW = c.measureText(apparatusLabel).width;
    if (digitalAthleteName && digitalAthleteName.trim()) {
      c.fillStyle = '#1B4F72';
      c.font = 'bold 20px "Noto Sans JP", sans-serif';
      c.fillText(digitalAthleteName, 10 + labelW + 24, LABEL_H / 2 + 7);
    }
    c.strokeStyle = '#aaa';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, LABEL_H);
    c.lineTo(w, LABEL_H);
    c.stroke();
  }

  // --- 跳馬画像（VT のみ） ---
  if (apparatus === 'VT' && vaultImg) {
    const drawAreaTop = LABEL_H;
    const drawAreaBottom = scoreRowTop;
    const drawAreaH = drawAreaBottom - drawAreaTop;
    const drawAreaW = mainW;
    const fitScale = Math.min(
      (drawAreaW * 0.8) / vaultImg.width,
      (drawAreaH * 0.8) / vaultImg.height,
    );
    const imgW = Math.ceil(vaultImg.width * fitScale);
    const imgH = Math.ceil(vaultImg.height * fitScale);
    const cx = drawAreaW / 2;
    const cy = drawAreaTop + drawAreaH / 2;

    c.save();
    c.globalAlpha = 0.25;
    c.translate(cx, cy);
    c.drawImage(vaultImg, -imgW / 2, -imgH / 2, imgW, imgH);
    c.restore();
  }

  // --- ND 項目（右下） ---
  if (hasND) {
    c.fillStyle = '#555';
    c.font = '12px "Noto Sans JP", sans-serif';
    const ndTotalH = ndItems.length * 28;
    const ndStartY = scoreRowTop - ndTotalH - 8;
    ndItems.forEach((item, i) => {
      const y = ndStartY + i * 28;
      c.fillText(`□ ${item.label}`, mainW + 10, y);
    });
    c.fillStyle = '#666';
    c.font = 'bold 13px "Noto Sans JP", sans-serif';
    c.fillText('ND', mainW + 8, ndStartY - 14);
  }

  // --- 横線（VT以外、ハンドルなし） ---
  if (apparatus !== 'VT' && lines && lines.length > 0) {
    c.strokeStyle = '#000000';
    c.lineWidth = 1.5;
    for (const hl of lines) {
      c.beginPath();
      c.moveTo(HLINE_LEFT_MARGIN, hl.y);
      c.lineTo(hl.right, hl.y);
      c.stroke();
    }
  }

  // --- CV ラベル ---
  if (hasCV) {
    const cvTop = scoreRowTop - CV_LABEL_H;
    c.strokeStyle = '#999';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, cvTop);
    c.lineTo(w * 0.3, cvTop);
    c.stroke();
    c.fillStyle = '#888';
    c.font = '12px "Noto Sans JP", sans-serif';
    c.fillText('CV：', 6, cvTop + 18);
  }

  c.restore();

  // --- ストローク描画（ベジェ曲線 — JudgeSheet と同一） ---
  for (const s of strokes) {
    const pts = s.points;
    if (pts.length < 2) continue;
    c.strokeStyle = s.color;
    c.lineWidth = s.width ?? LINE_WIDTH;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.globalCompositeOperation = 'source-over';
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);

    if (pts.length === 2) {
      c.lineTo(pts[1].x, pts[1].y);
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        const curr = pts[i];
        const next = pts[i + 1];
        if (i === pts.length - 2) {
          c.quadraticCurveTo(curr.x, curr.y, next.x, next.y);
        } else {
          const mx = (curr.x + next.x) / 2;
          const my = (curr.y + next.y) / 2;
          c.quadraticCurveTo(curr.x, curr.y, mx, my);
        }
      }
    }
    c.stroke();
  }

  drawScoreFooter(c, {
    w,
    scoreRowTop,
    apparatus,
    eJudgeCount,
    digitalScores,
  });

  return canvas;
}

export { loadVaultImage };
