import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Apparatus } from '../types';
import { APPARATUS_LIST } from '../constants/apparatus';
import { getNDChecklist } from '../constants/deductions';

interface Point { x: number; y: number }
interface Stroke { points: Point[]; color: string }

interface Props {
  apparatus: Apparatus;
  mode: 'D' | 'E';
  eJudgeCount: number;
}

const COLORS = [
  { value: '#000000' },
  { value: '#E74C3C' },
  { value: '#2E86C1' },
];
const LINE_WIDTH = 2;
const ERASER_WIDTH = 28;
const STRAIGHT_DELAY = 400;
const STRAIGHT_THRESHOLD = 4;
const SCRUB_DIRS_NEEDED = 4;

// レイアウト定数（割合）
const HEADER_H = 36;       // ヘッダー高さ px
const SCORE_ROW_H = 48;    // スコア行の高さ px
const CV_ROW_H = 32;       // CV行の高さ px
const ND_WIDTH_RATIO = 0.2; // ND列幅の割合

export default function JudgeSheet({ apparatus, mode, eJudgeCount }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const redoStack = useRef<Stroke[]>([]);
  const cur = useRef<Stroke | null>(null);
  const colorRef = useRef('#000000');
  const drawing = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const straight = useRef(false);
  const startPt = useRef<Point | null>(null);
  const scrubDirs = useRef<number[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);

  const ndItems = getNDChecklist(apparatus);
  const hasND = ndItems.length > 0;
  const hasCV = apparatus === 'FX' || apparatus === 'HB';

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

  // テンプレート描画（罫線・ラベル・ND項目）
  const drawTemplate = useCallback(() => {
    const c = getCtx();
    if (!c) return;
    const { w, h } = sizeRef.current;
    if (w === 0) return;

    const scoreH = SCORE_ROW_H;
    const cvH = hasCV ? CV_ROW_H : 0;
    const bottomH = scoreH + cvH;
    const ndW = hasND ? Math.floor(w * ND_WIDTH_RATIO) : 0;
    const mainW = w - ndW;
    const mainH = h - HEADER_H - bottomH;

    c.save();

    // --- ヘッダー下線 ---
    c.strokeStyle = '#222';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, HEADER_H);
    c.lineTo(w, HEADER_H);
    c.stroke();

    // --- ヘッダーラベル ---
    c.fillStyle = '#aaa';
    c.font = '13px "Noto Sans JP", sans-serif';
    c.fillText('選手名', 8, HEADER_H - 10);

    // --- ND列 点線 ---
    if (hasND) {
      c.strokeStyle = '#999';
      c.lineWidth = 1;
      c.setLineDash([6, 4]);
      // 縦線
      c.beginPath();
      c.moveTo(mainW, HEADER_H);
      c.lineTo(mainW, HEADER_H + mainH);
      c.stroke();
      // 下線
      c.beginPath();
      c.moveTo(mainW, HEADER_H + mainH);
      c.lineTo(w, HEADER_H + mainH);
      c.stroke();
      c.setLineDash([]);

      // NDラベル
      c.fillStyle = '#888';
      c.font = 'bold 14px "Noto Sans JP", sans-serif';
      c.fillText('ND', w - ndW + 8, HEADER_H + 22);

      // ND項目（薄い文字でテンプレートとして描画）
      c.fillStyle = '#ccc';
      c.font = '11px "Noto Sans JP", sans-serif';
      ndItems.forEach((item, i) => {
        const y = HEADER_H + 46 + i * 28;
        c.fillText(`□ ${item.label}`, w - ndW + 10, y);
      });
    }

    // --- スコアエリア ---
    const scoreTop = h - bottomH;

    // CV行（FX/HBのみ）
    if (hasCV) {
      c.strokeStyle = '#222';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, scoreTop);
      c.lineTo(w, scoreTop);
      c.stroke();
      // CV枠
      const cvBoxW = Math.floor(w * 0.12);
      c.beginPath();
      c.moveTo(cvBoxW, scoreTop);
      c.lineTo(cvBoxW, scoreTop + cvH);
      c.stroke();
      c.fillStyle = '#aaa';
      c.font = '10px "Noto Sans JP", sans-serif';
      c.fillText('CV', 4, scoreTop + 12);
    }

    // スコア行の上線
    const scoreRowTop = h - scoreH;
    c.strokeStyle = '#222';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, scoreRowTop);
    c.lineTo(w, scoreRowTop);
    c.stroke();

    // スコア列: D, E1, E2..., ND, 決定点
    const cols: string[] = ['D'];
    for (let i = 0; i < eJudgeCount; i++) {
      cols.push(i === 0 ? 'E1' : `E${i + 1}`);
    }
    cols.push('ND', '決定点');

    const colCount = cols.length;
    // 決定点を少し広めに
    const lastColRatio = 1.4;
    const normalCols = colCount - 1;
    const unit = w / (normalCols + lastColRatio);
    let x = 0;
    c.lineWidth = 1;
    c.strokeStyle = '#444';
    for (let i = 0; i < colCount; i++) {
      const colW = i === colCount - 1 ? unit * lastColRatio : unit;
      // 縦線（最初は不要）
      if (i > 0) {
        c.beginPath();
        c.moveTo(x, scoreRowTop);
        c.lineTo(x, h);
        c.stroke();
      }
      // ラベル
      c.fillStyle = '#999';
      c.font = '10px "Noto Sans JP", sans-serif';
      c.fillText(cols[i], x + 4, scoreRowTop + 12);
      x += colW;
    }

    c.restore();
  }, [getCtx, hasND, hasCV, ndItems, eJudgeCount]);

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
    drawTemplate();
    for (const s of strokes.current) drawStroke(c, s);
  }, [getCtx, drawTemplate, drawStroke]);

  // resize
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !wrap) return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const c = canvas.getContext('2d');
      if (c) c.scale(dpr, dpr);
      redrawAll();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apparatus, eJudgeCount]);

  // redraw when template deps change
  useEffect(() => { redrawAll(); }, [redrawAll]);

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
    }, STRAIGHT_DELAY);
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
    if (Math.hypot(dx, p.y - prev.y) > STRAIGHT_THRESHOLD) startTimer(p);
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
    if (scrubDirs.current.length >= SCRUB_DIRS_NEEDED && finished.points.length > 5) {
      const center = finished.points[Math.floor(finished.points.length / 2)];
      const idx = findStrokeAt(strokes.current, center, ERASER_WIDTH);
      if (idx >= 0) { strokes.current.splice(idx, 1); redoStack.current = []; redrawAll(); return; }
    }
    if (finished.points.length < 2) return;
    strokes.current.push(finished);
    redoStack.current = [];
  };

  const undo = () => { if (strokes.current.length === 0) return; redoStack.current.push(strokes.current.pop()!); redrawAll(); setTick(tick + 1); };
  const redo = () => { if (redoStack.current.length === 0) return; strokes.current.push(redoStack.current.pop()!); redrawAll(); setTick(tick + 1); };
  const clear = () => { strokes.current = []; redoStack.current = []; redrawAll(); setTick(tick + 1); };
  const pickColor = (c: string) => { colorRef.current = c; setTick(tick + 1); };

  const handleApparatusChange = (a: Apparatus) => {
    const path = mode === 'E' ? `/judge/${a}/e?eCount=${eJudgeCount}` : `/judge/${a}/d`;
    navigate(path, { replace: true });
  };

  void tick;

  return (
    <div className="h-screen flex flex-col overflow-hidden select-none">
      {/* ツールバー（極小） */}
      <div className="flex items-center gap-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 shrink-0">
        {COLORS.map((c) => (
          <button key={c.value} onClick={() => pickColor(c.value)}
            className={`w-6 h-6 rounded-full border-2 ${colorRef.current === c.value ? 'border-accent scale-110 ring-2 ring-accent/30' : 'border-gray-300 dark:border-gray-600'}`}
            style={{ backgroundColor: c.value }} />
        ))}
        <div className="w-px h-4 bg-gray-300" />
        <button onClick={undo} className="px-1.5 py-0.5 rounded text-[10px] bg-white dark:bg-gray-700 text-gray-500">↩</button>
        <button onClick={redo} className="px-1.5 py-0.5 rounded text-[10px] bg-white dark:bg-gray-700 text-gray-500">↪</button>
        <button onClick={clear} className="px-1.5 py-0.5 rounded text-[10px] text-danger">全消去</button>
        <div className="ml-auto flex items-center gap-1">
          {/* 種目タブ（DOM） */}
          {APPARATUS_LIST.map((a) => (
            <button key={a.code} onClick={() => handleApparatusChange(a.code)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                apparatus === a.code ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-200'
              }`}>
              {a.code}
            </button>
          ))}
          <button onClick={() => navigate('/')}
            className="px-2 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 ml-1">
            ホーム
          </button>
        </div>
      </div>

      {/* Canvas（全面） */}
      <div ref={wrapRef} className="flex-1 min-h-0">
        <canvas ref={canvasRef}
          className="w-full h-full bg-white dark:bg-gray-950 cursor-crosshair"
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
