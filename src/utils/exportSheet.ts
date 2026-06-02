import { db } from '../db/database';
import type { MemoRecord, StrokeData } from '../db/database';
import type { Apparatus, DigitalScores } from '../types';
import { APPARATUS_MAP } from '../constants/apparatus';
import { renderSheetCanvas, loadVaultImage, SHEET_SCORE_FOOTER_H } from './renderSheet';

// ---------- 6種目シート用定数 ----------
const CELL_GAP = 4;
const HEADER_H = 80;

// エクスポートセルサイズ
const CELL_W = 500;
const CELL_H = Math.round(CELL_W * (700 + SHEET_SCORE_FOOTER_H) / 1024); // iPad landscape + スコアバー

// 出力PNGのピクセル倍率。レイアウト座標は据え置きで、Canvas実ピクセルだけ拡大する。
// 元シートも同倍率で描画し、SNS共有時の細いペン線とスコア文字のボケを抑える。
const EXPORT_SCALE = 3;

const APPARATUS_ORDER: Apparatus[] = ['FX', 'PH', 'SR', 'VT', 'PB', 'HB'];

// 採点済み種目数に応じたグリッドレイアウト
const LAYOUTS: Record<number, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  3: { cols: 3, rows: 1 },
  4: { cols: 2, rows: 2 },
  5: { cols: 3, rows: 2 },
  6: { cols: 3, rows: 2 },
};

// レコードからキャンバスサイズを取得（保存されていなければフォールバック）
function getCanvasSize(record: MemoRecord | undefined): { w: number; h: number } {
  if (record?.canvasW && record?.canvasH) {
    return { w: record.canvasW, h: record.canvasH };
  }
  // 旧データ: ストロークの最大座標から推定
  if (record && record.strokes.length > 0) {
    let maxX = 0, maxY = 0;
    for (const s of record.strokes) {
      for (const p of s.points) {
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    // ストロークの範囲にマージンを足して推定
    return { w: Math.max(maxX * 1.1, 800), h: Math.max(maxY * 1.1, 500) };
  }
  return { w: 1024, h: 700 };
}

// 採点済み種目コードを抽出（APPARATUS_ORDER の順序を保持）
function getScoredApparatus(records: Map<Apparatus, MemoRecord>): Apparatus[] {
  return APPARATUS_ORDER.filter(a => {
    const rec = records.get(a);
    return rec && rec.strokes.length > 0;
  });
}

// ヘッダー内の採点種目バッジを描画
function drawApparatusBadges(
  c: CanvasRenderingContext2D,
  scored: Apparatus[],
  startX: number,
  y: number,
  totalCount: number,
): void {
  const badgeH = 20;
  const badgePadX = 8;
  const gap = 6;
  let x = startX;
  c.font = 'bold 12px "Noto Sans JP", sans-serif';
  for (const code of scored) {
    const w = c.measureText(code).width + badgePadX * 2;
    c.fillStyle = '#ffffff22';
    c.strokeStyle = '#ffffff99';
    c.lineWidth = 1;
    const r = 4;
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + badgeH - r);
    c.quadraticCurveTo(x + w, y + badgeH, x + w - r, y + badgeH);
    c.lineTo(x + r, y + badgeH);
    c.quadraticCurveTo(x, y + badgeH, x, y + badgeH - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.fillText(code, x + badgePadX, y + badgeH - 6);
    x += w + gap;
  }
  // 件数表示
  c.fillStyle = '#ffffffcc';
  c.font = 'bold 12px "Noto Sans JP", sans-serif';
  c.fillText(`${scored.length}/${totalCount}`, x + 4, y + badgeH - 6);
}

// 1選手ぶんのレコードを取得
async function loadAthleteRecords(
  sessionId: string,
  athleteName: string,
): Promise<Map<Apparatus, MemoRecord>> {
  const allRecords = await db.memoRecords
    .where('sessionId').equals(sessionId)
    .toArray();
  const recordMap = new Map<Apparatus, MemoRecord>();
  for (const r of allRecords) {
    if (r.athleteName === athleteName) {
      recordMap.set(r.apparatus, r);
    }
  }
  return recordMap;
}

// ---------- 6種目シートエクスポート（採点済みのみ可変グリッド） ----------
export async function exportAthleteSheet(
  sessionId: string,
  athleteName: string,
  sessionName: string,
  eJudgeCount: number,
): Promise<{ blob: Blob; scored: Apparatus[] } | null> {
  const recordMap = await loadAthleteRecords(sessionId, athleteName);
  const scored = getScoredApparatus(recordMap);
  if (scored.length === 0) return null;

  const layout = LAYOUTS[scored.length];
  const { cols, rows } = layout;
  const exportW = CELL_W * cols + CELL_GAP * (cols - 1);
  const exportH = HEADER_H + CELL_H * rows + CELL_GAP * (rows - 1);

  // 跳馬画像を事前読み込み（VT が含まれる時のみ）
  const vaultImg = scored.includes('VT') ? await loadVaultImage() : null;

  const canvas = document.createElement('canvas');
  canvas.width = exportW * EXPORT_SCALE;
  canvas.height = exportH * EXPORT_SCALE;
  const c = canvas.getContext('2d')!;
  c.scale(EXPORT_SCALE, EXPORT_SCALE);

  // 背景
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, exportW, exportH);

  // ヘッダー
  c.fillStyle = '#1B4F72';
  c.fillRect(0, 0, exportW, HEADER_H);
  c.fillStyle = '#ffffff';
  c.font = 'bold 22px "Noto Sans JP", sans-serif';
  c.fillText(athleteName, 16, 28);
  c.font = '12px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffffcc';
  c.fillText(`${sessionName}  /  ${new Date().toLocaleDateString('ja-JP')}`, 16, 48);
  c.font = '10px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffff88';
  c.fillText('MAG Judge Memo', exportW - 110, HEADER_H - 10);

  // 採点種目バッジ
  drawApparatusBadges(c, scored, 16, 55, APPARATUS_ORDER.length);

  // 各種目: 実際の採点画面と同じロジックでオフスクリーン描画 → 縮小配置
  for (let i = 0; i < scored.length; i++) {
    const apparatus = scored[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = col * (CELL_W + CELL_GAP);
    const cellY = HEADER_H + row * (CELL_H + CELL_GAP);

    const record = recordMap.get(apparatus);
    // 各種目それぞれのキャンバスサイズで描画（ストローク座標とテンプレートを一致させる）
    const srcSize = getCanvasSize(record);

    // JudgeSheet と完全に同じロジックでフルサイズ描画
    const sheet = renderSheetCanvas({
      w: srcSize.w,
      h: srcSize.h,
      apparatus,
      eJudgeCount,
      mode: 'trial',
      athleteName,
      strokes: record?.strokes ?? [],
      lines: record?.lines,
      vaultImg: apparatus === 'VT' ? vaultImg : null,
      digitalScores: record?.digitalScores,
      digitalAthleteName: record?.digitalAthleteName,
      renderScale: EXPORT_SCALE,
    });

    // 縮小してセルに配置
    c.drawImage(sheet, cellX, cellY, CELL_W, CELL_H);

    // セル枠線
    c.strokeStyle = '#ddd';
    c.lineWidth = 1;
    c.strokeRect(cellX, cellY, CELL_W, CELL_H);
  }

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });
  return { blob, scored };
}

