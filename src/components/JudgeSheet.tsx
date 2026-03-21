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
  athleteName?: string;
  pageNumber?: number;
  showApparatusTabs?: boolean;
  toolbarExtra?: ReactNode;
  onBack?: () => void;
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
const SAVE_DEBOUNCE = 1500;

// レイアウト定数
const HEADER_H = 36;
const SCORE_ROW_H = 160;
const CV_LABEL_H = 28;
const ND_WIDTH_RATIO = 0.2;

export default function JudgeSheet({
  apparatus,
  judgeMode,
  eJudgeCount,
  recordId,
  sessionId,
  athleteName = '',
  pageNumber = 0,
  showApparatusTabs = true,
  toolbarExtra,
  onBack,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const redoStack = useRef<Stroke[]>([]);
  const cur = useRef<Stroke | null>(null);
  const colorRef = useRef('#000000');
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

  const getCtx = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

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

  // --- デバウンス保存（refで最新を保持） ---
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

  // テンプレート描画
  const drawTemplate = useCallback(() => {
    const c = getCtx();
    if (!c) return;
    const { w, h } = sizeRef.current;
    if (w === 0) return;

    const scoreH = SCORE_ROW_H;
    const ndW = hasND ? Math.floor(w * ND_WIDTH_RATIO) : 0;
    const mainW = w - ndW;
    const scoreRowTop = h - scoreH;

    c.save();

    c.strokeStyle = '#222';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, HEADER_H);
    c.lineTo(w, HEADER_H);
    c.stroke();

    c.fillStyle = '#aaa';
    c.font = '13px "Noto Sans JP", sans-serif';
    c.fillText('選手名', 8, HEADER_H - 10);

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
      redoStack.current = [];
      redrawAll();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

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

  useEffect(() => { redrawAll(); }, [redrawAll]);

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

  // ========== ネイティブ Pointer Events ==========
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e: PointerEvent): Point => {
      const r = canvas.getBoundingClientRect();
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
        redrawAll();
        const c = getCtx();
        if (c) {
          c.strokeStyle = colorRef.current;
          c.lineWidth = LINE_WIDTH;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(s.x, s.y);
          c.lineTo(p.x, p.y);
          c.stroke();
        }
      }, STRAIGHT_DELAY);
    };

    const finishStroke = () => {
      if (!drawing.current || !cur.current) return;
      drawing.current = false;
      activePointerId.current = null;
      clearHold();
      const finished = cur.current;
      cur.current = null;
      straight.current = false;
      if (scrubDirs.current.length >= SCRUB_DIRS_NEEDED && finished.points.length > 5) {
        const center = finished.points[Math.floor(finished.points.length / 2)];
        const idx = findStrokeAt(strokes.current, center, ERASER_WIDTH);
        if (idx >= 0) {
          strokes.current.splice(idx, 1);
          redoStack.current = [];
          redrawAll();
          saveRef.current();
          return;
        }
      }
      if (finished.points.length < 2) return;
      strokes.current.push(finished);
      redoStack.current = [];
      saveRef.current();
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      if (drawing.current) finishStroke();
      activePointerId.current = e.pointerId;
      drawing.current = true;
      straight.current = false;
      scrubDirs.current = [];
      const p = getPos(e);
      startPt.current = p;
      cur.current = { points: [p], color: colorRef.current };
      startHold(p);
    };

    const onMove = (e: PointerEvent) => {
      if (!drawing.current || !cur.current || e.pointerId !== activePointerId.current) return;
      e.preventDefault();
      const p = getPos(e);
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
        if (c) {
          c.strokeStyle = cur.current.color;
          c.lineWidth = LINE_WIDTH;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(s.x, s.y);
          c.lineTo(p.x, p.y);
          c.stroke();
        }
        return;
      }
      if (Math.hypot(dx, p.y - prev.y) > STRAIGHT_THRESHOLD) startHold(p);
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

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      finishStroke();
    };

    const onLeave = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      finishStroke();
    };

    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointercancel', onUp);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointercancel', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getCtx, redrawAll]);

  const undo = () => { if (strokes.current.length === 0) return; redoStack.current.push(strokes.current.pop()!); redrawAll(); saveRef.current(); setTick(t => t + 1); };
  const redo = () => { if (redoStack.current.length === 0) return; strokes.current.push(redoStack.current.pop()!); redrawAll(); saveRef.current(); setTick(t => t + 1); };
  const clear = () => { strokes.current = []; redoStack.current = []; redrawAll(); saveRef.current(); setTick(t => t + 1); };
  const pickColor = (c: string) => { colorRef.current = c; setTick(t => t + 1); };

  const handleApparatusChange = (a: Apparatus) => {
    flushSave(recordId, strokes.current);
    const path = judgeMode === 'E' ? `/judge/${a}/e?eCount=${eJudgeCount}` : `/judge/${a}/d`;
    navigate(path, { replace: true });
  };

  const handleBack = () => {
    flushSave(recordId, strokes.current);
    if (onBack) onBack();
    else navigate('/');
  };

  void tick;

  return (
    <div className="h-screen flex flex-col overflow-hidden select-none">
      <div className="flex items-center gap-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 shrink-0">
        {COLORS.map((c) => (
          <button key={c.value} onClick={() => pickColor(c.value)}
            className={`w-6 h-6 rounded-full border-2 ${
              colorRef.current === c.value
                ? 'border-accent scale-110 ring-2 ring-accent/30'
                : 'border-gray-300 dark:border-gray-600'
            }`}
            style={{ backgroundColor: c.value }} />
        ))}
        <div className="w-px h-4 bg-gray-300" />
        <button onClick={undo} className="px-1.5 py-0.5 rounded text-[10px] bg-white dark:bg-gray-700 text-gray-500">↩</button>
        <button onClick={redo} className="px-1.5 py-0.5 rounded text-[10px] bg-white dark:bg-gray-700 text-gray-500">↪</button>
        <button onClick={clear} className="px-1.5 py-0.5 rounded text-[10px] text-danger">全消去</button>

        {toolbarExtra}

        <div className="ml-auto flex items-center gap-1">
          {showApparatusTabs && APPARATUS_LIST.map((a) => (
            <button key={a.code} onClick={() => handleApparatusChange(a.code)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                apparatus === a.code ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-200'
              }`}>
              {a.code}
            </button>
          ))}
          <button onClick={handleBack}
            className="px-2 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 ml-1">
            {onBack ? '← 戻る' : 'ホーム'}
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="flex-1 min-h-0">
        <canvas ref={canvasRef}
          className="w-full h-full bg-white dark:bg-gray-950 cursor-crosshair"
          style={{ touchAction: 'none', userSelect: 'none' }} />
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
