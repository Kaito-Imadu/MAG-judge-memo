import { useRef, useState, useCallback, useEffect } from 'react';

interface Stroke {
  points: { x: number; y: number; pressure: number }[];
  color: string;
  isEraser: boolean;
}

interface Props {
  initialData?: string;
  onSave?: (dataUrl: string) => void;
}

const COLORS = [
  { name: '黒', value: '#000000' },
  { name: '赤', value: '#E74C3C' },
  { name: '青', value: '#2E86C1' },
];

export default function HandwritingCanvas({ initialData, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [color, setColor] = useState('#000000');
  const [isEraser, setIsEraser] = useState(false);
  const isDrawing = useRef(false);

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
        ctx.lineWidth = stroke.isEraser ? 20 : Math.max(1, curr.pressure * 6);
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [getCtx]);

  // resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
      redrawAll(strokes);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load initial data
  useEffect(() => {
    if (!initialData) return;
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = initialData;
  }, [initialData, getCtx]);

  const getPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return; // finger = scroll, pen/mouse = draw
    e.preventDefault();
    isDrawing.current = true;
    const pos = getPos(e);
    setCurrentStroke({ points: [pos], color, isEraser });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current || !currentStroke) return;
    e.preventDefault();
    const pos = getPos(e);
    const updated = { ...currentStroke, points: [...currentStroke.points, pos] };
    setCurrentStroke(updated);

    // draw live segment
    const ctx = getCtx();
    if (!ctx) return;
    const prev = currentStroke.points[currentStroke.points.length - 1];
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = isEraser ? '#000' : color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = isEraser ? 20 : Math.max(1, pos.pressure * 6);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  };

  const handlePointerUp = () => {
    if (!isDrawing.current || !currentStroke) return;
    isDrawing.current = false;
    const newStrokes = [...strokes, currentStroke];
    setStrokes(newStrokes);
    setCurrentStroke(null);
    setRedoStack([]);
    triggerSave(newStrokes);
  };

  const triggerSave = (s: Stroke[]) => {
    if (!onSave) return;
    redrawAll(s);
    const canvas = canvasRef.current;
    if (canvas) onSave(canvas.toDataURL('image/png', 0.5));
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const newStrokes = strokes.slice(0, -1);
    setRedoStack([...redoStack, strokes[strokes.length - 1]]);
    setStrokes(newStrokes);
    redrawAll(newStrokes);
    triggerSave(newStrokes);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const restored = redoStack[redoStack.length - 1];
    const newStrokes = [...strokes, restored];
    setRedoStack(redoStack.slice(0, -1));
    setStrokes(newStrokes);
    redrawAll(newStrokes);
    triggerSave(newStrokes);
  };

  const handleClear = () => {
    setStrokes([]);
    setRedoStack([]);
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (onSave) onSave('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* ツールバー */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-t-lg flex-wrap">
        {COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => { setColor(c.value); setIsEraser(false); }}
            className={`w-8 h-8 rounded-full border-2 transition-transform ${
              !isEraser && color === c.value ? 'border-primary scale-110' : 'border-gray-300'
            }`}
            style={{ backgroundColor: c.value }}
            title={c.name}
          />
        ))}
        <div className="w-px h-6 bg-gray-300 mx-1" />
        <button
          onClick={() => setIsEraser(!isEraser)}
          className={`px-2 py-1 rounded text-xs font-medium min-h-[32px] ${
            isEraser ? 'bg-primary text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}
        >
          消しゴム
        </button>
        <button onClick={handleUndo} disabled={strokes.length === 0}
          className="px-2 py-1 rounded text-xs font-medium min-h-[32px] bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30">
          戻す
        </button>
        <button onClick={handleRedo} disabled={redoStack.length === 0}
          className="px-2 py-1 rounded text-xs font-medium min-h-[32px] bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30">
          やり直し
        </button>
        <button onClick={handleClear}
          className="px-2 py-1 rounded text-xs font-medium min-h-[32px] bg-white dark:bg-gray-700 text-danger ml-auto">
          クリア
        </button>
      </div>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 bg-white dark:bg-gray-900 rounded-b-lg cursor-crosshair"
        style={{ touchAction: 'none', userSelect: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}