// ---------- 単一種目シートエクスポート ----------
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

  const vaultImg = apparatus === 'VT' ? await loadVaultImage() : null;
  const src = getCanvasSize(record);

  const canvas = document.createElement('canvas');
  canvas.width = SINGLE_W * EXPORT_SCALE;
  canvas.height = SINGLE_H * EXPORT_SCALE;
  const c = canvas.getContext('2d')!;
  c.scale(EXPORT_SCALE, EXPORT_SCALE);

  // 背景
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, SINGLE_W, SINGLE_H);

  // ヘッダー
  c.fillStyle = '#1B4F72';
  c.fillRect(0, 0, SINGLE_W, HEADER);
  c.fillStyle = '#ffffff';
  c.font = 'bold 20px "Noto Sans JP", sans-serif';
  c.fillText(athleteName, 16, 26);
  c.font = '12px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffffcc';
  c.fillText(`${sessionName}  /  ${new Date().toLocaleDateString('ja-JP')}`, 16, 46);
  c.font = '10px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffff88';
  c.fillText('MAG Judge Memo', SINGLE_W - 110, 46);

  // JudgeSheet と同じロジックで描画
  const sheet = renderSheetCanvas({
    w: src.w,
    h: src.h,
    apparatus,
    eJudgeCount,
    mode: 'individual',
    athleteName,
    strokes: record?.strokes ?? [],
    lines: record?.lines,
    vaultImg,
    digitalScores: record?.digitalScores,
    digitalAthleteName: record?.digitalAthleteName,
    renderScale: EXPORT_SCALE,
  });

  c.drawImage(sheet, 0, HEADER, SINGLE_W, SINGLE_H - HEADER);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

