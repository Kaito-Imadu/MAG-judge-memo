import { useRef, useEffect } from 'react';

interface Props {
  width: number;
  height: number;
  label: string;
  highlight?: boolean;
  className?: string;
}

/** 手書き用ミニCanvas。ラベル付きの枠。 */
export default function MiniCanvas({ width, height, label, highlight = false, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const c = canvas.getContext('2d');
    if (c) c.scale(dpr, dpr);
  }, [width, height]);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    const c = canvasRef.current?.getContext('2d');
    if (!c) return;
    const p = pos(e);
    c.beginPath();
    c.moveTo(p.x, p.y);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    e.stopPropagation();
    const c = canvasRef.current?.getContext('2d');
    if (!c) return;
    const p = pos(e);
    c.strokeStyle = '#1B4F72';
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    c.lineTo(p.x, p.y);
    c.stroke();
    c.beginPath();
    c.moveTo(p.x, p.y);
  };

  const onUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    drawing.current = false;
  };

  const onClear = () => {
    const canvas = canvasRef.current;
    const c = canvas?.getContext('2d');
    if (canvas && c) c.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className={`flex flex-col items-center shrink-0 select-none ${className}`}>
      <span className="text-[9px] text-gray-400 leading-none mb-0.5">{label}</span>
      <canvas
        ref={canvasRef}
        style={{ width, height, touchAction: 'none', userSelect: 'none' }}
        className={`rounded border bg-white dark:bg-gray-900 cursor-crosshair ${
          highlight
            ? 'border-primary dark:border-accent border-2'
            : 'border-gray-300 dark:border-gray-600'
        }`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onDoubleClick={onClear}
      />
    </div>
  );
}
