import { useRef, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Apparatus } from '../types';
import { APPARATUS_LIST } from '../constants/apparatus';
import { getNDChecklist } from '../constants/deductions';
import { db } from '../db/database';
import type { StrokeData } from '../db/database';

interface Point { x: number; y: number }
interface Stroke { points: Point[]; color: string }

interface Props {
  apparatus: Apparatus;
  judgeMode: 'D' | 'E';
  eJudgeCount: number;
  recordId: string;
  sessionId: string;
  mode: 'trial' | 'competition';
  athleteName?: string;
  pageNumber?: number;
  showApparatusTabs?: boolean;
  toolbarExtra?: ReactNode;
  onBack?: () => void;
  onApparatusChange?: (apparatus: Apparatus) => void;
}

const COLORS = [
  { value: '#000000' },
  { value: '#E74C3C' },
  { value: '#2E86C1' },
];
const LINE_WIDTH = 2;
const ERASER_WIDTH = 28;
const STRAIGHT_DELAY = 1500;
const STRAIGHT_THRESHOLD = 4;
const SCRUB_DIRS_NEEDED = 4;
const SAVE_DEBOUNCE = 1500;

// レイアウト定数
const LABEL_H = 52;          // モード別ラベル領域の高さ
const SCORE_ROW_H = 160;
const CV_LABEL_H = 28;
const ND_WIDTH_RATIO = 0.2;
const NAME_BOX_W = 360;      // 大会モード: 選手名記入欄の幅
const NAME_BOX_H = 44;       // 大会モード: 選手名記入欄の高さ

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

