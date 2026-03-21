import { useRef, useState, useCallback, useEffect } from 'react';

interface Point { x: number; y: number }
interface Stroke { points: Point[]; color: string }



const COLORS = [
  { name: '黒', value: '#000000' },
  { name: '赤', value: '#E74C3C' },
  { name: '青', value: '#2E86C1' },
];
const LINE_WIDTH = 2;
const ERASER_WIDTH = 28;
const STRAIGHT_LINE_DELAY = 400;
const STRAIGHT_LINE_MOVE_THRESHOLD = 4;
const SCRUB_DIRECTION_CHANGES = 4;

export default function HandwritingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const redoStack = useRef<Stroke[]>([]);
  const cur = useRef<Stroke | null>(null);
  const colorRef = useRef('#000000');
  const drawing = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const straight = useRef(false);
  const startPt = useRef<Point | null>(null);
  const scrubDirs = useRef<number[]>([]);
  const [tick, setTick] = useState(0);

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

  const drawStroke = useCallback((c: CanvasRenderingContext2D, s: Stroke) => {
    if (s.points.length < 2) return;
    c.strokeStyle = s.color;
    c.lineWidth = LINE_WIDTH;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.globalCompositeOperation = 'source-over';
    c.beginPath();
    c.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) c.lineTo(s.points[i].x, s.points[i].y);
    c.stroke();
  }, []);

  const redrawAll = useCallback(() => {
    const c = getCtx();
    const cv = canvasRef.current;
    if (!c || !cv) return;
    c.clearRect(0, 0, cv.width, cv.height);
    for (const s of strokes.current) drawStroke(c, s);
  }, [getCtx, drawStroke]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const c = canvas.getContext('2d');
      if (c) c.scale(dpr, dpr);
      redrawAll();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const clearTimer = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } };

  const startTimer = (p: Point) => {
    clearTimer();
    holdTimer.current = setTimeout(() => {
      if (!drawing.current || !cur.current) return;
      straight.current = true;
      const s = startPt.current!;
      cur.current = { points: [s, p], color: cur.current.color };
      redrawAll();
      const c = getCtx();
      if (c) { c.strokeStyle = colorRef.current; c.lineWidth = LINE_WIDTH; c.lineCap = 'round'; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(p.x, p.y); c.stroke(); }
    }, STRAIGHT_LINE_DELAY);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    straight.current = false;
    scrubDirs.current = [];
    const p = pos(e);
    startPt.current = p;
    cur.current = { points: [p], color: colorRef.current };
    startTimer(p);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current || !cur.current) return;
    e.preventDefault();
    const p = pos(e);
    const pts = cur.current.points;
    const prev = pts[pts.length - 1];
    const dx = p.x - prev.x;
    if (Math.abs(dx) > 2) {
      const d = dx > 0 ? 1 : -1;
      const sd = scrubDirs.current;
      if (sd.length === 0 || sd[sd.length - 1] !== d) sd.push(d);
    }
    if (straight.current) {
      const s = startPt.current!;
      cur.current = { points: [s, p], color: cur.current.color };
      redrawAll();
      const c = getCtx();
      if (c) { c.strokeStyle = cur.current.color; c.lineWidth = LINE_WIDTH; c.lineCap = 'round'; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(p.x, p.y); c.stroke(); }
      return;
    }
    if (Math.hypot(dx, p.y - prev.y) > STRAIGHT_LINE_MOVE_THRESHOLD) startTimer(p);
    pts.push(p);
    const c = getCtx();
    if (!c) return;
    c.strokeStyle = cur.current.color;
    c.lineWidth = LINE_WIDTH;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(prev.x, prev.y);
    c.lineTo(p.x, p.y);
    c.stroke();
  };

  const onUp = () => {
    if (!drawing.current || !cur.current) return;
    drawing.current = false;
    clearTimer();
    const finished = cur.current;
    cur.current = null;
    straight.current = false;

    if (scrubDirs.current.length >= SCRUB_DIRECTION_CHANGES && finished.points.length > 5) {
      const center = finished.points[Math.floor(finished.points.length / 2)];
      const idx = findStrokeAt(strokes.current, center, ERASER_WIDTH);
      if (idx >= 0) {
        strokes.current.splice(idx, 1);
        redoStack.current = [];
        redrawAll();
        return;
      }
    }
    if (finished.points.length < 2) return;
    strokes.current.push(finished);
    redoStack.current = [];
    // live drawing already on canvas, no redrawAll needed
  };

  const undo = () => { if (strokes.current.length === 0) return; redoStack.current.push(strokes.current.pop()!); redrawAll(); setTick(tick + 1); };
  const redo = () => { if (redoStack.current.length === 0) return; strokes.current.push(redoStack.current.pop()!); redrawAll(); setTick(tick + 1); };
  const clear = () => { strokes.current = []; redoStack.current = []; const c = getCtx(); const cv = canvasRef.current; if (c && cv) c.clearRect(0, 0, cv.width, cv.height); setTick(tick + 1); };
  const pickColor = (c: string) => { colorRef.current = c; setTick(tick + 1); };

  // suppress unused warning
  void tick;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 shrink-0">
        {COLORS.map((c) => (
          <button key={c.value} onClick={() => pickColor(c.value)}
            className={`w-7 h-7 rounded-full border-2 transition-all ${colorRef.current === c.value ? 'border-accent scale-110 ring-2 ring-accent/30' : 'border-gray-300 dark:border-gray-600'}`}
            style={{ backgroundColor: c.value }} />
        ))}
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
        <button onClick={undo} className="px-2 py-0.5 rounded text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300">↩</button>
        <button onClick={redo} className="px-2 py-0.5 rounded text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300">↪</button>
        <button onClick={clear} className="px-2 py-0.5 rounded text-xs text-danger ml-auto">全消去</button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0">
        <canvas ref={canvasRef} className="w-full h-full bg-white dark:bg-gray-900 cursor-crosshair"
          style={{ touchAction: 'none', userSelect: 'none' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} />
      </div>
    </div>
  );
}

function findStrokeAt(strokes: Stroke[], p: Point, threshold: number): number {
  for (let si = strokes.length - 1; si >= 0; si--) {
    const pts = strokes[si].points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, lenSq = dx * dx + dy * dy;
      let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) < threshold) return si;
    }
  }
  return -1;
}
