import { useRef, useState, useCallback, useEffect } from 'react';

interface Point { x: number; y: number }

interface Stroke {
  points: Point[];
  color: string;
}

interface Props {
  onSave?: (dataUrl: string) => void;
}

const COLORS = [
  { name: '黒', value: '#000000' },
  { name: '赤', value: '#E74C3C' },
  { name: '青', value: '#2E86C1' },
];

const LINE_WIDTH = 2;
const ERASER_WIDTH = 28;
// 長押し直線化: この時間(ms)ペンが止まったら直線にスナップ
const STRAIGHT_LINE_DELAY = 400;
const STRAIGHT_LINE_MOVE_THRESHOLD = 4; // この距離以内なら「止まっている」と判定
// こすり削除: 短い往復でストロークを消す
const SCRUB_DIRECTION_CHANGES = 4; // 方向転換回数がこれ以上で「こすり」判定

export default function HandwritingCanvas({ onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const [strokeCount, setStrokeCount] = useState(0); // re-render trigger
  const redoStackRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState('#000000');
  const isDrawing = useRef(false);

  // 長押し直線化用
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMoveTimeRef = useRef(0);
  const isStraightModeRef = useRef(false);
  const strokeStartRef = useRef<Point | null>(null);

  // こすり検出用
  const scrubDirsRef = useRef<number[]>([]);

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d'), []);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.points.length < 2) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke);
    }
  }, [getCtx, drawStroke]);

  // resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
      redrawAll();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

  // ストロークとの距離判定（こすり削除用）
  const findStrokeAt = useCallback((p: Point, threshold: number): number => {
    const strokes = strokesRef.current;
    for (let si = strokes.length - 1; si >= 0; si--) {
      const pts = strokes[si].points;
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(p, pts[i], pts[i + 1]) < threshold) return si;
      }
    }
    return -1;
  }, []);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  };

  const startHoldTimer = (pos: Point) => {
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      // 直線モードに突入
      if (!isDrawing.current || !currentStrokeRef.current) return;
      isStraightModeRef.current = true;
      // ストロークを始点→現在点の直線に置き換え
      const start = strokeStartRef.current!;
      currentStrokeRef.current = { points: [start, pos], color: currentStrokeRef.current.color };
      redrawAll();
      drawStraightPreview(start, pos);
    }, STRAIGHT_LINE_DELAY);
  };

  const drawStraightPreview = (from: Point, to: Point) => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawing.current = true;
    isStraightModeRef.current = false;
    scrubDirsRef.current = [];
    const pos = getPos(e);
    strokeStartRef.current = pos;
    currentStrokeRef.current = { points: [pos], color };
    lastMoveTimeRef.current = Date.now();
    startHoldTimer(pos);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current || !currentStrokeRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    const pts = currentStrokeRef.current.points;
    const prev = pts[pts.length - 1];
    const d = dist(prev, pos);

    // こすり方向検出
    const dx = pos.x - prev.x;
    if (Math.abs(dx) > 2) {
      const dir = dx > 0 ? 1 : -1;
      const dirs = scrubDirsRef.current;
      if (dirs.length === 0 || dirs[dirs.length - 1] !== dir) {
        dirs.push(dir);
      }
    }

    if (isStraightModeRef.current) {
      // 直線モード: 始点→現在のプレビュー
      const start = strokeStartRef.current!;
      currentStrokeRef.current = { points: [start, pos], color: currentStrokeRef.current.color };
      redrawAll();
      drawStraightPreview(start, pos);
      return;
    }

    // 動きがある場合はタイマーリセット
    if (d > STRAIGHT_LINE_MOVE_THRESHOLD) {
      startHoldTimer(pos);
    }

    pts.push(pos);
    const ctx = getCtx();
    if (!ctx) return;
    ctx.strokeStyle = currentStrokeRef.current.color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!isDrawing.current || !currentStrokeRef.current) return;
    isDrawing.current = false;
    clearHoldTimer();

    const finished = currentStrokeRef.current;
    currentStrokeRef.current = null;
    isStraightModeRef.current = false;

    // こすり判定: 方向転換が多い → ストローク削除
    if (scrubDirsRef.current.length >= SCRUB_DIRECTION_CHANGES && finished.points.length > 5) {
      // こすった範囲付近のストロークを削除
      const center = finished.points[Math.floor(finished.points.length / 2)];
      const idx = findStrokeAt(center, ERASER_WIDTH);
      if (idx >= 0) {
        strokesRef.current.splice(idx, 1);
        redoStackRef.current = [];
        redrawAll();
        setStrokeCount(strokesRef.current.length);
        return;
      }
    }

    if (finished.points.length < 2) return;
    strokesRef.current.push(finished);
    redoStackRef.current = [];
    redrawAll();
    setStrokeCount(strokesRef.current.length);
    if (onSave) {
      const canvas = canvasRef.current;
      if (canvas) onSave(canvas.toDataURL('image/png', 0.5));
    }
  };

  const handleUndo = () => {
    if (strokesRef.current.length === 0) return;
    const removed = strokesRef.current.pop()!;
    redoStackRef.current.push(removed);
    redrawAll();
    setStrokeCount(strokesRef.current.length);
  };

  const handleRedo = () => {
    if (redoStackRef.current.length === 0) return;
    const restored = redoStackRef.current.pop()!;
    strokesRef.current.push(restored);
    redrawAll();
    setStrokeCount(strokesRef.current.length);
  };

  const handleClear = () => {
    strokesRef.current = [];
    redoStackRef.current = [];
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokeCount(0);
  };

  return (
    <div className="flex flex-col h-full">
      {/* ツールバー */}
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 shrink-0">
        {COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => setColor(c.value)}
            className={`w-7 h-7 rounded-full border-2 transition-all ${
              color === c.value ? 'border-accent scale-110 ring-2 ring-accent/30' : 'border-gray-300 dark:border-gray-600'
            }`}
            style={{ backgroundColor: c.value }}
          />
        ))}
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
        <button onClick={handleUndo} disabled={strokeCount === 0}
          className="px-2 py-0.5 rounded text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30">
          ↩
        </button>
        <button onClick={handleRedo} disabled={redoStackRef.current.length === 0}
          className="px-2 py-0.5 rounded text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30">
          ↪
        </button>
        <button onClick={handleClear} className="px-2 py-0.5 rounded text-xs text-danger ml-auto">
          全消去
        </button>
      </div>
      {/* Canvas */}
      <div ref={containerRef} className="flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full bg-white dark:bg-gray-900 cursor-crosshair"
          style={{ touchAction: 'none', userSelect: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
    </div>
  );
}

// 点pから線分(a,b)への距離
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
