import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session, MemoRecord, StrokeData } from '../db/database';
import type { Apparatus } from '../types';
import JudgeSheet from '../components/JudgeSheet';

// サムネイル描画用定数
const THUMB_W = 180;
const THUMB_H = 102;
interface DeletedPageSnapshot {
  page: number;
  records: MemoRecord[];
  shiftedRecords: MemoRecord[];
  totalPages: number;
}

function drawThumbnail(canvas: HTMLCanvasElement, strokes: StrokeData[]) {
  const c = canvas.getContext('2d');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = THUMB_W * dpr;
  canvas.height = THUMB_H * dpr;
  c.scale(dpr, dpr);
  c.clearRect(0, 0, THUMB_W, THUMB_H);

  c.fillStyle = '#fafafa';
  c.fillRect(0, 0, THUMB_W, THUMB_H);
  c.strokeStyle = '#e0e0e0';
  c.lineWidth = 1;
  c.strokeRect(0, 0, THUMB_W, THUMB_H);

  if (strokes.length === 0) {
    c.fillStyle = '#ccc';
    c.font = '12px "Noto Sans JP", sans-serif';
    c.textAlign = 'center';
    c.fillText('未記入', THUMB_W / 2, THUMB_H / 2 + 4);
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const pad = 8;
  const scaleX = (THUMB_W - pad * 2) / rangeX;
  const scaleY = (THUMB_H - pad * 2) / rangeY;
  const scale = Math.min(scaleX, scaleY, 0.6);
  const offX = pad + ((THUMB_W - pad * 2) - rangeX * scale) / 2 - minX * scale;
  const offY = pad + ((THUMB_H - pad * 2) - rangeY * scale) / 2 - minY * scale;

  for (const s of strokes) {
    if (s.points.length < 2) continue;
    c.strokeStyle = s.color;
    c.lineWidth = Math.max(0.5, (s.width ?? 2) * scale);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(offX + s.points[0].x * scale, offY + s.points[0].y * scale);
    for (let i = 1; i < s.points.length; i++) {
      c.lineTo(offX + s.points[i].x * scale, offY + s.points[i].y * scale);
    }
    c.stroke();
  }
}

function ThumbCard({ page, rec, isActive, onClick, onDelete }: {
  page: number;
  rec: MemoRecord | undefined;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawThumbnail(canvasRef.current, rec?.strokes ?? []);
    }
  }, [rec]);

  return (
    <div
      className={`flex flex-col items-center gap-0.5 p-1 rounded-lg border-2 transition-all
                  ${
        isActive
          ? 'border-accent bg-accent/5 shadow-md'
          : 'border-gray-200 dark:border-gray-700 hover:border-accent/50 hover:shadow'
      }`}>
      <button onClick={onClick} className="active:scale-95">
        <canvas ref={canvasRef}
          style={{ width: THUMB_W, height: THUMB_H }}
          className="rounded" />
      </button>
      <div className="flex items-center gap-1 w-full px-1">
        <button onClick={onClick} className={`text-xs font-bold ${isActive ? 'text-accent' : 'text-gray-500'}`}>
          #{page}
        </button>
        {rec && rec.strokes.length > 0 ? (
          <span className="text-success text-[10px] font-bold ml-auto">済</span>
        ) : (
          <span className="text-gray-400 text-[10px] ml-auto">未記入</span>
        )}
        <button onClick={onDelete}
          className="text-danger text-[10px] font-bold px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
          削除
        </button>
      </div>
    </div>
  );
}

