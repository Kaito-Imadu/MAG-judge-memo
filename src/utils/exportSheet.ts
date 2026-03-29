import { db } from '../db/database';
import type { MemoRecord, StrokeData } from '../db/database';
import type { Apparatus } from '../types';
import { APPARATUS_LIST } from '../constants/apparatus';
import { getNDChecklist } from '../constants/deductions';

// ---------- 6種目シート用定数（横向き・3列×2行） ----------
// 採点画面のアスペクト比を維持: iPad landscape ≈ 4:3 のメモ領域
const CANVAS_ASPECT = 4 / 3; // 横:縦
const EXPORT_COLS = 3;
const EXPORT_ROWS = 2;
const CELL_PAD = 8;
const CELL_GAP = 4;
const HEADER_H = 60;

// セルサイズからエクスポート画像サイズを決定
const CELL_INNER_W = 480;
const CELL_INNER_H = Math.round(CELL_INNER_W / CANVAS_ASPECT);
const CELL_W = CELL_INNER_W + CELL_PAD * 2;
const CELL_H = CELL_INNER_H + CELL_PAD * 2;
const EXPORT_W = CELL_W * EXPORT_COLS + CELL_GAP * (EXPORT_COLS - 1);
const EXPORT_H = HEADER_H + CELL_H * EXPORT_ROWS + CELL_GAP * (EXPORT_ROWS - 1);

// ---------- 単一種目シート用定数 ----------
const SINGLE_W = 1200;
const SINGLE_H = 900;
const SINGLE_HEADER_H = 80;
const SINGLE_PAD = 16;

// ---------- JudgeSheet と同じ比率のレイアウト定数 ----------
const LABEL_H_RATIO = 52 / 700;
const SCORE_ROW_H_RATIO = 160 / 700;
const ND_WIDTH_RATIO = 0.2;
const LAST_COL_RATIO = 1.4;

const APPARATUS_ORDER: Apparatus[] = ['FX', 'PH', 'SR', 'VT', 'PB', 'HB'];

// ---------- セルテンプレート描画 ----------
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
  const headerFontSize = Math.max(10, Math.round(labelH * 0.5));
  c.font = `bold ${headerFontSize}px "Noto Sans JP", sans-serif`;
  c.fillText(`${apparatus}  ${info?.name ?? ''}`, x + pad + 6, y + pad + labelH * 0.65);

  // ヘッダー下線
  c.strokeStyle = '#ddd';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x + pad, y + pad + labelH);
  c.lineTo(x + cellW - pad, y + pad + labelH);
  c.stroke();

  // ND項目
  const ndItems = getNDChecklist(apparatus);
  if (ndItems.length > 0) {
    c.save();
    const ndX = x + pad + mainW;
    const ndAreaTop = y + pad + labelH + 4;
    const ndAreaBottom = scoreTop - 4;
    c.beginPath();
    c.rect(ndX, ndAreaTop, ndW, ndAreaBottom - ndAreaTop);
    c.clip();

    const ndFontSize = Math.max(6, Math.min(8, Math.round((ndAreaBottom - ndAreaTop) / ndItems.length * 0.5)));
    const ndLineH = Math.round((ndAreaBottom - ndAreaTop) / Math.max(ndItems.length, 1));

    c.fillStyle = '#666';
    c.font = `bold ${ndFontSize + 1}px "Noto Sans JP", sans-serif`;
    c.fillText('ND', ndX + 3, ndAreaTop + ndFontSize + 2);

    c.fillStyle = '#888';
    c.font = `${ndFontSize}px "Noto Sans JP", sans-serif`;
    ndItems.forEach((item, i) => {
      const ny = ndAreaTop + ndFontSize + 6 + i * ndLineH;
      c.fillText(`□ ${item.label}`, ndX + 3, ny + ndFontSize);
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

  // スコア列
  const cols: string[] = ['D'];
  for (let i = 0; i < eJudgeCount; i++) cols.push(i === 0 ? 'E1' : `E${i + 1}`);
  cols.push('ND', '決定点');

  const colCount = cols.length;
  const normalCols = colCount - 1;
  const unit = innerW / (normalCols + LAST_COL_RATIO);
  const labelFontSize = Math.max(6, Math.round(scoreRowH * 0.07));

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
    c.fillText(cols[i], cx + 2, scoreTop + labelFontSize + 2);
    cx += colW;
  }
}

// ---------- ストローク描画 ----------
function drawStrokes(
  c: CanvasRenderingContext2D,
  strokes: StrokeData[],
  offsetX: number, offsetY: number,
  scale: number,
) {
  for (const s of strokes) {
    const pts = s.points;
    if (pts.length < 2) continue;
    c.strokeStyle = s.color;
    c.lineWidth = (s.width ?? 2) * scale;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    const sx = (x: number) => offsetX + x * scale;
    const sy = (y: number) => offsetY + y * scale;
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

// ストロークの元キャンバスサイズを推定し、ターゲットに収まる均一スケールを計算
function calcUniformScale(
  strokes: StrokeData[],
  targetW: number, targetH: number,
): number {
  let maxX = 0, maxY = 0;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (maxX === 0 || maxY === 0) return 1;
  return Math.min(targetW / maxX, targetH / maxY);
}

// ---------- 6種目シートエクスポート（横向き・3列×2行） ----------
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
  c.font = 'bold 22px "Noto Sans JP", sans-serif';
  c.fillText(athleteName, 16, 28);
  c.font = '12px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffffcc';
  c.fillText(`${sessionName}  /  ${new Date().toLocaleDateString('ja-JP')}`, 16, 48);
  c.font = '10px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffff88';
  c.fillText('MAG Judge Memo', EXPORT_W - 110, 48);

  // 各種目セル（3列×2行）
  for (let i = 0; i < APPARATUS_ORDER.length; i++) {
    const apparatus = APPARATUS_ORDER[i];
    const col = i % EXPORT_COLS;
    const row = Math.floor(i / EXPORT_COLS);
    const cellX = col * (CELL_W + CELL_GAP);
    const cellY = HEADER_H + row * (CELL_H + CELL_GAP);

    // セル背景
    c.fillStyle = '#fafafa';
    c.fillRect(cellX + CELL_PAD, cellY + CELL_PAD, CELL_INNER_W, CELL_INNER_H);

    drawCellTemplate(c, cellX, cellY, CELL_W, CELL_H, CELL_PAD, apparatus, eJudgeCount);

    const record = recordMap.get(apparatus);
    if (record && record.strokes.length > 0) {
      const scale = calcUniformScale(record.strokes, CELL_INNER_W, CELL_INNER_H);

      c.save();
      c.beginPath();
      c.rect(cellX + CELL_PAD, cellY + CELL_PAD, CELL_INNER_W, CELL_INNER_H);
      c.clip();
      drawStrokes(c, record.strokes, cellX + CELL_PAD, cellY + CELL_PAD, scale);
      c.restore();
    } else {
      c.fillStyle = '#ddd';
      c.font = '12px "Noto Sans JP", sans-serif';
      c.fillText('未採点', cellX + CELL_W / 2 - 16, cellY + CELL_H / 2);
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
    const scale = calcUniformScale(record.strokes, contentW, contentH);
    c.save();
    c.beginPath();
    c.rect(contentX, contentY, contentW, contentH);
    c.clip();
    drawStrokes(c, record.strokes, contentX, contentY, scale);
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
