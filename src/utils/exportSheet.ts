import { db } from '../db/database';
import type { MemoRecord, StrokeData } from '../db/database';
import type { Apparatus } from '../types';
import { APPARATUS_LIST } from '../constants/apparatus';
import { getNDChecklist } from '../constants/deductions';

// ---------- 6種目シート用定数 ----------
const EXPORT_W = 1200;
const EXPORT_H = 1800;
const HEADER_H = 100;
const COLS = 2;
const ROWS = 3;
const CELL_W = EXPORT_W / COLS;
const CELL_H = (EXPORT_H - HEADER_H) / ROWS;
const CELL_PAD = 12;

// ---------- 単一種目シート用定数 ----------
const SINGLE_W = 1200;
const SINGLE_H = 900;
const SINGLE_HEADER_H = 80;
const SINGLE_PAD = 16;

// ---------- JudgeSheet と同じ比率のレイアウト定数 ----------
// JudgeSheet: LABEL_H=52, SCORE_ROW_H=160, ND_WIDTH_RATIO=0.2, lastColRatio=1.4
// iPad landscape canvas ≈ 700px height を基準に比率を算出
const LABEL_H_RATIO = 52 / 700;       // ~7.4%
const SCORE_ROW_H_RATIO = 160 / 700;  // ~22.9%
const ND_WIDTH_RATIO = 0.2;
const LAST_COL_RATIO = 1.4;

const APPARATUS_ORDER: Apparatus[] = ['FX', 'PH', 'SR', 'VT', 'PB', 'HB'];

// ---------- セルテンプレート描画（比率修正版） ----------
function drawCellTemplate(
  c: CanvasRenderingContext2D,
  x: number, y: number,
  cellW: number, cellH: number,
  pad: number,
  apparatus: Apparatus,
  eJudgeCount: number,
) {
  const innerW = cellW - pad * 2;
  const innerH = cellH - pad * 2;
  const labelH = Math.round(innerH * LABEL_H_RATIO);
  const scoreRowH = Math.round(innerH * SCORE_ROW_H_RATIO);
  const ndW = Math.round(innerW * ND_WIDTH_RATIO);
  const mainW = innerW - ndW;
  const scoreTop = y + cellH - pad - scoreRowH;

  // 枠線
  c.strokeStyle = '#ccc';
  c.lineWidth = 1;
  c.strokeRect(x + pad, y + pad, innerW, innerH);

  // 種目ヘッダー
  const info = APPARATUS_LIST.find(a => a.code === apparatus);
  c.fillStyle = '#1B4F72';
  const headerFontSize = Math.max(12, Math.round(labelH * 0.5));
  c.font = `bold ${headerFontSize}px "Noto Sans JP", sans-serif`;
  c.fillText(`${apparatus}  ${info?.name ?? ''}`, x + pad + 8, y + pad + labelH * 0.65);

  // ヘッダー下線
  c.strokeStyle = '#ddd';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x + pad, y + pad + labelH);
  c.lineTo(x + cellW - pad, y + pad + labelH);
  c.stroke();

  // ND項目（右側 — JudgeSheet と同じ比率で配置、枠内にクリップ）
  const ndItems = getNDChecklist(apparatus);
  if (ndItems.length > 0) {
    c.save();
    // ND領域をクリップして枠外にはみ出さないようにする
    const ndX = x + pad + mainW;
    const ndAreaTop = y + pad + labelH + 4;
    const ndAreaBottom = scoreTop - 4;
    c.beginPath();
    c.rect(ndX, ndAreaTop, ndW, ndAreaBottom - ndAreaTop);
    c.clip();

    const ndFontSize = Math.max(7, Math.min(9, Math.round((ndAreaBottom - ndAreaTop) / ndItems.length * 0.5)));
    const ndLineH = Math.round((ndAreaBottom - ndAreaTop) / Math.max(ndItems.length, 1));

    // NDラベル
    c.fillStyle = '#666';
    c.font = `bold ${ndFontSize + 1}px "Noto Sans JP", sans-serif`;
    c.fillText('ND', ndX + 4, ndAreaTop + ndFontSize + 2);

    c.fillStyle = '#888';
    c.font = `${ndFontSize}px "Noto Sans JP", sans-serif`;
    ndItems.forEach((item, i) => {
      const ny = ndAreaTop + ndFontSize + 8 + i * ndLineH;
      c.fillText(`□ ${item.label}`, ndX + 4, ny + ndFontSize);
    });
    c.restore();
  }

  // スコア行区切り線
  c.strokeStyle = '#444';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x + pad, scoreTop);
  c.lineTo(x + cellW - pad, scoreTop);
  c.stroke();

  // スコア列（JudgeSheet と同じ lastColRatio=1.4 を使用）
  const cols: string[] = ['D'];
  for (let i = 0; i < eJudgeCount; i++) cols.push(i === 0 ? 'E1' : `E${i + 1}`);
  cols.push('ND', '決定点');

  const colCount = cols.length;
  const normalCols = colCount - 1;
  const unit = innerW / (normalCols + LAST_COL_RATIO);
  const labelFontSize = Math.max(7, Math.round(scoreRowH * 0.08));

  let cx = x + pad;
  c.lineWidth = 0.5;
  c.strokeStyle = '#888';
  c.fillStyle = '#999';
  c.font = `${labelFontSize}px "Noto Sans JP", sans-serif`;
  for (let i = 0; i < colCount; i++) {
    const colW = i === colCount - 1 ? unit * LAST_COL_RATIO : unit;
    if (i > 0) {
      c.beginPath();
      c.moveTo(cx, scoreTop);
      c.lineTo(cx, y + cellH - pad);
      c.stroke();
    }
    c.fillText(cols[i], cx + 3, scoreTop + labelFontSize + 2);
    cx += colW;
  }
}

