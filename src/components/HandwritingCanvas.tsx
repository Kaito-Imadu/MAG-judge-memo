import { useRef, useState, useCallback, useEffect } from 'react';

interface Stroke {
  points: { x: number; y: number; pressure: number }[];
  color: string;
  isEraser: boolean;
}

interface Props {
  onSave?: (dataUrl: string) => void;
}

const COLORS = [
  { name: '黒', value: '#000000' },
  { name: '赤', value: '#E74C3C' },
  { name: '青', value: '#2E86C1' },
];

export default function HandwritingCanvas({ onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState('#000000');
  const [isEraser, setIsEraser] = useState(false);
  const isDrawing = useRef(false);
  // force re-render for undo/redo button states
  const [, setTick] = useState(0);

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d'), []);

  const redrawAll = useCallback((allStrokes: Stroke[]) => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over';
      ctx.strokeStyle = stroke.isEraser ? '#000' : stroke.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1];
        const curr = stroke.points[i];
        ctx.beginPath();
        ctx.lineWidth = stroke.isEraser ? 24 : Math.max(1, curr.pressure * 6);
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [getCtx]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
      redrawAll(strokes);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawing.current = true;
    const pos = getPos(e);
    // Apple Pencil eraser tip: button === 5
    const useEraser = isEraser || e.button === 5;
    currentStrokeRef.current = { points: [pos], color, isEraser: useEraser };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current || !currentStrokeRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    currentStrokeRef.current.points.push(pos);

    const ctx = getCtx();
    if (!ctx) return;
    const pts = currentStrokeRef.current.points;
    const prev = pts[pts.length - 2];
    const erase = currentStrokeRef.current.isEraser;
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = erase ? '#000' : currentStrokeRef.current.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = erase ? 24 : Math.max(1, pos.pressure * 6);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  };

  const handlePointerUp = () => {
    if (!isDrawing.current || !currentStrokeRef.current) return;
    isDrawing.current = false;
    const finished = currentStrokeRef.current;
    currentStrokeRef.current = null;
    if (finished.points.length < 2) return;
    setStrokes((prev) => {
      const next = [...prev, finished];
      setRedoStack([]);
      setTick((t) => t + 1);
      if (onSave) {
        redrawAll(next);
        const canvas = canvasRef.current;
        if (canvas) onSave(canvas.toDataURL('image/png', 0.5));
      }
      return next;
    });
  };

  const handleUndo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const removed = prev[prev.length - 1];
      const next = prev.slice(0, -1);
      setRedoStack((r) => [...r, removed]);
      redrawAll(next);
      setTick((t) => t + 1);
      return next;
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      const nextRedo = prev.slice(0, -1);
      setStrokes((s) => {
        const next = [...s, restored];
        redrawAll(next);
        setTick((t) => t + 1);
        return next;
      });
      return nextRedo;
    });
  };

  const handleClear = () => {
    setStrokes([]);
    setRedoStack([]);
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTick((t) => t + 1);
  };

  return (
    <div className="flex flex-col h-full">
      {/* ツールバー */}
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-gray-800 shrink-0">
        {COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => { setColor(c.value); setIsEraser(false); }}
            className={`w-7 h-7 rounded-full border-2 transition-all ${
              !isEraser && color === c.value ? 'border-accent scale-110 ring-2 ring-accent/30' : 'border-gray-300 dark:border-gray-600'
            }`}
            style={{ backgroundColor: c.value }}
          />
        ))}
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
        <button
          onClick={() => setIsEraser(!isEraser)}
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            isEraser ? 'bg-primary text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}
        >
          消
        </button>
        <button onClick={handleUndo} disabled={strokes.length === 0}
          className="px-2 py-0.5 rounded text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30">
          ↩
        </button>
        <button onClick={handleRedo} disabled={redoStack.length === 0}
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