// ---------- ファイル名生成 ----------
export function buildSheetFilename(
  athleteName: string,
  scored: Apparatus[],
  sessionName: string,
): string {
  // APPARATUS_MAP から順序保証された短縮コードを使用
  const codes = scored.map(a => APPARATUS_MAP[a].shortName).join('-');
  const date = new Date().toISOString().slice(0, 10);
  return `${athleteName}_${codes}_${sessionName}_${date}.png`;
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

// ---------- 複数選手一括共有 ----------
export interface BulkExportItem {
  athleteName: string;
  blob: Blob;
  scored: Apparatus[];
  filename: string;
}

export interface BulkExportResult {
  items: BulkExportItem[];
  skipped: string[]; // 採点済みゼロのためスキップした選手
}

/**
 * 複数選手のシートを生成。採点済み0件の選手は skipped に格納。
 * onProgress でインデックス（1-based）と選手名を通知。
 */
export async function generateBulkSheets(
  sessionId: string,
  athleteNames: string[],
  sessionName: string,
  eJudgeCount: number,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<BulkExportResult> {
  const items: BulkExportItem[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < athleteNames.length; i++) {
    const name = athleteNames[i];
    onProgress?.(i + 1, athleteNames.length, name);
    const result = await exportAthleteSheet(sessionId, name, sessionName, eJudgeCount);
    if (!result) {
      skipped.push(name);
      continue;
    }
    const filename = buildSheetFilename(name, result.scored, sessionName);
    items.push({
      athleteName: name,
      blob: result.blob,
      scored: result.scored,
      filename,
    });
  }
  return { items, skipped };
}

// ---------- 現在画面の単一種目エクスポート（インメモリデータから直接生成） ----------
export async function exportCurrentSheetBlob(params: {
  apparatus: Apparatus;
  eJudgeCount: number;
  mode: 'trial' | 'competition' | 'individual';
  athleteName: string;
  sessionName: string;
  strokes: StrokeData[];
  lines?: { y: number; right: number }[];
  canvasW: number;
  canvasH: number;
  digitalScores?: DigitalScores;
  digitalAthleteName?: string;
}): Promise<Blob> {
  // 元の Canvas サイズに合わせてアスペクト比を保つ（非等倍ストレッチによる
  // ストローク位置ズレを防ぐ）。出力幅は 1200 px を基準にして、シートの
  // アスペクト比に応じて高さを算出する。
  const SINGLE_W = 1200;
  const HEADER = 60;
  const srcW = params.canvasW || 1024;
  const srcH = (params.canvasH || 700) + SHEET_SCORE_FOOTER_H; // シート + スコアバー
  const scale = SINGLE_W / srcW;
  const bodyH = Math.round(srcH * scale);
  const SINGLE_H = HEADER + bodyH;

  const vaultImg = params.apparatus === 'VT' ? await loadVaultImage() : null;

  const canvas = document.createElement('canvas');
  canvas.width = SINGLE_W * EXPORT_SCALE;
  canvas.height = SINGLE_H * EXPORT_SCALE;
  const c = canvas.getContext('2d')!;
  c.scale(EXPORT_SCALE, EXPORT_SCALE);

  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, SINGLE_W, SINGLE_H);

  c.fillStyle = '#1B4F72';
  c.fillRect(0, 0, SINGLE_W, HEADER);
  c.fillStyle = '#ffffff';
  c.font = 'bold 20px "Noto Sans JP", sans-serif';
  c.fillText(params.athleteName || '—', 16, 26);
  c.font = '12px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffffcc';
  c.fillText(`${params.sessionName}  /  ${new Date().toLocaleDateString('ja-JP')}`, 16, 46);
  c.font = '10px "Noto Sans JP", sans-serif';
  c.fillStyle = '#ffffff88';
  c.fillText('MAG Judge Memo', SINGLE_W - 110, 46);

  const sheet = renderSheetCanvas({
    w: params.canvasW || 1024,
    h: params.canvasH || 700,
    apparatus: params.apparatus,
    eJudgeCount: params.eJudgeCount,
    mode: params.mode,
    athleteName: params.athleteName,
    strokes: params.strokes,
    lines: params.lines,
    vaultImg,
    digitalScores: params.digitalScores,
    digitalAthleteName: params.digitalAthleteName,
    renderScale: EXPORT_SCALE,
  });

  // 等倍スケーリングで描画（アスペクト比保持）
  c.drawImage(sheet, 0, HEADER, SINGLE_W, bodyH);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

/**
 * 複数ファイルを Web Share API で一括共有。
 * 非対応環境では逐次ダウンロードにフォールバック。
 */
export async function shareOrDownloadMultiple(
  items: BulkExportItem[],
  sessionName: string,
): Promise<void> {
  if (items.length === 0) return;

  const files = items.map(
    (it) => new File([it.blob], it.filename, { type: 'image/png' }),
  );

  // 複数ファイル対応の Web Share API（iPadOS 15+）
  if (navigator.share && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title: `${sessionName} 採点結果` });
      return;
    } catch {
      // ユーザーキャンセル等
      return;
    }
  }

  // フォールバック: 逐次ダウンロード
  for (const it of items) {
    const url = URL.createObjectURL(it.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = it.filename;
    a.click();
    URL.revokeObjectURL(url);
    // ブラウザの連続ダウンロード制限回避のため短い間隔を入れる
    await new Promise((r) => setTimeout(r, 200));
  }
}
