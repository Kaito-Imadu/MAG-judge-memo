import { db } from '../db/database';
import type { MemoRecord, StrokeData } from '../db/database';
import type { Apparatus } from '../types';
import { APPARATUS_LIST } from '../constants/apparatus';
import { getNDChecklist } from '../constants/deductions';

const EXPORT_W = 1200;
const EXPORT_H = 1800;
const HEADER_H = 100;
const COLS = 2;
const ROWS = 3;
const CELL_W = EXPORT_W / COLS;
const CELL_H = (EXPORT_H - HEADER_H) / ROWS;
const CELL_PAD = 12;
const SCORE_ROW_H = 60;

// 各種目の順序
const APPARATUS_ORDER: Apparatus[] = ['FX', 'PH', 'SR', 'VT', 'PB', 'HB'];

function drawCellTemplate(
  c: CanvasRenderingContext2D,
  x: number, y: number,
  apparatus: Apparatus,
  eJudgeCount: number,
) {
  const innerW = CELL_W - CELL_PAD * 2;
  const innerH = CELL_H - CELL_PAD * 2;
  const scoreTop = y + CELL_H - CELL_PAD - SCORE_ROW_H;

  // 枠線
  c.strokeStyle = '#ccc';
  c.lineWidth = 1;
  c.strokeRect(x + CELL_PAD, y + CELL_PAD, innerW, innerH);

  // 種目ヘッダー
  const info = APPARATUS_LIST.find(a => a.code === apparatus);
  c.fillStyle = '#1B4F72';
  c.font = 'bold 18px "Noto Sans JP", sans-serif';
  c.fillText(`${apparatus}  ${info?.name ?? ''}`, x + CELL_PAD + 8, y + CELL_PAD + 24);

  // ヘッダー下線
  c.strokeStyle = '#ddd';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x + CELL_PAD, y + CELL_PAD + 32);
  c.lineTo(x + CELL_W - CELL_PAD, y + CELL_PAD + 32);
  c.stroke();

  // ND項目（右側に小さく）
  const ndItems = getNDChecklist(apparatus);
  if (ndItems.length > 0) {
    c.fillStyle = '#888';
    c.font = '9px "Noto Sans JP", sans-serif';
    ndItems.forEach((item, i) => {
      const ny = y + CELL_PAD + 50 + i * 16;
      if (ny < scoreTop - 10) {
        c.fillText(`□ ${item.label}`, x + CELL_W - CELL_PAD - 120, ny);
      }
    });
  }

  // スコア行
  c.strokeStyle = '#444';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x + CELL_PAD, scoreTop);
  c.lineTo(x + CELL_W - CELL_PAD, scoreTop);
  c.stroke();

  // スコア列
  const cols: string[] = ['D'];
  for (let i = 0; i < eJudgeCount; i++) cols.push(i === 0 ? 'E1' : `E${i + 1}`);
  cols.push('ND', '決定点');
  const colW = innerW / cols.length;
  c.lineWidth = 0.5;
  c.strokeStyle = '#888';
  c.fillStyle = '#999';
  c.font = '8px "Noto Sans JP", sans-serif';
  for (let i = 0; i < cols.length; i++) {
    const cx = x + CELL_PAD + i * colW;
    if (i > 0) {
      c.beginPath();
      c.moveTo(cx, scoreTop);
      c.lineTo(cx, y + CELL_H - CELL_PAD);
      c.stroke();
    }
    c.fillText(cols[i], cx + 3, scoreTop + 10);
  }
}

function drawStrokes(
  c: CanvasRenderingContext2D,
  strokes: StrokeData[],
  offsetX: number, offsetY: number,
  scale: number,
) {
  for (const s of strokes) {
    if (s.points.length < 2) continue;
    c.strokeStyle = s.color;
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(offsetX + s.points[0].x * scale, offsetY + s.points[0].y * scale);
    for (let i = 1; i < s.points.length; i++) {
      c.lineTo(offsetX + s.points[i].x * scale, offsetY + s.points[i].y * scale);
    }
    c.stroke();
  }
}

export async function exportAthleteSheet(
  sessionId: string,
  athleteName: string,
  sessionName: string,
  eJudgeCount: number,
): Promise<Blob> {
  // 全種目のレコードを取得
  const allRecords = await db.memoRecords
    .where('sessionId').equals(sessionId)
    .toArray();
  const recordMap = new Map<Apparatus, MemoRecord>();
  for (const r of allRecords) {
    if (r.athleteName === athleteName) {
      recordMap.set(r.apparatus, r);
    }
  }

  // Canvas作成
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

  // アプリ名
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

    drawCellTemplate(c, cellX, cellY, apparatus, eJudgeCount);

    const record = recordMap.get(apparatus);
    if (record && record.strokes.length > 0) {
      // ストロークのスケール計算
      // ストロークの座標範囲を見て適切なスケールを決定
      let maxX = 0, maxY = 0;
      for (const s of record.strokes) {
        for (const p of s.points) {
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
      const innerW = CELL_W - CELL_PAD * 2;
      const innerH = CELL_H - CELL_PAD * 2 - SCORE_ROW_H;
      const scaleX = maxX > 0 ? innerW / (maxX + 20) : 0.5;
      const scaleY = maxY > 0 ? innerH / (maxY + 20) : 0.5;
      const scale = Math.min(scaleX, scaleY, 0.7);

      drawStrokes(c, record.strokes, cellX + CELL_PAD, cellY + CELL_PAD, scale);
    } else {
      // 未採点
      c.fillStyle = '#ddd';
      c.font = '14px "Noto Sans JP", sans-serif';
      c.fillText('未採点', cellX + CELL_W / 2 - 20, cellY + CELL_H / 2);
    }
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });

  // Web Share API (iOS Safari対応)
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch {
      // ユーザーがキャンセルした場合など
    }
  }

  // フォールバック: ダウンロード
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
