import { useRef, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Apparatus, DigitalScores } from '../types';
import { APPARATUS_LIST } from '../constants/apparatus';
import { getNDChecklist } from '../constants/deductions';
import { db } from '../db/database';
import type { StrokeData } from '../db/database';
import { loadJudgeSettings, updateJudgeSettings } from '../utils/settings';
import ScoreInputBar from './ScoreInputBar';
import { emptyScores, hasAnyScore } from '../utils/scoreCalc';

interface Point { x: number; y: number }
interface Stroke { points: Point[]; color: string; width: number }

interface Props {
  apparatus: Apparatus;
  judgeMode: 'D' | 'E' | 'D/E';
  eJudgeCount: number;
  recordId: string;
  sessionId: string;
  mode: 'trial' | 'competition' | 'individual';
  athleteName?: string;
  pageNumber?: number;
  showApparatusTabs?: boolean;
  toolbarExtra?: ReactNode;
  onBack?: () => void;
  onApparatusChange?: (apparatus: Apparatus) => void;
  // 大会モード用デジタル選手名（親が管理。JudgeSheet は保存にのみ使う）
  digitalAthleteName?: string;
  // Canvas ヘッダー領域に重ねるオーバーレイ（選手名の直接入力欄など）
  headerOverlay?: ReactNode;
  // true の間は自動保存を抑止（ページ削除/リナンバリング中の保護用）
  suppressSave?: boolean;
}

const COLORS = [
  { value: '#000000' },
  { value: '#E74C3C' },
  { value: '#2E86C1' },
];
const ERASER_WIDTH = 28;
const STRAIGHT_DELAY = 1500;
const STRAIGHT_THRESHOLD = 4;
const SCRUB_DIRS_NEEDED = 6;          // 方向転換の必要回数（厳格化）
const SCRUB_MIN_SWING = 20;           // ピーク/トラフからの反転量(px) — 12→20 に引き上げ
const SCRUB_PERP_MAX_RANGE = 50;      // 副軸（スクラブ方向と直交）の最大レンジ — 細長い線を除外
const SCRUB_PARALLEL_MAX_RANGE = 220; // 主軸の最大レンジ — 長い直線を除外
const SCRUB_MIN_POINTS = 12;          // スクラブと判定する最小点数
const SAVE_DEBOUNCE = 1500;
// 横線ハンドル定数
const HLINE_HANDLE_R = 5;        // ハンドル円の半径
const HLINE_HANDLE_HIT = 16;     // ハンドルタップ判定半径
const HLINE_LEFT_MARGIN = 10;    // 左ハンドルのX座標
const HLINE_OFFSET_Y = 40;       // 2本目以降のずらし幅

interface HLine { y: number; right: number }

// 跳馬画像設定の永続化キー
const VT_IMG_FLIP_KEY = 'vt-image-flip';
const VT_IMG_SCALE_KEY = 'vt-image-scale';
const VT_SCALE_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5];
// レイアウト定数
const LABEL_H = 52;          // モード別ラベル領域の高さ
const SCORE_ROW_H = 0;       // 旧: Canvas内スコア行の高さ。デジタル化により0（互換のため定数は残す）
const CV_LABEL_H = 28;
const ND_WIDTH_RATIO = 0.2;

// 空間インデックス: グリッドセルサイズ
const GRID_CELL = 40;

// ---------- 空間インデックス ----------
interface SpatialGrid {
  cells: Map<string, Set<number>>;
  cellSize: number;
}

function createGrid(): SpatialGrid {
  return { cells: new Map(), cellSize: GRID_CELL };
}

function gridKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

function insertStroke(grid: SpatialGrid, idx: number, stroke: Stroke) {
  const cs = grid.cellSize;
  for (const p of stroke.points) {
    const gx = Math.floor(p.x / cs);
    const gy = Math.floor(p.y / cs);
    const key = gridKey(gx, gy);
    let set = grid.cells.get(key);
    if (!set) { set = new Set(); grid.cells.set(key, set); }
    set.add(idx);
  }
}

function rebuildGrid(strokes: Stroke[]): SpatialGrid {
  const grid = createGrid();
  for (let i = 0; i < strokes.length; i++) {
    insertStroke(grid, i, strokes[i]);
  }
  return grid;
}

function queryNear(grid: SpatialGrid, p: Point, radius: number): Set<number> {
  const cs = grid.cellSize;
  const r = Math.ceil(radius / cs);
  const gx = Math.floor(p.x / cs);
  const gy = Math.floor(p.y / cs);
  const result = new Set<number>();
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const set = grid.cells.get(gridKey(gx + dx, gy + dy));
      if (set) for (const idx of set) result.add(idx);
    }
  }
  return result;
}

// ---------- スクラブ消去: ピーク/トラフ検出 ----------
// 座標列の方向転換回数を数える（ノイズ耐性あり）
function countDirChanges(values: number[], minSwing: number): number {
  if (values.length < 3) return 0;
  let changes = 0;
  let extreme = values[0]; // 現在のピークまたはトラフ
  let dir = 0;             // 1=増加中, -1=減少中, 0=未確定
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (dir === 0) {
      if (v - extreme >= minSwing) { dir = 1; changes = 1; extreme = v; }
      else if (extreme - v >= minSwing) { dir = -1; changes = 1; extreme = v; }
    } else if (dir === 1) {
      if (v > extreme) extreme = v;
      if (extreme - v >= minSwing) { dir = -1; changes++; extreme = v; }
    } else {
      if (v < extreme) extreme = v;
      if (v - extreme >= minSwing) { dir = 1; changes++; extreme = v; }
    }
  }
  return changes;
}

// ストロークがスクラブパターンかどうか判定
function isScrubPattern(points: Point[]): boolean {
  if (points.length < SCRUB_MIN_POINTS) return false;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const xChanges = countDirChanges(xs, SCRUB_MIN_SWING);
  const yChanges = countDirChanges(ys, SCRUB_MIN_SWING);
  // 主軸（方向転換が多い方）で十分な回数の反転が必要
  if (Math.max(xChanges, yChanges) < SCRUB_DIRS_NEEDED) return false;

  const xRange = Math.max(...xs) - Math.min(...xs);
  const yRange = Math.max(...ys) - Math.min(...ys);

  // スクラブは「主軸方向に往復し、副軸はほぼ固定」が特徴
  // 縦線/横線（片軸のみレンジが大）を誤検出しないように副軸の狭さも条件にする
  const isHorizontalScrub = xChanges >= yChanges;
  const parallelRange = isHorizontalScrub ? xRange : yRange;
  const perpRange = isHorizontalScrub ? yRange : xRange;

  if (parallelRange > SCRUB_PARALLEL_MAX_RANGE) return false; // 長い直線を除外
  if (perpRange > SCRUB_PERP_MAX_RANGE) return false;         // 広く動いた線を除外

  return true;
}