// ---------- ストローク描画 ----------
function drawStrokes(
  c: CanvasRenderingContext2D,
  strokes: StrokeData[],
  offsetX: number, offsetY: number,
  scaleX: number, scaleY: number,
) {
  for (const s of strokes) {
    const pts = s.points;
    if (pts.length < 2) continue;
    c.strokeStyle = s.color;
    c.lineWidth = (s.width ?? 2) * Math.min(scaleX, scaleY);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    const sx = (x: number) => offsetX + x * scaleX;
    const sy = (y: number) => offsetY + y * scaleY;
    c.moveTo(sx(pts[0].x), sy(pts[0].y));

    if (pts.length === 2) {
      c.lineTo(sx(pts[1].x), sy(pts[1].y));
    } else {
      for (let i = 0; i < pts.length - 1; i++) {
        const curr = pts[i];
        const next = pts[i + 1];
        if (i === pts.length - 2) {
          c.quadraticCurveTo(sx(curr.x), sy(curr.y), sx(next.x), sy(next.y));
        } else {
          const mx = (curr.x + next.x) / 2;
          const my = (curr.y + next.y) / 2;
          c.quadraticCurveTo(sx(curr.x), sy(curr.y), sx(mx), sy(my));
        }
      }
    }
    c.stroke();
  }
}

// ストロークの元キャンバスサイズを推定し、ターゲットサイズへの均一スケールを計算
function calcStrokeScale(
  strokes: StrokeData[],
  targetW: number, targetH: number,
): { scaleX: number; scaleY: number } {
  // ストロークの最大座標から元のキャンバスサイズを推定
  let maxX = 0, maxY = 0;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (maxX === 0 || maxY === 0) return { scaleX: 1, scaleY: 1 };

  // 元のキャンバスのアスペクト比を維持して均一スケーリング
  // iPad landscape の典型的なアスペクト比（メモ領域）を使用
  const sourceAspect = maxX / maxY;
  const targetAspect = targetW / targetH;

  let scaleX: number, scaleY: number;
  if (sourceAspect > targetAspect) {
    // 横長 → 幅に合わせる
    scaleX = targetW / maxX;
    scaleY = scaleX;
  } else {
    // 縦長 → 高さに合わせる
    scaleY = targetH / maxY;
    scaleX = scaleY;
  }
  return { scaleX, scaleY };
}

