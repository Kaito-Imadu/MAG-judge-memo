import { useRef, useCallback } from 'react';
import type { Apparatus } from '../types';
import { getNDChecklist } from '../constants/deductions';

interface Props {
  apparatus: Apparatus;
  open: boolean;
  onToggle: () => void;
}

export default function NDPanel({ apparatus, open, onToggle }: Props) {
  const items = getNDChecklist(apparatus);
  if (items.length === 0) return null;

  return (
    <>
      {/* タブ（常時表示、キャンバス右端に貼り付く） */}
      <div
        className={`absolute right-0 top-1/4 z-20 transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-0'
        }`}
      >
        <button
          onClick={onToggle}
          className={`px-1.5 py-4 rounded-l-lg text-xs font-bold shadow-lg writing-mode-vertical ${
            open
              ? 'bg-amber-500 text-white'
              : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
          }`}
          style={{ writingMode: 'vertical-rl' }}
        >
          ND
        </button>
      </div>

      {/* パネル（右からスライド） */}
      <div
        className={`absolute right-0 top-0 bottom-0 z-10 w-52 bg-amber-50/95 dark:bg-gray-800/95
                    backdrop-blur border-l border-amber-200 dark:border-amber-800 shadow-xl
                    transition-transform duration-200 ease-out flex flex-col
                    ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="px-3 pt-3 pb-1 text-xs font-bold text-amber-700 dark:text-amber-400">
          ND チェック
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
          {items.map((item) => (
            <NDCheckItem key={item.label} label={item.label} />
          ))}
        </div>
      </div>
    </>
  );
}

/** 1つのND項目: ラベル + 手書き可能なミニCanvas */
function NDCheckItem({ label }: { label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  const getCtx = () => canvasRef.current?.getContext('2d');

  const getPos = useCallback((e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawing.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    e.stopPropagation();
    const ctx = getCtx();
    if (!ctx) return;
    const pos = getPos(e);
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handleUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    isDrawing.current = false;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="flex items-center gap-1 bg-white dark:bg-gray-700 rounded px-1.5 py-1">
      {/* 手書きチェックエリア */}
      <canvas
        ref={canvasRef}
        width={32}
        height={28}
        className="shrink-0 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-700 cursor-crosshair"
        style={{ touchAction: 'none' }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
        onDoubleClick={handleClear}
      />
      <span className="text-[11px] text-gray-700 dark:text-gray-300 leading-tight">{label}</span>
    </div>
  );
}