// ---------- ベジェ曲線描画 ----------
function drawSmoothStroke(c: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.points;
  if (pts.length < 2) return;
  c.strokeStyle = s.color;
  c.lineWidth = s.width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.globalCompositeOperation = 'source-over';
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);

  if (pts.length === 2) {
    c.lineTo(pts[1].x, pts[1].y);
  } else {
    // 二次ベジェ曲線: 隣接2点の中点を通過点にし、元の点をコントロールポイントに
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      if (i === pts.length - 2) {
        // 最終セグメント: 終点へ直接
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

// インクリメンタル: 直近追加された点だけを描画（Active Canvas 用）
function drawIncrementalSmooth(
  c: CanvasRenderingContext2D,
  pts: Point[],
  color: string,
  width: number,
  fromIndex: number,
) {
  if (pts.length < 2 || fromIndex < 1) return;
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.globalCompositeOperation = 'source-over';

  // 新規追加された各点について、前の点からの曲線セグメントを描画
  const start = Math.max(1, fromIndex);
  for (let i = start; i < pts.length; i++) {
    const prev2 = i >= 2 ? pts[i - 2] : null;
    const prev = pts[i - 1];
    const curr = pts[i];

    c.beginPath();
    if (prev2) {
      // 中点間を曲線で結ぶ
      const mx0 = (prev2.x + prev.x) / 2;
      const my0 = (prev2.y + prev.y) / 2;
      const mx1 = (prev.x + curr.x) / 2;
      const my1 = (prev.y + curr.y) / 2;
      c.moveTo(mx0, my0);
      c.quadraticCurveTo(prev.x, prev.y, mx1, my1);
    } else {
      c.moveTo(prev.x, prev.y);
      c.lineTo(curr.x, curr.y);
    }
    c.stroke();
  }
}

// ---------- 診断ログ（Apple Pencil 無反応事象の調査用） ----------
interface PtrLogEntry {
  t: number;             // performance.now() (ms)
  ev: string;            // 'down' | 'move' | 'up' | 'pointercancel' | 'leave' | 'finish' | 'reset:visibility' | 'reset:blur' | 'force-reset' | 'auto-recover' | 'auto-recover-bg' | 'lostcapture' | 'toolbar-tap-recover' | 'doc-tap-recover' | 'mismatch'
  pt?: string;           // pointerType
  pid?: number;
  x?: number;
  y?: number;
  pr?: number;           // pressure
  d?: boolean;           // drawing.current
  a?: number | null;     // activePointerId.current
  cap?: boolean;         // hasPointerCapture
  note?: string;
}
const PTR_LOG_MAX = 800;
const ptrLog: PtrLogEntry[] = [];
function logPtr(entry: Omit<PtrLogEntry, 't'>) {
  ptrLog.push({ t: Math.round(performance.now()), ...entry });
  if (ptrLog.length > PTR_LOG_MAX) ptrLog.shift();
}
// ポインター入力の最終時刻（自動復旧の判定用）
const STALE_POINTER_MS = 1500;

export default function JudgeSheet({
  apparatus,
  judgeMode,
  eJudgeCount,
  recordId,
  sessionId,
  mode,
  athleteName = '',
  pageNumber = 0,
  showApparatusTabs = true,
  toolbarExtra,
  onBack,
  onApparatusChange,
  digitalAthleteName,
  headerOverlay,
  suppressSave = false,
}: Props) {
  // === Refs ===
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const strokes = useRef<Stroke[]>([]);
  const spatialGrid = useRef<SpatialGrid>(createGrid());
  const redoStack = useRef<Stroke[]>([]);
  const preClearSnapshot = useRef<Stroke[] | null>(null);
  const horizontalLines = useRef<HLine[]>([]);
  const preClearLinesSnapshot = useRef<HLine[] | null>(null);
  // デジタルスコアは React state で管理（手動入力ペース → 高頻度ではない）
  const [digitalScores, setDigitalScores] = useState<DigitalScores>(() => emptyScores(eJudgeCount));
  const digitalScoresRef = useRef<DigitalScores>(digitalScores);
  useEffect(() => { digitalScoresRef.current = digitalScores; }, [digitalScores]);
  const draggingLineIdx = useRef<number | null>(null);
  const draggingHandle = useRef<'left' | 'right' | null>(null); // どちらのハンドルをドラッグ中か
  const cur = useRef<Stroke | null>(null);
  const curDrawnIndex = useRef(0); // Active Canvas にどこまで描画済みか
  const colorRef = useRef('#000000');
  const settingsRef = useRef(loadJudgeSettings());
  const lineWidthRef = useRef(settingsRef.current.penWidth);
  const eraserMode = useRef(false);
  const drawing = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const straight = useRef(false);
  const startPt = useRef<Point | null>(null);
  // scrubDirs等のリアルタイム追跡は廃止 → finishStroke内でまとめて分析
  const sizeRef = useRef({ w: 0, h: 0 });
  const prevRecordId = useRef<string>('');
  const prevApparatus = useRef<Apparatus>(apparatus);
  const prevAthleteName = useRef(athleteName);
  const prevPageNumber = useRef(pageNumber);
  // digitalAthleteName は同一recordId内（同じページ）でユーザが任意に書き換える可能性があるので、
  // 「最新値」を常にrefで持っておき、flushSave時にそれを使う。
  // 削除/リナンバリング中の保存抑止フラグ
  const suppressSaveRef = useRef(suppressSave);
  useEffect(() => { suppressSaveRef.current = suppressSave; }, [suppressSave]);

  const digitalAthleteNameRef = useRef(digitalAthleteName);
  // 初回（マウント時）はスキップして、以降の prop 変更でのみ自動保存をトリガー。
  const digitalAthleteNameInitialized = useRef(false);
  useEffect(() => {
    digitalAthleteNameRef.current = digitalAthleteName;
    if (!digitalAthleteNameInitialized.current) {
      digitalAthleteNameInitialized.current = true;
      return;
    }
    // 1500ms デバウンスで保存。
    saveRef.current();
  }, [digitalAthleteName]);
  const pendingDefaultHorizontalLine = useRef(false);
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  // 復旧ボタンから呼ぶための ref（useEffect 内で実体をセット）
  const resetStuckStateRef = useRef<() => void>(() => {});

  const ndItems = getNDChecklist(apparatus);
  const hasND = ndItems.length > 0;
  const hasCV = apparatus === 'FX' || apparatus === 'HB';
  const apparatusInfo = APPARATUS_LIST.find(a => a.code === apparatus);

  // 跳馬画像の状態
  const vaultImg = useRef<HTMLImageElement | null>(null);
  const [vtFlip, setVtFlip] = useState(() => localStorage.getItem(VT_IMG_FLIP_KEY) === 'true');
  const [vtScale, setVtScale] = useState(() => {
    const saved = localStorage.getItem(VT_IMG_SCALE_KEY);
    return saved ? parseFloat(saved) : 1.0;
  });

  // 跳馬画像の読み込み
  useEffect(() => {
    if (apparatus !== 'VT') return;
    if (vaultImg.current) return;
    const img = new Image();
    img.src = import.meta.env.BASE_URL + 'vault_image.jpeg';
    img.onload = () => {
      vaultImg.current = img;
      redrawStatic();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apparatus]);

  // === Context getters (desynchronized for active layer) ===
  const getStaticCtx = useCallback(() =>
    staticCanvasRef.current?.getContext('2d') ?? null, []);

  const getActiveCtx = useCallback((): CanvasRenderingContext2D | null => {
    const cv = activeCanvasRef.current;
    if (!cv) return null;
    return cv.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null;
  }, []);

  // --- 即時保存 ---
  // 注意: recordId 変更時に前の種目を保存する際、apparatus props は既に新しい値に
  // なっている可能性がある。そのため保存に必要な情報は全て引数で受け取る。
  const flushSave = useCallback((
    id: string,
    data: Stroke[],
    saveApparatus: Apparatus,
    saveAthleteName: string,
    savePageNumber: number,
    saveLines?: HLine[],
    saveScores?: DigitalScores,
    saveDigitalAthleteName?: string,
  ) => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const { w, h } = sizeRef.current;
    const linesToSave = saveLines ?? horizontalLines.current;
    const scoresToSave = saveScores ?? digitalScoresRef.current;
    db.memoRecords.put({
      id,
      sessionId,
      athleteName: saveAthleteName,
      apparatus: saveApparatus,
      pageNumber: savePageNumber,
      strokes: data.map(s => ({ points: s.points, color: s.color, width: s.width })),
      lines: linesToSave.length > 0 ? linesToSave : undefined,
      canvasW: w || undefined,
      canvasH: h || undefined,
      digitalScores: hasAnyScore(scoresToSave) ? scoresToSave : undefined,
      digitalAthleteName: saveDigitalAthleteName,
      updatedAt: new Date(),
    });
  }, [sessionId]);

  // --- デバウンス保存 ---
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveRef.current = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (suppressSaveRef.current) return;
      // 現在の値をキャプチャ
      const id = recordId;
      const a = apparatus;
      const an = athleteName;
      const pn = pageNumber;
      saveTimer.current = setTimeout(() => {
        if (suppressSaveRef.current) return;
        flushSave(
          id, strokes.current, a, an, pn,
          undefined,
          digitalScoresRef.current,
          digitalAthleteNameRef.current,
        );
      }, SAVE_DEBOUNCE);
    };
  }, [recordId, apparatus, athleteName, pageNumber, flushSave]);

  // === テンプレート描画 (Static Canvas のみ) ===
  const drawTemplate = useCallback(() => {
    const c = getStaticCtx();
    if (!c) return;
    const { w, h } = sizeRef.current;
    if (w === 0) return;

    const ndW = hasND ? Math.floor(w * ND_WIDTH_RATIO) : 0;
    const mainW = w - ndW;
    const scoreRowTop = h;  // スコア行は別DOMに移行済みのためCanvas全域が描画エリア

    c.save();

    // --- モード別ヘッダー領域 ---
    if (mode === 'trial' || mode === 'individual') {
      // 試技会モード: 選手名 + 種目名をラベル表示
      c.fillStyle = '#1B4F72';
      c.font = 'bold 16px "Noto Sans JP", sans-serif';
      const label = `${athleteName}\u3000${apparatus} ${apparatusInfo?.name ?? ''}`;
      c.fillText(label, 10, LABEL_H / 2 + 6);
      // ラベル下に薄い区切り線
      c.strokeStyle = '#ddd';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(0, LABEL_H);
      c.lineTo(w, LABEL_H);
      c.stroke();
    } else {
      // 大会モード: 種目名のみCanvasに描画。番号・選手名は HTML オーバーレイ (headerOverlay) で入力
      c.fillStyle = '#1B4F72';
      c.font = 'bold 16px "Noto Sans JP", sans-serif';
      const apparatusLabel = `${apparatus} ${apparatusInfo?.name ?? ''}`;
      c.fillText(apparatusLabel, 10, LABEL_H / 2 + 6);
      // ラベル下に薄い区切り線
      c.strokeStyle = '#ddd';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(0, LABEL_H);
      c.lineTo(w, LABEL_H);
      c.stroke();
    }

    // --- 跳馬画像（VT のみ） ---
    if (apparatus === 'VT' && vaultImg.current) {
      const img = vaultImg.current;
      const drawAreaTop = LABEL_H;
      const drawAreaBottom = scoreRowTop;
      const drawAreaH = drawAreaBottom - drawAreaTop;
      const drawAreaW = mainW;
      // 描画エリアに余裕を持って収まるようフィット（80%マージン）
      const fitScale = Math.min(
        (drawAreaW * 0.8) / img.width,
        (drawAreaH * 0.8) / img.height,
      );
      const scale = fitScale * vtScale;
      const imgW = Math.ceil(img.width * scale);
      const imgH = Math.ceil(img.height * scale);
      const cx = drawAreaW / 2;
      const cy = drawAreaTop + drawAreaH / 2;

      c.save();
      c.globalAlpha = 0.25;
      c.translate(cx, cy);
      if (vtFlip) c.scale(-1, 1);
      c.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH);
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

    // --- 横線（VT以外） ---
    if (apparatus !== 'VT') {
      for (const hl of horizontalLines.current) {
        // 線本体
        c.strokeStyle = '#000000';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(HLINE_LEFT_MARGIN, hl.y);
        c.lineTo(hl.right, hl.y);
        c.stroke();
        // 左ハンドル（塗りつぶし丸）— 移動用
        c.fillStyle = '#666';
        c.beginPath();
        c.arc(HLINE_LEFT_MARGIN, hl.y, HLINE_HANDLE_R, 0, Math.PI * 2);
        c.fill();
        // 右ハンドル（白抜き丸）— 長さ変更用
        c.strokeStyle = '#666';
        c.lineWidth = 2;
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(hl.right, hl.y, HLINE_HANDLE_R, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
    }

    c.restore();
  }, [getStaticCtx, hasND, hasCV, ndItems, mode, athleteName, apparatus, apparatusInfo, vtFlip, vtScale]);

  // === Static Canvas 全再描画 ===
  const redrawStatic = useCallback(() => {
    const c = getStaticCtx();
    const cv = staticCanvasRef.current;
    if (!c || !cv) return;
    c.clearRect(0, 0, cv.width, cv.height);
    drawTemplate();
    for (const s of strokes.current) drawSmoothStroke(c, s);
  }, [getStaticCtx, drawTemplate]);

  // === Active Canvas クリア ===
  const clearActive = useCallback(() => {
    const c = getActiveCtx();
    const cv = activeCanvasRef.current;
    if (!c || !cv) return;
    c.clearRect(0, 0, cv.width, cv.height);
  }, [getActiveCtx]);

  // --- recordId変更時: 前を保存 → 新を復元 ---
  useEffect(() => {
    if (prevRecordId.current && prevRecordId.current !== recordId) {
      if (suppressSaveRef.current) {
        // 削除/リナンバリング中: 保留中の保存タイマーだけキャンセルし、書き戻しはしない
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      } else {
        flushSave(
          prevRecordId.current, strokes.current,
          prevApparatus.current, prevAthleteName.current, prevPageNumber.current,
          undefined,
          digitalScoresRef.current,
          digitalAthleteNameRef.current,
        );
      }
    }
    prevRecordId.current = recordId;
    prevApparatus.current = apparatus;
    prevAthleteName.current = athleteName;
    prevPageNumber.current = pageNumber;

    db.memoRecords.get(recordId).then((saved) => {
      strokes.current = saved
        ? saved.strokes.map(s => ({ points: s.points, color: s.color, width: s.width ?? settingsRef.current.penWidth }))
        : [];
      // デジタルスコアの読み込み（人数差を吸収）
      const loadedScores = saved?.digitalScores;
      if (loadedScores) {
        const e = loadedScores.e.slice(0, eJudgeCount);
        while (e.length < eJudgeCount) e.push(undefined);
        setDigitalScores({ ...loadedScores, e });
      } else {
        setDigitalScores(emptyScores(eJudgeCount));
      }
      // 旧フォーマット(number[])からの移行対応
      const rawLines = saved?.lines ?? [];
      horizontalLines.current = rawLines.map((l: HLine | number) =>
        typeof l === 'number' ? { y: l, right: sizeRef.current.w * 0.8 } : l
      );
      pendingDefaultHorizontalLine.current = !saved
        && apparatus !== 'VT'
        && settingsRef.current.autoHorizontalLine;
      if (pendingDefaultHorizontalLine.current && sizeRef.current.w > 0 && sizeRef.current.h > 0) {
        horizontalLines.current = createDefaultHorizontalLines();
        pendingDefaultHorizontalLine.current = false;
        saveRef.current();
      }
      spatialGrid.current = rebuildGrid(strokes.current);
      redoStack.current = [];
      preClearSnapshot.current = null;
      preClearLinesSnapshot.current = null;
      redrawStatic();
      clearActive();
      // FIX: 横線削除ボタンの表示条件は horizontalLines.current.length に依存するが、
      // ref 変更だけでは再レンダーされない。読込時に setTick で表示を更新。
      setTick(t => t + 1);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  // === resize: 両Canvas を同期 ===
  useEffect(() => {
    const wrap = wrapRef.current;
    const staticCv = staticCanvasRef.current;
    const activeCv = activeCanvasRef.current;
    if (!staticCv || !activeCv || !wrap) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: rect.width, h: rect.height };

      for (const cv of [staticCv, activeCv]) {
        cv.width = rect.width * dpr;
        cv.height = rect.height * dpr;
      }
      // scale は getContext ごとにセットが必要
      const sc = staticCv.getContext('2d');
      if (sc) sc.scale(dpr, dpr);
      const ac = activeCv.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null;
      if (ac) ac.scale(dpr, dpr);

      redrawStatic();
      if (pendingDefaultHorizontalLine.current) {
        horizontalLines.current = createDefaultHorizontalLines();
        pendingDefaultHorizontalLine.current = false;
        redrawStatic();
        saveRef.current();
        setTick(t => t + 1);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apparatus, eJudgeCount]);

  useEffect(() => { redrawStatic(); }, [redrawStatic]);

  // redrawStatic / clearActive を ref 化し、Pointer Events の useEffect 依存を安定化
  const redrawStaticRef = useRef(redrawStatic);
  useEffect(() => { redrawStaticRef.current = redrawStatic; }, [redrawStatic]);
  const clearActiveRef = useRef(clearActive);
  useEffect(() => { clearActiveRef.current = clearActive; }, [clearActive]);
  const getStaticCtxRef = useRef(getStaticCtx);
  useEffect(() => { getStaticCtxRef.current = getStaticCtx; }, [getStaticCtx]);
  const getActiveCtxRef = useRef(getActiveCtx);
  useEffect(() => { getActiveCtxRef.current = getActiveCtx; }, [getActiveCtx]);

  // ページ離脱時に即時保存
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const id = prevRecordId.current;
      const scores = digitalScoresRef.current;
      const dn = digitalAthleteNameRef.current;
      const hasDigitalName = !!dn;
      if (id && (strokes.current.length > 0 || horizontalLines.current.length > 0 || hasAnyScore(scores) || hasDigitalName)) {
        const { w, h } = sizeRef.current;
        const data: StrokeData[] = strokes.current.map(s => ({ points: s.points, color: s.color, width: s.width }));
        db.memoRecords.put({
          id,
          sessionId,
          athleteName: prevAthleteName.current,
          apparatus: prevApparatus.current,
          pageNumber: prevPageNumber.current,
          strokes: data,
          lines: horizontalLines.current.length > 0 ? horizontalLines.current : undefined,
          canvasW: w || undefined,
          canvasH: h || undefined,
          digitalScores: hasAnyScore(scores) ? scores : undefined,
          digitalAthleteName: dn,
          updatedAt: new Date(),
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== ネイティブ Pointer Events（2層Canvas版・安定化） ==========
  // 依存配列を空にし、ref 経由で最新の関数を参照。描画中にリスナーが再登録されることを防ぐ。
  useEffect(() => {
    const activeCv = activeCanvasRef.current;
    if (!activeCv) return;

    let rafId: number | null = null;
    let straightDirty = false;
    let lastPtrEventTime = 0;   // 最終 pointer event 時刻 (自動復旧の判定用)
    let moveLogCounter = 0;     // move ログ間引き用

    const safeHasCapture = (id: number): boolean => {
      try { return activeCv.hasPointerCapture(id); } catch { return false; }
    };

    const getPos = (e: PointerEvent): Point => {
      const r = activeCv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const clearHold = () => {
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    };

    const startHold = (p: Point) => {
      clearHold();
      holdTimer.current = setTimeout(() => {
        if (!drawing.current || !cur.current) return;
        straight.current = true;
        const s = startPt.current!;
        cur.current = { points: [s, p], color: cur.current.color, width: cur.current.width };
        curDrawnIndex.current = 0;
        straightDirty = true;
        scheduleStraightRedraw();
      }, STRAIGHT_DELAY);
    };

    // 直線モード: rAF で Active Canvas に直線プレビュー
    const scheduleStraightRedraw = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!straightDirty || !cur.current) return;
        straightDirty = false;
        const ac = getActiveCtxRef.current();
        if (!ac || !activeCv) return;
        ac.clearRect(0, 0, activeCv.width, activeCv.height);
        const pts = cur.current.points;
        ac.strokeStyle = cur.current.color;
        ac.lineWidth = cur.current.width;
        ac.lineCap = 'round';
        ac.beginPath();
        ac.moveTo(pts[0].x, pts[0].y);
        ac.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ac.stroke();
      });
    };

    // FIX: iPad PWA でポインターが「迷子」になるのを防ぐため、保持中の pointer capture を確実に解放する
    const releaseCapture = (id: number | null) => {
      if (id == null) return;
      try {
        if (activeCv.hasPointerCapture(id)) activeCv.releasePointerCapture(id);
      } catch { /* ignore */ }
    };

    const finishStroke = () => {
      if (!drawing.current || !cur.current) return;
      logPtr({ ev: 'finish', d: drawing.current, a: activePointerId.current, note: `pts=${cur.current.points.length}` });
      releaseCapture(activePointerId.current);
      drawing.current = false;
      activePointerId.current = null;
      clearHold();
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      const finished = cur.current;
      cur.current = null;
      straight.current = false;
      straightDirty = false;
      curDrawnIndex.current = 0;

      // Active Canvas クリア
      clearActiveRef.current();

      // スクラブ消去判定（完成ストロークをまとめて分析）
      if (isScrubPattern(finished.points)) {
        const center = finished.points[Math.floor(finished.points.length / 2)];
        const idx = findStrokeAtIndexed(strokes.current, spatialGrid.current, center, ERASER_WIDTH);
        if (idx >= 0) {
          strokes.current.splice(idx, 1);
          spatialGrid.current = rebuildGrid(strokes.current);
          redoStack.current = [];
          redrawStaticRef.current();
          saveRef.current();
          return;
        }
      }

      if (finished.points.length < 2) return;

      // 確定ストロークを Static Canvas に描画
      const sc = getStaticCtxRef.current();
      if (sc) drawSmoothStroke(sc, finished);

      // データに追加
      const idx = strokes.current.length;
      strokes.current.push(finished);
      insertStroke(spatialGrid.current, idx, finished);
      redoStack.current = [];
      saveRef.current();
    };

    // 消しゴムモード: ポインター位置のストロークを削除
    const eraseAt = (p: Point) => {
      const idx = findStrokeAtIndexed(strokes.current, spatialGrid.current, p, ERASER_WIDTH);
      if (idx >= 0) {
        strokes.current.splice(idx, 1);
        spatialGrid.current = rebuildGrid(strokes.current);
        redoStack.current = [];
        redrawStaticRef.current();
        saveRef.current();
      }
    };

    // 消しゴムカーソル: Active Canvas に円を描画して消去範囲を可視化
    const drawEraserCursor = (p: Point) => {
      const ac = getActiveCtxRef.current();
      if (!ac || !activeCv) return;
      ac.clearRect(0, 0, activeCv.width, activeCv.height);
      ac.beginPath();
      ac.arc(p.x, p.y, ERASER_WIDTH, 0, Math.PI * 2);
      ac.strokeStyle = '#000000';
      ac.lineWidth = 2;
      ac.stroke();
    };

    const onDown = (e: PointerEvent) => {
      // FIX: 自動復旧 — drawing.current が残ったまま STALE_POINTER_MS 以上 pointer event が来ていなければ、
      // ステートが詰まっていると判断して強制リセットしてから新しい down を処理する
      const now = performance.now();
      if (drawing.current && lastPtrEventTime > 0 && now - lastPtrEventTime > STALE_POINTER_MS) {
        logPtr({ ev: 'auto-recover', d: drawing.current, a: activePointerId.current, note: `gap=${Math.round(now - lastPtrEventTime)}ms` });
        resetStuckState();
      }
      lastPtrEventTime = now;

      const isTouch = e.pointerType === 'touch';
      const p = getPos(e);
      logPtr({ ev: 'down', pt: e.pointerType, pid: e.pointerId, x: p.x, y: p.y, pr: e.pressure, d: drawing.current, a: activePointerId.current, cap: safeHasCapture(e.pointerId) });

      // 横線ハンドル判定（タッチでも操作可能、消しゴムモード時はタップで削除）
      if (horizontalLines.current.length > 0) {
        for (let i = 0; i < horizontalLines.current.length; i++) {
          const hl = horizontalLines.current[i];
          const onLeft = Math.hypot(p.x - HLINE_LEFT_MARGIN, p.y - hl.y) < HLINE_HANDLE_HIT;
          const onRight = Math.hypot(p.x - hl.right, p.y - hl.y) < HLINE_HANDLE_HIT;
          if (!onLeft && !onRight) continue;

          e.preventDefault();
          if (drawing.current) finishStroke();

          // 消しゴムモード: ハンドルタップでこの線を削除
          if (eraserMode.current) {
            horizontalLines.current.splice(i, 1);
            redrawStaticRef.current();
            saveRef.current();
            setTick(t => t + 1);
            return;
          }

          // 通常モード: ハンドルドラッグ開始
          activePointerId.current = e.pointerId;
          try { activeCv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
          draggingLineIdx.current = i;
          draggingHandle.current = onLeft ? 'left' : 'right';
          drawing.current = true;
          return;
        }
      }

      // タッチは描画に使わない（パームリジェクション）
      if (isTouch) return;

      e.preventDefault();
      if (drawing.current) finishStroke();
      activePointerId.current = e.pointerId;
      // FIX: iPad PWA で Apple Pencil のポインターを途中で見失わないよう capture
      try { activeCv.setPointerCapture(e.pointerId); } catch { /* ignore */ }

      // 消しゴムモード
      if (eraserMode.current) {
        drawing.current = true;
        cur.current = { points: [p], color: '', width: 0 }; // ダミー（finishStroke 用）
        eraseAt(p);
        drawEraserCursor(p);
        return;
      }

      drawing.current = true;
      straight.current = false;
      straightDirty = false;
      curDrawnIndex.current = 0;
      startPt.current = p;
      cur.current = { points: [p], color: colorRef.current, width: lineWidthRef.current };
      startHold(p);
    };

    const onMove = (e: PointerEvent) => {
      lastPtrEventTime = performance.now();
      // 異常検知: drawing 中なのに pointerId が違う move が来たら記録（高シグナル）
      if (drawing.current && activePointerId.current !== null && e.pointerId !== activePointerId.current) {
        logPtr({ ev: 'mismatch', pt: e.pointerType, pid: e.pointerId, d: drawing.current, a: activePointerId.current });
      }
      if (!drawing.current || e.pointerId !== activePointerId.current) return;
      // Apple Pencil が接触を終えたのに pointerup が届かず、hover の move だけ来るケースを完了扱いにする。
      if (e.pointerType === 'pen' && e.buttons === 0 && draggingLineIdx.current === null) {
        logPtr({ ev: 'pen-hover-finish', pt: e.pointerType, pid: e.pointerId, d: drawing.current, a: activePointerId.current });
        finishStroke();
        return;
      }
      // 間引きしてmove logを残す（直近の流れを把握）
      moveLogCounter++;
      if (moveLogCounter % 30 === 0) {
        logPtr({ ev: 'move', pt: e.pointerType, pid: e.pointerId, d: drawing.current, a: activePointerId.current, cap: safeHasCapture(e.pointerId) });
      }
      e.preventDefault();

      // 横線ハンドルドラッグ中
      if (draggingLineIdx.current !== null && draggingHandle.current) {
        const p = getPos(e);
        const hl = horizontalLines.current[draggingLineIdx.current];
        const { w, h } = sizeRef.current;
        const scoreRowTop = h - SCORE_ROW_H;
        if (draggingHandle.current === 'left') {
          // 左ハンドル: Y方向移動
          hl.y = Math.max(LABEL_H + 10, Math.min(scoreRowTop - 10, p.y));
        } else {
          // 右ハンドル: X方向の長さ変更
          hl.right = Math.max(HLINE_LEFT_MARGIN + 40, Math.min(w - 10, p.x));
        }
        redrawStaticRef.current();
        return;
      }

      // 消しゴムモード: 移動中もリアルタイム消去
      if (eraserMode.current) {
        const p = getPos(e);
        eraseAt(p);
        drawEraserCursor(p);
        return;
      }

      if (!cur.current) return;

      // FIX: getCoalescedEvents() は Safari で空配列を返す場合がある
      /* eslint-disable @typescript-eslint/no-explicit-any -- getCoalescedEvents is not in PointerEvent type yet */
      const coalesced: PointerEvent[] = typeof (e as any).getCoalescedEvents === 'function'
        ? (e as any).getCoalescedEvents()
        : [];
      /* eslint-enable @typescript-eslint/no-explicit-any */
      const events: PointerEvent[] = coalesced.length > 0 ? coalesced : [e];
      const prevDrawn = curDrawnIndex.current;

      for (const ce of events) {
        const p = getPos(ce);
        const pts = cur.current!.points;
        const prev = pts[pts.length - 1];
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;

        if (straight.current) {
          const s = startPt.current!;
          cur.current = { points: [s, p], color: cur.current!.color, width: cur.current!.width };
          curDrawnIndex.current = 0;
          straightDirty = true;
          continue;
        }

        // 直線判定タイマーのリセット
        if (ce === events[events.length - 1] && Math.hypot(dx, dy) > STRAIGHT_THRESHOLD) {
          startHold(p);
        }

        pts.push(p);
      }

      if (straight.current && straightDirty) {
        scheduleStraightRedraw();
      } else if (!straight.current) {
        // フリーハンド: Active Canvas にインクリメンタル曲線描画
        const ac = getActiveCtxRef.current();
        if (ac && cur.current) {
          drawIncrementalSmooth(ac, cur.current.points, cur.current.color, cur.current.width, prevDrawn);
          curDrawnIndex.current = cur.current.points.length - 1;
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      lastPtrEventTime = performance.now();
      logPtr({ ev: e.type, pt: e.pointerType, pid: e.pointerId, d: drawing.current, a: activePointerId.current, cap: safeHasCapture(e.pointerId) });
      if (e.pointerId !== activePointerId.current) return;

      // 横線ハンドルドラッグ完了
      if (draggingLineIdx.current !== null) {
        releaseCapture(activePointerId.current);
        draggingLineIdx.current = null;
        draggingHandle.current = null;
        drawing.current = false;
        activePointerId.current = null;
        saveRef.current();
        return;
      }

      const wasEraser = eraserMode.current;
      finishStroke();
      // 消しゴム使用後は自動でペンに戻る
      if (wasEraser) {
        eraserMode.current = false;
        setTick(t => t + 1);
      }
    };

    // FIX: pointerleave は iPad Safari で誤発火することがあるため、
    // 実際に Canvas 外に出た場合のみ finishStroke する。
    // また、setPointerCapture 中は leave しても引き続き events が届くのでスキップする。
    const onLeave = (e: PointerEvent) => {
      lastPtrEventTime = performance.now();
      if (e.pointerId !== activePointerId.current) return;
      logPtr({ ev: 'leave', pt: e.pointerType, pid: e.pointerId, d: drawing.current, a: activePointerId.current, cap: safeHasCapture(e.pointerId) });
      if (safeHasCapture(e.pointerId)) return;
      const rect = activeCv.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top || e.clientY > rect.bottom) {
        if (draggingLineIdx.current !== null) {
          releaseCapture(activePointerId.current);
          draggingLineIdx.current = null;
          draggingHandle.current = null;
          drawing.current = false;
          activePointerId.current = null;
          saveRef.current();
        } else {
          finishStroke();
        }
      }
    };

    // 2本指ダブルタップで undo
    let lastTwoFingerTap = 0;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const now = Date.now();
        if (now - lastTwoFingerTap < 500) {
          // ダブルタップ検出 → undo
          undoRef.current();
          lastTwoFingerTap = 0;
        } else {
          lastTwoFingerTap = now;
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); };

    // FIX: iPad PWA がバックグラウンド復帰したとき、描画中ステートが残ったまま戻ると
    // 以降の Apple Pencil 入力が無反応になる。復旧前に未確定ストロークを可能な限り保存する。
    const resetStuckState = () => {
      if (draggingLineIdx.current !== null) {
        releaseCapture(activePointerId.current);
        draggingLineIdx.current = null;
        draggingHandle.current = null;
        drawing.current = false;
        activePointerId.current = null;
        saveRef.current();
      } else if (drawing.current && cur.current && cur.current.points.length >= 2) {
        finishStroke();
      } else {
        releaseCapture(activePointerId.current);
        drawing.current = false;
        activePointerId.current = null;
        cur.current = null;
        clearActiveRef.current();
      }
      clearHold();
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      straight.current = false;
      straightDirty = false;
      startPt.current = null;
      curDrawnIndex.current = 0;
      draggingLineIdx.current = null;
      draggingHandle.current = null;
    };
    // 復旧ボタンから呼べるように ref に公開
    resetStuckStateRef.current = resetStuckState;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        logPtr({ ev: 'visibility:hidden', d: drawing.current, a: activePointerId.current });
        resetStuckState();
      } else {
        logPtr({ ev: 'visibility:visible' });
      }
    };
    const onBlurEvent = () => {
      logPtr({ ev: 'blur', d: drawing.current, a: activePointerId.current });
      resetStuckState();
    };
    const onPageHide = () => {
      logPtr({ ev: 'pagehide', d: drawing.current, a: activePointerId.current });
      resetStuckState();
    };

    // FIX: pointer capture を OS 側から強制解放されたら（iPad のジェスチャ等）即リセット
    const onLostCapture = (e: PointerEvent) => {
      logPtr({ ev: 'lostcapture', pid: e.pointerId, d: drawing.current, a: activePointerId.current });
      if (e.pointerId === activePointerId.current) {
        resetStuckState();
      }
    };

    // FIX: 定期ヘルスチェック — drawing.current が立ったまま STALE_POINTER_MS 経過したらバックグラウンドで自動復旧
    // (これまでは次の pointerdown 時にしか復旧できず、最初の1タップが空振りしていた)
    const healthCheckId = window.setInterval(() => {
      if (drawing.current && lastPtrEventTime > 0 && performance.now() - lastPtrEventTime > STALE_POINTER_MS) {
        logPtr({ ev: 'auto-recover-bg', d: drawing.current, a: activePointerId.current, note: `gap=${Math.round(performance.now() - lastPtrEventTime)}ms` });
        resetStuckState();
      }
    }, 1000);

    // FIX: Pencil 切断で Canvas が pointer capture を握ったまま無応答になり、
    // 復旧ボタンや指タップすら届かなくなるケースに対応。
    // document の capture phase で touchstart/pointerdown を傍受し、
    // ステートが詰まっていれば真っ先にリセットしてから本来のハンドラに渡す。
    const onAnyInputStart = () => {
      if (drawing.current || activePointerId.current !== null) {
        const gap = lastPtrEventTime > 0 ? performance.now() - lastPtrEventTime : Infinity;
        if (gap > STALE_POINTER_MS) {
          logPtr({ ev: 'doc-tap-recover', d: drawing.current, a: activePointerId.current, note: `gap=${Math.round(gap)}ms` });
          resetStuckState();
        }
      }
    };

    activeCv.addEventListener('touchstart', onTouchStart, { passive: false });
    activeCv.addEventListener('touchmove', onTouchMove, { passive: false });
    activeCv.addEventListener('pointerdown', onDown, { passive: false });
    activeCv.addEventListener('pointermove', onMove, { passive: false });
    activeCv.addEventListener('pointerup', onUp);
    activeCv.addEventListener('pointerleave', onLeave);
    activeCv.addEventListener('pointerout', onLeave);
    activeCv.addEventListener('pointercancel', onUp);
    activeCv.addEventListener('lostpointercapture', onLostCapture);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlurEvent);
    window.addEventListener('pagehide', onPageHide);
    // document レベルでも傍受（Canvas の pointer capture スコープ外で発火）
    document.addEventListener('touchstart', onAnyInputStart, { capture: true, passive: true });
    document.addEventListener('pointerdown', onAnyInputStart, { capture: true, passive: true });

    return () => {
      activeCv.removeEventListener('touchstart', onTouchStart);
      activeCv.removeEventListener('touchmove', onTouchMove);
      activeCv.removeEventListener('pointerdown', onDown);
      activeCv.removeEventListener('pointermove', onMove);
      activeCv.removeEventListener('pointerup', onUp);
      activeCv.removeEventListener('pointerleave', onLeave);
      activeCv.removeEventListener('pointerout', onLeave);
      activeCv.removeEventListener('pointercancel', onUp);
      activeCv.removeEventListener('lostpointercapture', onLostCapture);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlurEvent);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('touchstart', onAnyInputStart, { capture: true } as EventListenerOptions);
      document.removeEventListener('pointerdown', onAnyInputStart, { capture: true } as EventListenerOptions);
      window.clearInterval(healthCheckId);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []); // 依存配列空: ref 経由で最新関数を参照するため再登録不要

  // === UI Actions ===
  // 描画中の状態をリセットしてからUI操作を実行（iPad でボタンタップ時の競合防止）
  const cancelDrawing = () => {
    const cv = activeCanvasRef.current;
    const id = activePointerId.current;
    if (cv && id != null) {
      try { if (cv.hasPointerCapture(id)) cv.releasePointerCapture(id); } catch { /* ignore */ }
    }
    drawing.current = false;
    activePointerId.current = null;
    cur.current = null;
    clearActiveRef.current();
  };

  const undo = () => {
    cancelDrawing();
    // 全消去直後: スナップショットから全復元
    if (strokes.current.length === 0 && preClearSnapshot.current) {
      strokes.current = preClearSnapshot.current;
      preClearSnapshot.current = null;
      if (preClearLinesSnapshot.current) {
        horizontalLines.current = preClearLinesSnapshot.current;
        preClearLinesSnapshot.current = null;
      }
      spatialGrid.current = rebuildGrid(strokes.current);
      redoStack.current = [];
      redrawStaticRef.current();
      saveRef.current();
      setTick(t => t + 1);
      return;
    }
    if (strokes.current.length === 0) return;
    redoStack.current.push(strokes.current.pop()!);
    spatialGrid.current = rebuildGrid(strokes.current);
    redrawStaticRef.current();
    saveRef.current();
    setTick(t => t + 1);
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redo = () => {
    cancelDrawing();
    if (redoStack.current.length === 0) return;
    const s = redoStack.current.pop()!;
    const idx = strokes.current.length;
    strokes.current.push(s);
    insertStroke(spatialGrid.current, idx, s);
    redrawStaticRef.current();
    saveRef.current();
    setTick(t => t + 1);
  };
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const clear = () => {
    cancelDrawing();
    if (strokes.current.length > 0 || horizontalLines.current.length > 0) {
      preClearSnapshot.current = [...strokes.current];
      preClearLinesSnapshot.current = [...horizontalLines.current];
    }
    strokes.current = [];
    horizontalLines.current = [];
    spatialGrid.current = createGrid();
    redoStack.current = [];
    redrawStaticRef.current();
    clearActiveRef.current();
    saveRef.current();
    setTick(t => t + 1);
  };
  const pickColor = (c: string) => { colorRef.current = c; eraserMode.current = false; setTick(t => t + 1); };
  const toggleEraser = () => { eraserMode.current = !eraserMode.current; setTick(t => t + 1); };
  const setLineWidth = (w: number) => {
    const next = updateJudgeSettings({ penWidth: w });
    settingsRef.current = next;
    lineWidthRef.current = next.penWidth;
    setTick(t => t + 1);
  };

  // 復旧ボタン: Apple Pencil 切断時等で描画ステートが詰まった場合の手動リセット
  const [recovering, setRecovering] = useState(false);
  const recoverNow = () => {
    resetStuckStateRef.current();
    redrawStaticRef.current();
    setRecovering(true);
    window.setTimeout(() => setRecovering(false), 700);
  };
  const createDefaultHorizontalLine = (): HLine => {
    const { w, h } = sizeRef.current;
    const scoreRowTop = h - SCORE_ROW_H;
    const drawTop = LABEL_H;
    const drawBottom = scoreRowTop;
    // 基準Y: 描画エリアの中央
    let newY = drawTop + (drawBottom - drawTop) / 2;
    // 既存線と重ならないようオフセット
    const existing = horizontalLines.current;
    for (let attempts = 0; attempts < 20; attempts++) {
      const overlap = existing.some(l => Math.abs(l.y - newY) < HLINE_OFFSET_Y);
      if (!overlap) break;
      newY += HLINE_OFFSET_Y;
      if (newY > drawBottom - 20) newY = drawTop + 20;
    }
    const defaultRight = Math.max(
      HLINE_LEFT_MARGIN + 40,
      Math.floor(w * settingsRef.current.horizontalLineLengthRatio) - 10,
    );
    return { y: newY, right: defaultRight };
  };

  // 種目に応じた既定本数で初期横線を生成。FXは設定に従い1or2本、それ以外は1本。
  const createDefaultHorizontalLines = (): HLine[] => {
    const count = apparatus === 'FX' ? settingsRef.current.fxDefaultHorizontalLines : 1;
    const lines: HLine[] = [];
    const saved = horizontalLines.current;
    horizontalLines.current = lines;
    for (let i = 0; i < count; i++) lines.push(createDefaultHorizontalLine());
    horizontalLines.current = saved;
    return lines;
  };

  // 横線追加
  const addHorizontalLine = () => {
    horizontalLines.current.push(createDefaultHorizontalLine());
    redrawStaticRef.current();
    saveRef.current();
    setTick(t => t + 1);
  };

  // 横線削除（最後に追加されたものを削除）
  const removeLastHorizontalLine = () => {
    if (horizontalLines.current.length === 0) return;
    horizontalLines.current.pop();
    redrawStaticRef.current();
    saveRef.current();
    setTick(t => t + 1);
  };

  // 跳馬画像: 左右反転
  const toggleVtFlip = () => {
    setVtFlip(prev => {
      const next = !prev;
      localStorage.setItem(VT_IMG_FLIP_KEY, String(next));
      return next;
    });
  };
  // 跳馬画像: サイズ変更（サイクル）
  const cycleVtScale = () => {
    setVtScale(prev => {
      const idx = VT_SCALE_OPTIONS.indexOf(prev);
      const next = VT_SCALE_OPTIONS[(idx + 1) % VT_SCALE_OPTIONS.length];
      localStorage.setItem(VT_IMG_SCALE_KEY, String(next));
      return next;
    });
  };

  const handleApparatusChange = (a: Apparatus) => {
    flushSave(
      recordId, strokes.current, apparatus, athleteName, pageNumber,
      undefined, digitalScoresRef.current, digitalAthleteNameRef.current,
    );
    if (onApparatusChange) {
      onApparatusChange(a);
    } else {
      const path = judgeMode === 'E' ? `/judge/${a}/e?eCount=${eJudgeCount}` : `/judge/${a}/d`;
      navigate(path, { replace: true });
    }
  };

  const handleBack = () => {
    flushSave(
      recordId, strokes.current, apparatus, athleteName, pageNumber,
      undefined, digitalScoresRef.current, digitalAthleteNameRef.current,
    );
    if (onBack) onBack();
    else navigate('/');
  };

  void tick;

  const handleScoreChange = (next: DigitalScores) => {
    setDigitalScores(next);
    digitalScoresRef.current = next;
    saveRef.current();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden select-none bg-white dark:bg-gray-950">
      {/* ツールバー（タッチ44px以上・タップ高速化） */}
      {/* touchAction: manipulation で 300ms 遅延を抑止し、isolation で Canvas 側ポインターキャプチャから分離 */}
      {/* onPointerDown 保険: Canvas に詰まったポインターキャプチャをツールバータップ時に強制解放
          (Apple Pencil 切断で drawing 状態が残ったまま toolbar が無反応化する事象への対策) */}
      <div className="flex items-center gap-2 px-2 py-2 bg-gray-100 dark:bg-gray-800 shrink-0 whitespace-nowrap overflow-x-auto relative z-10"
           style={{ touchAction: 'manipulation', isolation: 'isolate' }}
           onPointerDownCapture={() => {
             if (drawing.current || activePointerId.current !== null) {
               logPtr({ ev: 'toolbar-tap-recover', d: drawing.current, a: activePointerId.current });
               resetStuckStateRef.current();
             }
           }}>
        {/* ペン色選択（小さめの丸） */}
        <div className="flex items-center gap-1.5 px-1 min-h-[44px]">
          {COLORS.map((c) => (
            <button key={c.value} onClick={() => pickColor(c.value)}
              className={`w-6 h-6 rounded-full border-2 transition-transform shrink-0 ${
                !eraserMode.current && colorRef.current === c.value
                  ? 'border-accent scale-110 ring-2 ring-accent/30'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              style={{ backgroundColor: c.value }} />
          ))}
        </div>

        <div className="w-px h-6 bg-gray-300" />

        {/* 消しゴム（正方形・アイコンのみ） */}
        <button onClick={toggleEraser}
          title="消しゴム"
          className={`flex items-center justify-center w-11 h-11 rounded-md transition-all shrink-0 ${
            eraserMode.current
              ? 'bg-danger text-white shadow-md ring-2 ring-danger/30'
              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
          }`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.6 1.6c.8-.8 2-.8 2.8 0L21.4 5.6c.8.8.8 2 0 2.8L12 18" />
            <path d="M6 12l5.4-5.4" />
          </svg>
        </button>

        <div className="w-px h-6 bg-gray-300" />

        {/* 線の太さ */}
        <div className="flex items-center gap-1 min-h-[44px]">
          <svg width="12" height="12" viewBox="0 0 20 20" className="text-gray-400 shrink-0">
            <circle cx="10" cy="10" r={Math.max(2, lineWidthRef.current * 2.5)} fill="currentColor" />
          </svg>
          <input type="range" min="0.5" max="6" step="0.5"
            value={lineWidthRef.current}
            onChange={(e) => setLineWidth(parseFloat(e.target.value))}
            className="w-16 h-2 accent-accent cursor-pointer" />
          <span className="text-[10px] text-gray-400 font-mono w-4 text-center">{lineWidthRef.current}</span>
        </div>

        <div className="w-px h-6 bg-gray-300" />

        {/* Undo/Redo/Clear */}
        <button onClick={undo}
          className="px-2 py-1.5 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300
                     hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 min-h-[44px] min-w-[44px]">
          ↩
        </button>
        <button onClick={redo}
          className="px-2 py-1.5 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300
                     hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 min-h-[44px] min-w-[44px]">
          ↪
        </button>
        <button onClick={clear}
          className="px-2 py-1.5 rounded-lg text-xs text-danger font-bold min-h-[44px]
                     hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100">
          全消去
        </button>

        <div className="w-px h-6 bg-gray-300" />

        {/* 復旧: Apple Pencil 切断やステート詰まりの手動リセット */}
        <button onClick={recoverNow}
          title="Apple Pencil が反応しなくなった時にタップ。書いた内容は消えません。"
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold min-h-[44px] transition-all ${
            recovering
              ? 'bg-success text-white ring-2 ring-success/30'
              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          {recovering ? '復旧OK' : '復旧'}
        </button>

        <div className="w-px h-6 bg-gray-300" />

        {/* 横線（VT以外） */}
        {apparatus !== 'VT' && (
          <>
            <div className="w-px h-6 bg-gray-300" />
            <button onClick={addHorizontalLine}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold min-h-[44px]
                         bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 12h18" />
                <path d="M12 5v4M12 15v4" />
              </svg>
              横線
            </button>
            {horizontalLines.current.length > 0 && (
              <button onClick={removeLastHorizontalLine}
                title="最後に追加した横線を削除（消しゴムモードでは線端のハンドルをタップして個別削除）"
                className="px-2 py-1.5 rounded-lg text-xs text-gray-500 min-h-[44px]
                           hover:bg-gray-200 dark:hover:bg-gray-600">
                横線削除
              </button>
            )}
          </>
        )}

        {/* 跳馬画像操作（VTのみ） */}
        {apparatus === 'VT' && (
          <>
            <div className="w-px h-6 bg-gray-300" />
            <button onClick={toggleVtFlip}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold min-h-[44px] transition-all ${
                vtFlip
                  ? 'bg-accent text-white ring-2 ring-accent/30'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
              }`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" />
                <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
                <path d="M12 20v2" />
                <path d="M12 14v2" />
                <path d="M12 8v2" />
                <path d="M12 2v2" />
              </svg>
              反転
            </button>
            <button onClick={cycleVtScale}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold min-h-[44px]
                         bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
                <path d="M11 8v6" />
                <path d="M8 11h6" />
              </svg>
              {Math.round(vtScale * 100)}%
            </button>
          </>
        )}

        {toolbarExtra}

        <div className="ml-auto flex items-center gap-1.5">
          {showApparatusTabs && APPARATUS_LIST.map((a) => (
            <button key={a.code} onClick={() => handleApparatusChange(a.code)}
              className={`px-2.5 py-1 rounded text-xs font-bold min-h-[36px] ${
                apparatus === a.code ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}>
              {a.code}
            </button>
          ))}
          <button onClick={handleBack}
            className="px-3 py-1 rounded text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-1 min-h-[36px]">
            {onBack ? '← 戻る' : 'ホーム'}
          </button>
        </div>
      </div>

      {/* 2層Canvas: Static(下) + Active(上) を絶対配置で重ねる */}
      <div ref={wrapRef} className="flex-1 min-h-0 relative" style={{ touchAction: 'none' }}>
        <canvas ref={staticCanvasRef}
          className="absolute inset-0 w-full h-full bg-white dark:bg-gray-950"
          style={{ touchAction: 'none', userSelect: 'none', pointerEvents: 'none' }} />
        <canvas ref={activeCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{
            touchAction: 'none',
            userSelect: 'none',
            cursor: eraserMode.current
              ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${ERASER_WIDTH * 2}' height='${ERASER_WIDTH * 2}'%3E%3Ccircle cx='${ERASER_WIDTH}' cy='${ERASER_WIDTH}' r='${ERASER_WIDTH - 1}' fill='none' stroke='%23E74C3C' stroke-width='2'/%3E%3C/svg%3E") ${ERASER_WIDTH} ${ERASER_WIDTH}, crosshair`
              : 'crosshair',
          }} />
        {/* ヘッダー領域オーバーレイ（番号・選手名の直接入力） */}
        {headerOverlay && (
          <div
            className="absolute left-0 right-0 top-0 flex items-center pointer-events-none"
            style={{ height: LABEL_H }}
          >
            <div className="flex-1 pointer-events-auto">{headerOverlay}</div>
          </div>
        )}
      </div>

      {/* デジタルスコア入力バー（Canvas下部、薄め2段） */}
      <ScoreInputBar
        value={digitalScores}
        eJudgeCount={eJudgeCount}
        onChange={handleScoreChange}
      />
    </div>
  );
}

// 空間インデックス付きストローク検索
function findStrokeAtIndexed(
  strokes: Stroke[], grid: SpatialGrid, p: Point, threshold: number,
): number {
  const candidates = queryNear(grid, p, threshold);
  let best = -1;
  for (const si of candidates) {
    if (si >= strokes.length) continue;
    const pts = strokes[si].points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, lenSq = dx * dx + dy * dy;
      let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) < threshold) {
        // 最も上のストロークを優先
        if (si > best) best = si;
      }
    }
  }
  return best;
}