// ---------- 6種目シートエクスポート ----------
export async function exportAthleteSheet(
  sessionId: string,
  athleteName: string,
  sessionName: string,
  eJudgeCount: number,
): Promise<Blob> {
  const allRecords = await db.memoRecords
    .where('sessionId').equals(sessionId)
    .toArray();
  const recordMap = new Map<Apparatus, MemoRecord>();
  for (const r of allRecords) {
    if (r.athleteName === athleteName) {
      recordMap.set(r.apparatus, r);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_W;
  canvas.height = EXPORT_H;
  const c = canvas.getContext('2d')!;

  // 背景
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, EXPORT_W, EXPORT_H);

  // ヘッダー
  c.fillStyle = '#1B4F72';
  c.fillRect(0, 0, EXPORT_W, HEADER_H);
  c.fillStyle = '#ffffff';
  c.font = 'bold 28px "Noto Sans JP", sans-serif';
  c.fillText(athleteName, 24, 42);
  c.font = '16px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffffcc';
  c.fillText(`${sessionName}  /  ${new Date().toLocaleDateString('ja-JP')}`, 24, 72);
  c.font = '12px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffff88';
  c.fillText('MAG Judge Memo', EXPORT_W - 140, 72);

  // 各種目セル
  for (let i = 0; i < APPARATUS_ORDER.length; i++) {
    const apparatus = APPARATUS_ORDER[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cellX = col * CELL_W;
    const cellY = HEADER_H + row * CELL_H;

    drawCellTemplate(c, cellX, cellY, CELL_W, CELL_H, CELL_PAD, apparatus, eJudgeCount);

    const record = recordMap.get(apparatus);
    if (record && record.strokes.length > 0) {
      const innerW = CELL_W - CELL_PAD * 2;
      const innerH = CELL_H - CELL_PAD * 2;
      const { scaleX, scaleY } = calcStrokeScale(record.strokes, innerW, innerH);

      c.save();
      c.beginPath();
      c.rect(cellX + CELL_PAD, cellY + CELL_PAD, innerW, innerH);
      c.clip();
      drawStrokes(c, record.strokes, cellX + CELL_PAD, cellY + CELL_PAD, scaleX, scaleY);
      c.restore();
    } else {
      c.fillStyle = '#ddd';
      c.font = '14px "Noto Sans JP", sans-serif';
      c.fillText('未採点', cellX + CELL_W / 2 - 20, cellY + CELL_H / 2);
    }
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

// ---------- 単一種目シートエクスポート（個別モード用） ----------
export async function exportSingleSheet(
  sessionId: string,
  athleteName: string,
  apparatus: Apparatus,
  sessionName: string,
  eJudgeCount: number,
): Promise<Blob> {
  const recordId = `individual:${sessionId}:${athleteName}:${apparatus}`;
  const record = await db.memoRecords.get(recordId);

  const canvas = document.createElement('canvas');
  canvas.width = SINGLE_W;
  canvas.height = SINGLE_H;
  const c = canvas.getContext('2d')!;

  // 背景
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, SINGLE_W, SINGLE_H);

  // ヘッダー
  const info = APPARATUS_LIST.find(a => a.code === apparatus);
  c.fillStyle = '#1B4F72';
  c.fillRect(0, 0, SINGLE_W, SINGLE_HEADER_H);
  c.fillStyle = '#ffffff';
  c.font = 'bold 24px "Noto Sans JP", sans-serif';
  // eslint-disable-next-line no-irregular-whitespace
  c.fillText(`${athleteName}　${apparatus} ${info?.name ?? ''}`, 20, 32);
  c.font = '14px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffffcc';
  c.fillText(`${sessionName}  /  ${new Date().toLocaleDateString('ja-JP')}`, 20, 58);
  c.font = '11px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffff88';
  c.fillText('MAG Judge Memo', SINGLE_W - 130, 58);

  // メインエリア
  const contentX = SINGLE_PAD;
  const contentY = SINGLE_HEADER_H + SINGLE_PAD;
  const contentW = SINGLE_W - SINGLE_PAD * 2;
  const contentH = SINGLE_H - SINGLE_HEADER_H - SINGLE_PAD * 2;

  drawCellTemplate(c, contentX - SINGLE_PAD, contentY - SINGLE_PAD,
    contentW + SINGLE_PAD * 2, contentH + SINGLE_PAD * 2, SINGLE_PAD,
    apparatus, eJudgeCount);

  if (record && record.strokes.length > 0) {
    const { scaleX, scaleY } = calcStrokeScale(record.strokes, contentW, contentH);
    c.save();
    c.beginPath();
    c.rect(contentX, contentY, contentW, contentH);
    c.clip();
    drawStrokes(c, record.strokes, contentX, contentY, scaleX, scaleY);
    c.restore();
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

// ---------- 共有 / ダウンロード ----------
export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch {
      // ユーザーがキャンセルした場合など
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
