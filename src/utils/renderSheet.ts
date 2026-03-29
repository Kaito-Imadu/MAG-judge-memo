/**
 * JudgeSheet と完全に同じテンプレート描画ロジック。
 * JudgeSheet.tsx の drawTemplate と同一の定数・描画手順を使い、
 * エクスポート画像が実際の採点画面とピクセル単位で一致するようにする。
 */
import type { Apparatus } from '../types';
import type { StrokeData } from '../db/database';
import { APPARATUS_LIST } from '../constants/apparatus';
import { getNDChecklist } from '../constants/deductions';

// JudgeSheet と同じ定数
const LABEL_H = 52;
const SCORE_ROW_H = 160;
const CV_LABEL_H = 28;
const ND_WIDTH_RATIO = 0.2;
const LINE_WIDTH = 2;

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
  vaultImg?: HTMLImageElement | null;
}

/**
 * オフスクリーン Canvas に、JudgeSheet と同じテンプレート＋ストロークを描画して返す。
 * 返される Canvas は CSS ピクセルサイズ (w × h) で描画済み。
 */
export function renderSheetCanvas(opts: RenderOptions): HTMLCanvasElement {
  const { w, h, apparatus, eJudgeCount, mode, athleteName, strokes, vaultImg } = opts;
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

  const scoreH = SCORE_ROW_H;
  const ndW = hasND ? Math.floor(w * ND_WIDTH_RATIO) : 0;
  const mainW = w - ndW;
  const scoreRowTop = h - scoreH;

  c.save();

  // --- モード別ヘッダー領域 ---
  if (mode === 'trial' || mode === 'individual') {
    c.fillStyle = '#1B4F72';
    c.font = 'bold 16px "Noto Sans JP", sans-serif';
    const label = `${athleteName}\u3000${apparatus} ${apparatusInfo?.name ?? ''}`;
    c.fillText(label, 10, LABEL_H / 2 + 6);
    c.strokeStyle = '#ddd';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(0, LABEL_H);
    c.lineTo(w, LABEL_H);
    c.stroke();
  } else {
    c.fillStyle = '#1B4F72';
    c.font = 'bold 16px "Noto Sans JP", sans-serif';
    const apparatusLabel = `${apparatus} ${apparatusInfo?.name ?? ''}`;
    c.fillText(apparatusLabel, 10, LABEL_H / 2 + 6);
    const boxX = c.measureText(apparatusLabel).width + 28;
    const boxY = (LABEL_H - 44) / 2;
    c.strokeStyle = '#888';
    c.lineWidth = 1.5;
    c.strokeRect(boxX, boxY, 360, 44);
    c.fillStyle = '#ccc';
    c.font = '12px "Noto Sans JP", sans-serif';
    c.fillText('選手名 / No.', boxX + 8, boxY + 14);
    c.strokeStyle = '#ddd';
    c.lineWidth = 0.5;
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

  // --- CV ラベル ---
  if (hasCV) {
    const cvTop = scoreRowTop - CV_LABEL_H;
    c.strokeStyle = '#999';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, cvTop);
    c.lineTo(w * 0.3, cvTop);
    c.stroke();
    c.fillStyle = '#888';
    c.font = '12px "Noto Sans JP", sans-serif';
    c.fillText('CV：', 6, cvTop + 18);
  }

  // --- スコア行 ---
  c.strokeStyle = '#222';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, scoreRowTop);
  c.lineTo(w, scoreRowTop);
  c.stroke();

  const cols: string[] = ['D'];
  for (let i = 0; i < eJudgeCount; i++) {
    cols.push(i === 0 ? 'E1' : `E${i + 1}`);
  }
  cols.push('ND', '決定点');

  const colCount = cols.length;
  const lastColRatio = 1.4;
  const normalCols = colCount - 1;
  const unit = w / (normalCols + lastColRatio);
  let x = 0;
  c.lineWidth = 1;
  c.strokeStyle = '#444';
  for (let i = 0; i < colCount; i++) {
    const colW = i === colCount - 1 ? unit * lastColRatio : unit;
    if (i > 0) {
      c.beginPath();
      c.moveTo(x, scoreRowTop);
      c.lineTo(x, h);
      c.stroke();
    }
    c.fillStyle = '#999';
    c.font = '10px "Noto Sans JP", sans-serif';
    c.fillText(cols[i], x + 4, scoreRowTop + 12);
    x += colW;
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
