import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session, MemoRecord } from '../db/database';
import type { Apparatus } from '../types';
import JudgeSheet from '../components/JudgeSheet';
import { renderSheetCanvas, loadVaultImage } from '../utils/renderSheet';

// サムネイル描画用定数
const THUMB_W = 200;
const THUMB_H = 140;

function drawThumbnail(
  canvas: HTMLCanvasElement,
  rec: MemoRecord | undefined,
  apparatus: Apparatus,
  eJudgeCount: number,
  vaultImg: HTMLImageElement | null,
) {
  const c = canvas.getContext('2d');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = THUMB_W * dpr;
  canvas.height = THUMB_H * dpr;
  c.scale(dpr, dpr);
  c.clearRect(0, 0, THUMB_W, THUMB_H);

  // 背景
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, THUMB_W, THUMB_H);

  // フルサイズで採点シートを描画してフィット縮小
  const srcW = rec?.canvasW ?? 1024;
  const srcH = rec?.canvasH ?? 700;
  const sheet = renderSheetCanvas({
    w: srcW,
    h: srcH,
    apparatus,
    eJudgeCount,
    mode: 'competition',
    athleteName: '',
    strokes: rec?.strokes ?? [],
    lines: rec?.lines,
    vaultImg: apparatus === 'VT' ? vaultImg : null,
  });

  const scale = Math.min(THUMB_W / srcW, THUMB_H / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const offX = (THUMB_W - drawW) / 2;
  const offY = (THUMB_H - drawH) / 2;
  c.drawImage(sheet, offX, offY, drawW, drawH);

  // 枠線
  c.strokeStyle = '#e0e0e0';
  c.lineWidth = 1;
  c.strokeRect(0, 0, THUMB_W, THUMB_H);

  // 未記入の場合は半透明オーバーレイ + ラベル
  if (!rec || rec.strokes.length === 0) {
    c.fillStyle = '#ffffffcc';
    c.fillRect(0, 0, THUMB_W, THUMB_H);
    c.fillStyle = '#999';
    c.font = '12px "Noto Sans JP", sans-serif';
    c.textAlign = 'center';
    c.fillText('未記入', THUMB_W / 2, THUMB_H / 2 + 4);
  }
}

// サムネイルカード
function ThumbCard({ page, rec, apparatus, eJudgeCount, vaultImg, isActive, onClick }: {
  page: number;
  rec: MemoRecord | undefined;
  apparatus: Apparatus;
  eJudgeCount: number;
  vaultImg: HTMLImageElement | null;
  isActive: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawThumbnail(canvasRef.current, rec, apparatus, eJudgeCount, vaultImg);
    }
  }, [rec, apparatus, eJudgeCount, vaultImg]);

  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all
                  active:scale-95 ${
        isActive
          ? 'border-accent bg-accent/5 shadow-md'
          : 'border-gray-200 dark:border-gray-700 hover:border-accent/50 hover:shadow'
      }`}>
      <canvas ref={canvasRef}
        style={{ width: THUMB_W, height: THUMB_H }}
        className="rounded" />
      <div className="flex items-center gap-2 w-full px-1">
        <span className={`text-sm font-bold ${isActive ? 'text-accent' : 'text-gray-500'}`}>
          #{page}
        </span>
        {rec && rec.strokes.length > 0 ? (
          <span className="text-success text-[10px] font-bold ml-auto">記入済</span>
        ) : (
          <span className="text-gray-400 text-[10px] ml-auto">未記入</span>
        )}
      </div>
    </button>
  );
}

export default function CompetitionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showPageList, setShowPageList] = useState(false);
  const [pageRecords, setPageRecords] = useState<MemoRecord[]>([]);
  const [vaultImg, setVaultImg] = useState<HTMLImageElement | null>(null);

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
      // VT 種目なら跳馬画像をプリロード（サムネイル背景用）
      if (s?.apparatus === 'VT') {
        const img = await loadVaultImage();
        if (!cancelled) setVaultImg(img);
      }
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

  if (!session || !session.apparatus || !sessionId) return null;

  const recordId = `comp:${sessionId}:${currentPage}`;

  const goPrev = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };
  const goNext = () => { if (currentPage < totalPages) setCurrentPage(p => p + 1); };
  const addPage = () => {
    const newPage = totalPages + 1;
    setTotalPages(newPage);
    setCurrentPage(newPage);
    setShowPageList(false);
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
        + 次の選手
      </button>
    </>
  );

  return (
    <div className="relative h-full">
      <JudgeSheet
        key={recordId}
        apparatus={session.apparatus}
        judgeMode={session.judgeMode}
        eJudgeCount={session.eJudgeCount}
        recordId={recordId}
        sessionId={sessionId}
        mode="competition"
        athleteName=""
        pageNumber={currentPage}
        showApparatusTabs={false}
        toolbarExtra={pageNav}
        onBack={() => navigate('/')}
      />

      {/* サムネイル付きページ一覧パネル */}
      {showPageList && (
        <div className="absolute inset-0 z-50 flex">
          {/* 背景タップで閉じる */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPageList(false)} />

          {/* 中央パネル */}
          <div className="relative m-auto w-[90vw] max-w-[900px] max-h-[85vh] bg-white dark:bg-gray-800
                          rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-700 dark:text-gray-300">
                選手一覧 — {session.apparatus}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={addPage}
                  className="px-4 py-1.5 min-h-[36px] rounded-lg bg-accent text-white font-bold text-sm">
                  + 次の選手を追加
                </button>
                <button onClick={() => setShowPageList(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center">
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_W + 16}px, 1fr))` }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  const rec = pageRecords.find(r => r.pageNumber === page);
                  return (
                    <ThumbCard
                      key={page}
                      page={page}
                      rec={rec}
                      apparatus={session.apparatus!}
                      eJudgeCount={session.eJudgeCount}
                      vaultImg={vaultImg}
                      isActive={page === currentPage}
                      onClick={() => jumpToPage(page)}
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
