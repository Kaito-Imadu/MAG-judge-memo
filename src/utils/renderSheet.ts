/**
 * JudgeSheet と同じテンプレート描画ロジック（PNGエクスポート用）。
 * v4 でスコア行は HTML/React UI に移行したため、エクスポート時は
 * デジタルスコアをテキストとして下端に1行で描画する。
 */
import type { Apparatus, DigitalScores } from '../types';
import type { StrokeData } from '../db/database';
import { APPARATUS_LIST } from '../constants/apparatus';
import { getNDChecklist } from '../constants/deductions';
import { calcFinal, getEFinal, formatScore, formatNatural, eFinalDecimals, FINAL_SCORE_DECIMALS } from './scoreCalc';

// JudgeSheet と同じ定数
const LABEL_H = 52;
// PNG下部にデジタルスコア表示用の領域（1行）。Canvas表示と異なり、エクスポートにはスコアを焼き込む。
const SCORE_FOOTER_H = 36;
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
}

/**
 * オフスクリーン Canvas に、JudgeSheet と同じテンプレート＋ストロークを描画して返す。
 * 返される Canvas は CSS ピクセルサイズ (w × h) で描画済み。
 */
export function renderSheetCanvas(opts: RenderOptions): HTMLCanvasElement {
  const { w, h, apparatus, eJudgeCount, mode, athleteName, strokes, lines, vaultImg, digitalScores, digitalAthleteName } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;

  // 白背景
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);

  const hasND = getNDChecklist(apparatus).length > 0;
  const ndItems = getNDChecklist(apparatus);
  const hasCV = apparatus === 'FX' || apparatus === 'HB';
  const apparatusInfo = APPARATUS_LIST.find(a => a.code === apparatus);

  const ndW = hasND ? Math.floor(w * ND_WIDTH_RATIO) : 0;
  const mainW = w - ndW;
  // スコアフッター用の下端領域。デジタルスコアがあれば焼き込む。
  const scoreRowTop = h - SCORE_FOOTER_H;

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

  // --- デジタルスコアフッター ---
  c.strokeStyle = '#222';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, scoreRowTop);
  c.lineTo(w, scoreRowTop);
  c.stroke();

  // E配列を eJudgeCount 長に正規化
  const eArr: (number | undefined)[] = (() => {
    const src = digitalScores?.e ?? [];
    const arr = src.slice(0, eJudgeCount);
    while (arr.length < eJudgeCount) arr.push(undefined);
    return arr;
  })();
  const eFinalVal = digitalScores ? getEFinal(digitalScores) : undefined;
  const finalVal = digitalScores ? calcFinal(digitalScores, apparatus) : undefined;

  const parts: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: 'D', value: formatScore(digitalScores?.d, 1) },
  ];
  for (let i = 0; i < eJudgeCount; i++) {
    parts.push({ label: `E${i + 1}`, value: formatNatural(eArr[i], 3) });
  }
  const decimals = eFinalDecimals(eArr);
  parts.push({ label: 'E決定', value: formatScore(eFinalVal, decimals) });
  parts.push({ label: 'ND', value: formatScore(digitalScores?.nd, 1) });
  if (digitalScores?.bonus) parts.push({ label: '加点', value: '+0.1' });
  parts.push({ label: '決定点', value: formatScore(finalVal, FINAL_SCORE_DECIMALS), bold: true });

  // 大会モードではデジタル選手名を左端に。
  const namePrefix = (mode === 'competition' && digitalAthleteName) ? `${digitalAthleteName}：` : '';

  c.fillStyle = '#222';
  c.font = '11px "Noto Sans JP", sans-serif';
  let textX = 8;
  const textY = scoreRowTop + SCORE_FOOTER_H / 2 + 4;
  if (namePrefix) {
    c.fillStyle = '#1B4F72';
    c.font = 'bold 13px "Noto Sans JP", sans-serif';
    c.fillText(namePrefix, textX, textY);
    textX += c.measureText(namePrefix).width + 4;
  }
  for (const p of parts) {
    c.fillStyle = '#888';
    c.font = '10px "Noto Sans JP", sans-serif';
    c.fillText(p.label, textX, textY - 8);
    c.fillStyle = p.bold ? '#1B4F72' : '#222';
    c.font = p.bold ? 'bold 14px "Noto Sans JP", sans-serif' : '13px "Noto Sans JP", sans-serif';
    const valText = p.value || '―';
    c.fillText(valText, textX, textY + 6);
    const labelW = c.measureText(p.label).width;
    const valW = c.measureText(valText).width;
    textX += Math.max(labelW, valW) + 14;
    if (textX > w - 20) break;
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

  return canvas;
}

export { loadVaultImage };