export default function IndividualPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [apparatus, setApparatus] = useState<Apparatus>('FX');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showPageList, setShowPageList] = useState(false);
  const [pageRecords, setPageRecords] = useState<MemoRecord[]>([]);
  const [deletedPage, setDeletedPage] = useState<DeletedPageSnapshot | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const s = await db.sessions.get(sessionId);
      if (cancelled) return;
      if (s) setSession(s);
      const recs = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
      if (cancelled) return;
      recs.sort((a, b) => a.pageNumber - b.pageNumber);
      setPageRecords(recs);
      const maxPage = recs.length > 0 ? Math.max(...recs.map(r => r.pageNumber)) : 0;
      const total = Math.max(1, maxPage);
      setTotalPages(total);
      setCurrentPage(total);
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const openPageList = async () => {
    if (!sessionId) return;
    const recs = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
    recs.sort((a, b) => a.pageNumber - b.pageNumber);
    setPageRecords(recs);
    const maxPage = recs.length > 0 ? Math.max(...recs.map(r => r.pageNumber)) : 0;
    setTotalPages(Math.max(totalPages, maxPage));
    setShowPageList(true);
  };

  const jumpToPage = (page: number) => {
    setCurrentPage(page);
    setShowPageList(false);
  };

  const deletePage = async (page: number) => {
    if (!sessionId) return;
    if (totalPages <= 1) return;
    const ok = window.confirm(`#${page} を削除しますか？このページの全種目メモも削除されます。`);
    if (!ok) return;

    const targetRecords = await db.memoRecords
      .where('sessionId').equals(sessionId)
      .filter(r => r.pageNumber === page)
      .toArray();
    const shiftedRecords = await db.memoRecords
      .where('sessionId').equals(sessionId)
      .filter(r => r.pageNumber > page)
      .toArray();
    setDeletedPage({
      page,
      records: targetRecords,
      shiftedRecords,
      totalPages,
    });

    if (page <= currentPage) {
      const interimPage = page < totalPages ? page + 1 : page - 1;
      flushSync(() => setCurrentPage(interimPage));
    }

    await db.transaction('rw', db.memoRecords, async () => {
      for (const rec of targetRecords) {
        await db.memoRecords.delete(rec.id);
      }

      for (const rec of shiftedRecords) {
        const newPage = rec.pageNumber - 1;
        await db.memoRecords.delete(rec.id);
        await db.memoRecords.put({
          ...rec,
          id: `individual:${sessionId}:${rec.apparatus}:${newPage}`,
          pageNumber: newPage,
          updatedAt: new Date(),
        });
      }
    });

    const nextTotal = Math.max(1, totalPages - 1);
    const recs = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
    recs.sort((a, b) => a.pageNumber - b.pageNumber);
    setPageRecords(recs);
    setTotalPages(nextTotal);
    setCurrentPage(prev => Math.min(currentPage >= page ? Math.max(1, currentPage - 1) : prev, nextTotal));
  };

  const undoDeletePage = async () => {
    if (!sessionId || !deletedPage) return;
    await db.transaction('rw', db.memoRecords, async () => {
      const shiftedDesc = [...deletedPage.shiftedRecords].sort((a, b) => b.pageNumber - a.pageNumber);
      for (const original of shiftedDesc) {
        const currentPageNo = original.pageNumber - 1;
        const currentId = `individual:${sessionId}:${original.apparatus}:${currentPageNo}`;
        await db.memoRecords.delete(currentId);
        await db.memoRecords.put(original);
      }
      for (const rec of deletedPage.records) {
        await db.memoRecords.put(rec);
      }
    });
    const recs = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
    recs.sort((a, b) => a.pageNumber - b.pageNumber);
    setPageRecords(recs);
    setTotalPages(deletedPage.totalPages);
    setCurrentPage(deletedPage.page);
    setDeletedPage(null);
  };

  if (!session || !sessionId) return null;

  const recordId = `individual:${sessionId}:${apparatus}:${currentPage}`;

  const goPrev = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };
  const goNext = () => { if (currentPage < totalPages) setCurrentPage(p => p + 1); };
  const addPage = () => {
    const newPage = totalPages + 1;
    setTotalPages(newPage);
    setCurrentPage(newPage);
    setShowPageList(false);
  };

  const handleApparatusChange = (a: Apparatus) => {
    setApparatus(a);
  };

  const pageNav = (
    <>
      <div className="w-px h-4 bg-gray-300" />
      <button onClick={goPrev} disabled={currentPage <= 1}
        className="px-1.5 py-0.5 rounded text-xs bg-white dark:bg-gray-700 text-gray-500 disabled:opacity-30 min-h-[28px]">
        ◀
      </button>
      <button onClick={openPageList}
        className="text-xs text-gray-600 dark:text-gray-300 font-mono min-w-[40px] text-center
                   hover:bg-gray-200 dark:hover:bg-gray-600 rounded px-1 py-0.5 min-h-[28px]">
        {currentPage} / {totalPages}
      </button>
      <button onClick={goNext} disabled={currentPage >= totalPages}
        className="px-1.5 py-0.5 rounded text-xs bg-white dark:bg-gray-700 text-gray-500 disabled:opacity-30 min-h-[28px]">
        ▶
      </button>
      <button onClick={openPageList}
        className="px-2 py-0.5 rounded text-xs bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold min-h-[28px]
                   hover:bg-gray-200 dark:hover:bg-gray-600">
        一覧
      </button>
      <button onClick={addPage}
        className="px-2 py-0.5 rounded text-xs bg-accent text-white font-bold min-h-[28px]">
        + 次のページ
      </button>
    </>
  );

  return (
    <div className="relative h-full">
      <JudgeSheet
        key={`${recordId}-${apparatus}`}
        apparatus={apparatus}
        judgeMode={session.judgeMode}
        eJudgeCount={0}
        recordId={recordId}
        sessionId={sessionId}
        mode="individual"
        athleteName=""
        pageNumber={currentPage}
        showApparatusTabs={true}
        toolbarExtra={pageNav}
        onBack={() => navigate('/')}
        onApparatusChange={handleApparatusChange}
      />

      {/* サムネイル付きページ一覧パネル */}
      {showPageList && (
        <div className="absolute inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPageList(false)} />

          <div className="relative m-auto w-[90vw] max-w-[900px] max-h-[85vh] bg-white dark:bg-gray-800
                          rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-700 dark:text-gray-300">
                ページ一覧
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={addPage}
                  className="px-3 py-1.5 min-h-[36px] rounded-lg bg-accent text-white font-bold text-sm">
                  + ページ追加
                </button>
                {deletedPage && (
                  <button onClick={undoDeletePage}
                    className="px-4 py-1.5 min-h-[36px] rounded-lg bg-amber-100 text-amber-700 font-bold text-sm
                               dark:bg-amber-900/30 dark:text-amber-300">
                    削除を取り消し
                  </button>
                )}
                <button onClick={() => setShowPageList(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center">
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_W + 12}px, 1fr))` }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  const rec = pageRecords.find(r => r.pageNumber === page);
                  return (
                    <ThumbCard
                      key={page}
                      page={page}
                      rec={rec}
                      isActive={page === currentPage}
                      onClick={() => jumpToPage(page)}
                      onDelete={() => deletePage(page)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
