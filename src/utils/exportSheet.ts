import { db } from '../db/database';
import type { MemoRecord } from '../db/database';
import type { Apparatus } from '../types';
import { renderSheetCanvas } from './renderSheet';

// ---------- 6種目シート用定数（横向き・3列×2行） ----------
const EXPORT_COLS = 3;
const EXPORT_ROWS = 2;
const CELL_GAP = 4;
const HEADER_H = 60;

// 元のキャンバスサイズを推定するための参照サイズ
// iPad landscape のメモ領域: ツールバー(≈48px)を除いた領域
const REF_W = 1024;
const REF_H = 700;

// エクスポートセルサイズ: 元のアスペクト比を維持
const CELL_W = 500;
const CELL_H = Math.round(CELL_W * REF_H / REF_W);
const EXPORT_W = CELL_W * EXPORT_COLS + CELL_GAP * (EXPORT_COLS - 1);
const EXPORT_H = HEADER_H + CELL_H * EXPORT_ROWS + CELL_GAP * (EXPORT_ROWS - 1);

const APPARATUS_ORDER: Apparatus[] = ['FX', 'PH', 'SR', 'VT', 'PB', 'HB'];

// ストロークから元のキャンバスサイズを推定
function estimateSourceSize(records: Map<Apparatus, MemoRecord>): { w: number; h: number } {
  let maxX = 0, maxY = 0;
  for (const rec of records.values()) {
    for (const s of rec.strokes) {
      for (const p of s.points) {
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  // ストロークがない場合やキャンバス端まで描いていない場合のフォールバック
  return {
    w: Math.max(maxX + 50, REF_W),
    h: Math.max(maxY + 50, REF_H),
  };
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

  // 元のキャンバスサイズを推定（全種目共通）
  const src = estimateSourceSize(recordMap);

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

  // 各種目: 実際の採点画面と同じロジックでオフスクリーン描画 → 縮小配置
  for (let i = 0; i < APPARATUS_ORDER.length; i++) {
    const apparatus = APPARATUS_ORDER[i];
    const col = i % EXPORT_COLS;
    const row = Math.floor(i / EXPORT_COLS);
    const cellX = col * (CELL_W + CELL_GAP);
    const cellY = HEADER_H + row * (CELL_H + CELL_GAP);

    const record = recordMap.get(apparatus);

    // JudgeSheet と完全に同じロジックでフルサイズ描画
    const sheet = renderSheetCanvas({
      w: src.w,
      h: src.h,
      apparatus,
      eJudgeCount,
      mode: 'trial',
      athleteName,
      strokes: record?.strokes ?? [],
    });

    // 縮小してセルに配置
    c.drawImage(sheet, cellX, cellY, CELL_W, CELL_H);

    // セル枠線
    c.strokeStyle = '#ddd';
    c.lineWidth = 1;
    c.strokeRect(cellX, cellY, CELL_W, CELL_H);
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

  const SINGLE_W = 1200;
  const SINGLE_H = 900;
  const HEADER = 60;

  const canvas = document.createElement('canvas');
  canvas.width = SINGLE_W;
  canvas.height = SINGLE_H;
  const c = canvas.getContext('2d')!;

  // 背景
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, SINGLE_W, SINGLE_H);

  // ヘッダー
  c.fillStyle = '#1B4F72';
  c.fillRect(0, 0, SINGLE_W, HEADER);
  c.fillStyle = '#ffffff';
  c.font = 'bold 20px "Noto Sans JP", sans-serif';
  c.fillText(`${athleteName}`, 16, 26);
  c.font = '12px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffffcc';
  c.fillText(`${sessionName}  /  ${new Date().toLocaleDateString('ja-JP')}`, 16, 46);
  c.font = '10px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffff88';
  c.fillText('MAG Judge Memo', SINGLE_W - 110, 46);

  // コンテンツ: JudgeSheet と同じロジックで描画
  const contentW = SINGLE_W;
  const contentH = SINGLE_H - HEADER;

  // ソースサイズ推定
  let srcW = REF_W, srcH = REF_H;
  if (record && record.strokes.length > 0) {
    let maxX = 0, maxY = 0;
    for (const s of record.strokes) {
      for (const p of s.points) {
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    srcW = Math.max(maxX + 50, REF_W);
    srcH = Math.max(maxY + 50, REF_H);
  }

  const sheet = renderSheetCanvas({
    w: srcW,
    h: srcH,
    apparatus,
    eJudgeCount,
    mode: 'individual',
    athleteName,
    strokes: record?.strokes ?? [],
  });

  c.drawImage(sheet, 0, HEADER, contentW, contentH);

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
