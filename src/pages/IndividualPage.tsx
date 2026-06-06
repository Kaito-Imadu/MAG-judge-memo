import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session, MemoRecord } from '../db/database';
import type { Apparatus } from '../types';
import JudgeSheet from '../components/JudgeSheet';
import { renderSheetCanvas, loadVaultImage } from '../utils/renderSheet';

// サムネイル描画用定数
const THUMB_W = 240;
const THUMB_H = 135;

interface AppPageState {
  currentPage: number;
  totalPages: number;
}

interface DeletedPageSnapshot {
  apparatus: Apparatus;
  page: number;
  records: MemoRecord[];          // 削除した記録（現在の種目のみ）
  shiftedRecords: MemoRecord[];   // シフトした記録（現在の種目のみ）
  totalPages: number;
}

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

  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, THUMB_W, THUMB_H);

  const srcW = rec?.canvasW ?? 1024;
  const srcH = rec?.canvasH ?? 700;
  const sheet = renderSheetCanvas({
    w: srcW,
    h: srcH,
    apparatus,
    eJudgeCount,
    mode: 'individual',
    athleteName: '',
    strokes: rec?.strokes ?? [],
    lines: rec?.lines,
    vaultImg: apparatus === 'VT' ? vaultImg : null,
    digitalScores: rec?.digitalScores,
  });

  const sheetW = sheet.width;
  const sheetH = sheet.height;
  const scale = Math.min(THUMB_W / sheetW, THUMB_H / sheetH);
  const drawW = sheetW * scale;
  const drawH = sheetH * scale;
  const offX = (THUMB_W - drawW) / 2;
  const offY = (THUMB_H - drawH) / 2;
  c.drawImage(sheet, offX, offY, drawW, drawH);

  c.strokeStyle = '#e0e0e0';
  c.lineWidth = 1;
  c.strokeRect(0, 0, THUMB_W, THUMB_H);

  if (!rec || rec.strokes.length === 0) {
    c.fillStyle = '#ffffffcc';
    c.fillRect(0, 0, THUMB_W, THUMB_H);
    c.fillStyle = '#999';
    c.font = '12px "Noto Sans JP", sans-serif';
    c.textAlign = 'center';
    c.fillText('未記入', THUMB_W / 2, THUMB_H / 2 + 4);
  }
}