// ---------- ベジェ曲線描画 ----------
function drawSmoothStroke(c: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.points;
  if (pts.length < 2) return;
  c.strokeStyle = s.color;
  c.lineWidth = LINE_WIDTH;
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
  fromIndex: number,
) {
  if (pts.length < 2 || fromIndex < 1) return;
  c.strokeStyle = color;
  c.lineWidth = LINE_WIDTH;
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
}: Props) {
  // === Refs ===
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const strokes = useRef<Stroke[]>([]);
  const spatialGrid = useRef<SpatialGrid>(createGrid());
  const redoStack = useRef<Stroke[]>([]);
  const cur = useRef<Stroke | null>(null);
  const curDrawnIndex = useRef(0); // Active Canvas にどこまで描画済みか
  const colorRef = useRef('#000000');
  const eraserMode = useRef(false);
  const drawing = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const straight = useRef(false);
  const startPt = useRef<Point | null>(null);
  const scrubDirs = useRef<number[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const prevRecordId = useRef<string>('');
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);

  const ndItems = getNDChecklist(apparatus);
  const hasND = ndItems.length > 0;
  const hasCV = apparatus === 'FX' || apparatus === 'HB';
  const apparatusInfo = APPARATUS_LIST.find(a => a.code === apparatus);

  // === Context getters (desynchronized for active layer) ===
  const getStaticCtx = useCallback(() =>
    staticCanvasRef.current?.getContext('2d') ?? null, []);

  const getActiveCtx = useCallback((): CanvasRenderingContext2D | null => {
    const cv = activeCanvasRef.current;
    if (!cv) return null;
    return cv.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings) as CanvasRenderingContext2D | null;
  }, []);

  // --- 即時保存 ---
  const flushSave = useCallback((id: string, data: Stroke[]) => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (data.length === 0 && !prevRecordId.current) return;
    db.memoRecords.put({
      id,
      sessionId,
      athleteName,
      apparatus,
      pageNumber,
      strokes: data.map(s => ({ points: s.points, color: s.color })),
      updatedAt: new Date(),
    });
  }, [sessionId, athleteName, apparatus, pageNumber]);

  // --- デバウンス保存 ---
  const saveRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveRef.current = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const id = recordId;
      saveTimer.current = setTimeout(() => {
        flushSave(id, strokes.current);
      }, SAVE_DEBOUNCE);
    };
  }, [recordId, flushSave]);

  // === テンプレート描画 (Static Canvas のみ) ===
  const drawTemplate = useCallback(() => {
    const c = getStaticCtx();
    if (!c) return;
    const { w, h } = sizeRef.current;
    if (w === 0) return;

    const scoreH = SCORE_ROW_H;
    const ndW = hasND ? Math.floor(w * ND_WIDTH_RATIO) : 0;
    const mainW = w - ndW;
    const scoreRowTop = h - scoreH;

    c.save();

    // --- モード別ヘッダー領域 ---
    if (mode === 'trial') {
      // 試技会モード: 選手名 + 種目名をラベル表示
      c.fillStyle = '#1B4F72';
      c.font = 'bold 16px "Noto Sans JP", sans-serif';
      const label = `${athleteName}　${apparatus} ${apparatusInfo?.name ?? ''}`;
      c.fillText(label, 10, LABEL_H / 2 + 6);
      // ラベル下に薄い区切り線
      c.strokeStyle = '#ddd';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(0, LABEL_H);
      c.lineTo(w, LABEL_H);
      c.stroke();
    } else {
      // 大会モード: 種目名 + 大きめの選手名記入枠
      c.fillStyle = '#1B4F72';
      c.font = 'bold 16px "Noto Sans JP", sans-serif';
      const apparatusLabel = `${apparatus} ${apparatusInfo?.name ?? ''}`;
      c.fillText(apparatusLabel, 10, LABEL_H / 2 + 6);
      // 選手名手書き記入枠
      const boxX = c.measureText(apparatusLabel).width + 28;
      const boxY = (LABEL_H - NAME_BOX_H) / 2;
      c.strokeStyle = '#888';
      c.lineWidth = 1.5;
      c.strokeRect(boxX, boxY, NAME_BOX_W, NAME_BOX_H);
      c.fillStyle = '#ccc';
      c.font = '12px "Noto Sans JP", sans-serif';
      c.fillText('選手名 / No.', boxX + 8, boxY + 14);
      // ラベル下に薄い区切り線
      c.strokeStyle = '#ddd';
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(0, LABEL_H);
      c.lineTo(w, LABEL_H);
      c.stroke();
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
  }, [getStaticCtx, hasND, hasCV, ndItems, eJudgeCount, mode, athleteName, apparatus, apparatusInfo]);

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
      flushSave(prevRecordId.current, strokes.current);
    }
    prevRecordId.current = recordId;

    db.memoRecords.get(recordId).then((saved) => {
      strokes.current = saved
        ? saved.strokes.map(s => ({ points: s.points, color: s.color }))
        : [];
      spatialGrid.current = rebuildGrid(strokes.current);
      redoStack.current = [];
      redrawStatic();
      clearActive();
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
      if (id && strokes.current.length > 0) {
        const data: StrokeData[] = strokes.current.map(s => ({ points: s.points, color: s.color }));
        db.memoRecords.put({
          id,
          sessionId,
          athleteName,
          apparatus,
          pageNumber,
          strokes: data,
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
        cur.current = { points: [s, p], color: cur.current.color };
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
        ac.lineWidth = LINE_WIDTH;
        ac.lineCap = 'round';
        ac.beginPath();
        ac.moveTo(pts[0].x, pts[0].y);
        ac.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ac.stroke();
      });
    };

    const finishStroke = () => {
      if (!drawing.current || !cur.current) return;
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

      // スクラブ消去判定
      if (scrubDirs.current.length >= SCRUB_DIRS_NEEDED && finished.points.length > 5) {
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

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      if (drawing.current) finishStroke();
      activePointerId.current = e.pointerId;
      const p = getPos(e);

      // 消しゴムモード
      if (eraserMode.current) {
        drawing.current = true;
        cur.current = { points: [p], color: '' }; // ダミー（finishStroke 用）
        eraseAt(p);
        return;
      }

      drawing.current = true;
      straight.current = false;
      straightDirty = false;
      scrubDirs.current = [];
      curDrawnIndex.current = 0;
      startPt.current = p;
      cur.current = { points: [p], color: colorRef.current };
      startHold(p);
    };

    const onMove = (e: PointerEvent) => {
      if (!drawing.current || e.pointerId !== activePointerId.current) return;
      e.preventDefault();

      // 消しゴムモード: 移動中もリアルタイム消去
      if (eraserMode.current) {
        const p = getPos(e);
        eraseAt(p);
        return;
      }

      if (!cur.current) return;

      // FIX: getCoalescedEvents() は Safari で空配列を返す場合がある
      const coalesced = typeof (e as any).getCoalescedEvents === 'function'
        ? (e as any).getCoalescedEvents() as PointerEvent[]
        : [];
      const events: PointerEvent[] = coalesced.length > 0 ? coalesced : [e];
      const prevDrawn = curDrawnIndex.current;

      for (const ce of events) {
        const p = getPos(ce);
        const pts = cur.current!.points;
        const prev = pts[pts.length - 1];
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;

        // スクラブ方向検出（最後のイベントのみ）
        if (ce === events[events.length - 1] && Math.abs(dx) > 2) {
          const d = dx > 0 ? 1 : -1;
          const sd = scrubDirs.current;
          if (sd.length === 0 || sd[sd.length - 1] !== d) sd.push(d);
        }

        if (straight.current) {
          const s = startPt.current!;
          cur.current = { points: [s, p], color: cur.current!.color };
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
          drawIncrementalSmooth(ac, cur.current.points, cur.current.color, prevDrawn);
          curDrawnIndex.current = cur.current.points.length - 1;
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      finishStroke();
    };

    // FIX: pointerleave は iPad Safari で誤発火することがあるため、
    // 実際に Canvas 外に出た場合のみ finishStroke する
    const onLeave = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      const rect = activeCv.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top || e.clientY > rect.bottom) {
        finishStroke();
      }
    };

    // FIX: iPadOS Scribble がペンイベントを横取りする問題への対策
    // touch イベントを preventDefault して Scribble の介入を防ぐ
    const onTouchStart = (e: TouchEvent) => { e.preventDefault(); };
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); };

    activeCv.addEventListener('touchstart', onTouchStart, { passive: false });
    activeCv.addEventListener('touchmove', onTouchMove, { passive: false });
    activeCv.addEventListener('pointerdown', onDown, { passive: false });
    activeCv.addEventListener('pointermove', onMove, { passive: false });
    activeCv.addEventListener('pointerup', onUp);
    activeCv.addEventListener('pointerleave', onLeave);
    activeCv.addEventListener('pointercancel', onUp);

    return () => {
      activeCv.removeEventListener('touchstart', onTouchStart);
      activeCv.removeEventListener('touchmove', onTouchMove);
      activeCv.removeEventListener('pointerdown', onDown);
      activeCv.removeEventListener('pointermove', onMove);
      activeCv.removeEventListener('pointerup', onUp);
      activeCv.removeEventListener('pointerleave', onLeave);
      activeCv.removeEventListener('pointercancel', onUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 依存配列空: ref 経由で最新関数を参照するため再登録不要

  // === UI Actions (React state は最小限) ===
  const undo = () => {
    if (strokes.current.length === 0) return;
    redoStack.current.push(strokes.current.pop()!);
    spatialGrid.current = rebuildGrid(strokes.current);
    redrawStatic();
    saveRef.current();
    setTick(t => t + 1);
  };
  const redo = () => {
    if (redoStack.current.length === 0) return;
    const s = redoStack.current.pop()!;
    const idx = strokes.current.length;
    strokes.current.push(s);
    insertStroke(spatialGrid.current, idx, s);
    redrawStatic();
    saveRef.current();
    setTick(t => t + 1);
  };
  const clear = () => {
    strokes.current = [];
    spatialGrid.current = createGrid();
    redoStack.current = [];
    redrawStatic();
    clearActive();
    saveRef.current();
    setTick(t => t + 1);
  };
  const pickColor = (c: string) => { colorRef.current = c; eraserMode.current = false; setTick(t => t + 1); };
  const toggleEraser = () => { eraserMode.current = !eraserMode.current; setTick(t => t + 1); };

  const handleApparatusChange = (a: Apparatus) => {
    flushSave(recordId, strokes.current);
    if (onApparatusChange) {
      onApparatusChange(a);
    } else {
      const path = judgeMode === 'E' ? `/judge/${a}/e?eCount=${eJudgeCount}` : `/judge/${a}/d`;
      navigate(path, { replace: true });
    }
  };

  const handleBack = () => {
    flushSave(recordId, strokes.current);
    if (onBack) onBack();
    else navigate('/');
  };

  void tick;

  return (
    <div className="h-screen flex flex-col overflow-hidden select-none">
      {/* ツールバー（大きめ・タッチ操作しやすいサイズ） */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 shrink-0">
        {/* ペン色選択 */}
        {COLORS.map((c) => (
          <button key={c.value} onClick={() => pickColor(c.value)}
            className={`w-8 h-8 rounded-full border-2 transition-transform ${
              !eraserMode.current && colorRef.current === c.value
                ? 'border-accent scale-110 ring-2 ring-accent/30'
                : 'border-gray-300 dark:border-gray-600'
            }`}
            style={{ backgroundColor: c.value }} />
        ))}

        <div className="w-px h-6 bg-gray-300" />

        {/* 消しゴム */}
        <button onClick={toggleEraser}
          className={`px-3 py-1 rounded text-sm font-bold min-h-[36px] transition-colors ${
            eraserMode.current
              ? 'bg-danger text-white'
              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}>
          消しゴム
        </button>

        <div className="w-px h-6 bg-gray-300" />

        {/* Undo/Redo/Clear */}
        <button onClick={undo} className="px-2.5 py-1 rounded text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 min-h-[36px]">↩ 戻す</button>
        <button onClick={redo} className="px-2.5 py-1 rounded text-sm bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 min-h-[36px]">↪ やり直し</button>
        <button onClick={clear} className="px-2.5 py-1 rounded text-sm text-danger font-bold min-h-[36px]">全消去</button>

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
          className="absolute inset-0 w-full h-full cursor-crosshair"
          style={{ touchAction: 'none', userSelect: 'none' }} />
      </div>
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