function ThumbCard({ page, rec, apparatus, eJudgeCount, vaultImg, isActive, onClick, onDelete }: {
  page: number;
  rec: MemoRecord | undefined;
  apparatus: Apparatus;
  eJudgeCount: number;
  vaultImg: HTMLImageElement | null;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawThumbnail(canvasRef.current, rec, apparatus, eJudgeCount, vaultImg);
    }
  }, [rec, apparatus, eJudgeCount, vaultImg]);

  return (
    <div
      className={`flex flex-col items-center gap-0.5 p-1 rounded-lg border-2 transition-all
                  ${
        isActive
          ? 'border-accent bg-accent/5 shadow-md'
          : 'border-gray-200 dark:border-gray-700 hover:border-accent/50 hover:shadow'
      }`}>
      <button onClick={onClick} className="w-full active:scale-95">
        <canvas ref={canvasRef}
          style={{ width: '100%', aspectRatio: `${THUMB_W} / ${THUMB_H}`, maxWidth: THUMB_W }}
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

// 既存レコードから種目別ページ状態の初期値を構築
function initStateFromRecords(recs: MemoRecord[]): Partial<Record<Apparatus, AppPageState>> {
  const byApp: Partial<Record<Apparatus, AppPageState>> = {};
  for (const r of recs) {
    const cur = byApp[r.apparatus];
    const maxPage = cur ? Math.max(cur.totalPages, r.pageNumber) : r.pageNumber;
    byApp[r.apparatus] = { currentPage: maxPage, totalPages: maxPage };
  }
  return byApp;
}

export default function IndividualPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [apparatus, setApparatus] = useState<Apparatus>('FX');
  const [pageStateByApp, setPageStateByApp] = useState<Partial<Record<Apparatus, AppPageState>>>({});
  const [showPageList, setShowPageList] = useState(false);
  const [pageRecords, setPageRecords] = useState<MemoRecord[]>([]);
  const [vaultImg, setVaultImg] = useState<HTMLImageElement | null>(null);
  const [deletedPage, setDeletedPage] = useState<DeletedPageSnapshot | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 現在の種目のページ状態を取得（未設定なら {1, 1}）
  const getAppState = (a: Apparatus): AppPageState =>
    pageStateByApp[a] ?? { currentPage: 1, totalPages: 1 };
  const { currentPage, totalPages } = getAppState(apparatus);

  const updateAppState = (a: Apparatus, patch: Partial<AppPageState>) => {
    setPageStateByApp(prev => ({
      ...prev,
      [a]: { ...(prev[a] ?? { currentPage: 1, totalPages: 1 }), ...patch },
    }));
  };

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
      setPageStateByApp(initStateFromRecords(recs));
      const img = await loadVaultImage();
      if (!cancelled) setVaultImg(img);
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const refreshRecords = async () => {
    if (!sessionId) return [] as MemoRecord[];
    const recs = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
    recs.sort((a, b) => a.pageNumber - b.pageNumber);
    setPageRecords(recs);
    return recs;
  };

  const openPageList = async () => {
    await refreshRecords();
    setShowPageList(true);
  };

  const jumpToPage = (page: number) => {
    updateAppState(apparatus, { currentPage: page });
    setShowPageList(false);
  };

  const deletePage = async (page: number) => {
    if (!sessionId) return;
    if (totalPages <= 1) return;
    const ok = window.confirm(`${apparatus} の #${page} を削除しますか？`);
    if (!ok) return;

    // 現在の種目のみが対象
    const targetRecords = pageRecords.filter(r => r.apparatus === apparatus && r.pageNumber === page);
    const shiftedRecords = pageRecords.filter(r => r.apparatus === apparatus && r.pageNumber > page);
    setDeletedPage({
      apparatus,
      page,
      records: targetRecords,
      shiftedRecords,
      totalPages,
    });

    // 削除/リナンバリング中は JudgeSheet の自動保存を抑止する
    flushSync(() => setIsDeleting(true));

    // 削除対象が現在表示中ページなら一旦近接ページへ退避
    if (page === currentPage) {
      const interimPage = page < totalPages ? page + 1 : page - 1;
      flushSync(() => updateAppState(apparatus, { currentPage: interimPage }));
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

    await refreshRecords();
    const nextTotal = Math.max(1, totalPages - 1);
    flushSync(() => {
      updateAppState(apparatus, {
        totalPages: nextTotal,
        currentPage: Math.min(currentPage >= page ? Math.max(1, currentPage - 1) : currentPage, nextTotal),
      });
    });
    queueMicrotask(() => setIsDeleting(false));
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
    await refreshRecords();
    updateAppState(deletedPage.apparatus, {
      totalPages: deletedPage.totalPages,
      currentPage: deletedPage.page,
    });
    setDeletedPage(null);
  };

  if (!session || !sessionId) return null;

  const recordId = `individual:${sessionId}:${apparatus}:${currentPage}`;

  const goPrev = () => {
    if (currentPage > 1) updateAppState(apparatus, { currentPage: currentPage - 1 });
  };
  const goNext = () => {
    if (currentPage < totalPages) updateAppState(apparatus, { currentPage: currentPage + 1 });
  };
  const addPage = () => {
    const newPage = totalPages + 1;
    updateAppState(apparatus, { currentPage: newPage, totalPages: newPage });
    setShowPageList(false);
  };

  const handleApparatusChange = (a: Apparatus) => {
    setApparatus(a);
  };

  const recsForApp = pageRecords.filter(r => r.apparatus === apparatus);

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
        key={recordId}
        apparatus={apparatus}
        judgeMode={session.judgeMode}
        eJudgeCount={session.eJudgeCount}
        recordId={recordId}
        sessionId={sessionId}
        sessionName={session.name}
        mode="individual"
        athleteName=""
        pageNumber={currentPage}
        showApparatusTabs={true}
        toolbarExtra={pageNav}
        onBack={() => navigate('/')}
        onApparatusChange={handleApparatusChange}
        suppressSave={isDeleting}
      />

      {/* サムネイル付きページ一覧パネル */}
      {showPageList && (
        <div className="absolute inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPageList(false)} />

          <div className="relative m-auto w-[90vw] max-w-[900px] max-h-[85vh] bg-white dark:bg-gray-800
                          rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-700 dark:text-gray-300">
                {apparatus} のページ一覧
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
                {/* 上が最新（高いページ番号が上）になるよう逆順 */}
                {Array.from({ length: totalPages }, (_, i) => totalPages - i).map(page => {
                  const rec = recsForApp.find(r => r.pageNumber === page);
                  return (
                    <ThumbCard
                      key={page}
                      page={page}
                      rec={rec}
                      apparatus={apparatus}
                      eJudgeCount={0}
                      vaultImg={vaultImg}
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
