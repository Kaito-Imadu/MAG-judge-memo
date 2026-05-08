import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session, MemoRecord } from '../db/database';
import type { Apparatus } from '../types';
import JudgeSheet from '../components/JudgeSheet';
import { renderSheetCanvas, loadVaultImage } from '../utils/renderSheet';
import RankingModal from '../components/RankingModal';

// サムネイル描画用定数（内部解像度。表示は列幅にフィット）
const THUMB_W = 280;
const THUMB_H = 158;
interface DeletedPageSnapshot {
  page: number;
  records: MemoRecord[];
  shiftedRecords: MemoRecord[];
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
    digitalScores: rec?.digitalScores,
    digitalAthleteName: rec?.digitalAthleteName,
    digitalAthleteNumber: rec?.digitalAthleteNumber,
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

export default function CompetitionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showPageList, setShowPageList] = useState(false);
  const [pageRecords, setPageRecords] = useState<MemoRecord[]>([]);
  const [vaultImg, setVaultImg] = useState<HTMLImageElement | null>(null);
  const [deletedPage, setDeletedPage] = useState<DeletedPageSnapshot | null>(null);
  const [showRanking, setShowRanking] = useState(false);
  const [digitalNameDraft, setDigitalNameDraft] = useState('');
  const [digitalNumberDraft, setDigitalNumberDraft] = useState<string>('');
  const digitalNameSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const digitalNumberSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const deletePage = async (page: number) => {
    if (!sessionId) return;
    if (totalPages <= 1) return;
    const ok = window.confirm(`#${page} を削除しますか？このページのメモも削除されます。`);
    if (!ok) return;

    const targetRecords = await db.memoRecords
      .where('id').equals(`comp:${sessionId}:${page}`)
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
      await db.memoRecords.where('id').equals(`comp:${sessionId}:${page}`).delete();
      for (const rec of shiftedRecords) {
        const newPage = rec.pageNumber - 1;
        await db.memoRecords.delete(rec.id);
        await db.memoRecords.put({
          ...rec,
          id: `comp:${sessionId}:${newPage}`,
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
        const currentId = `comp:${sessionId}:${currentPageNo}`;
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

  // 現在ページの digitalAthleteName/Number を DB から読み込む（ページ切替時に同期）
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const id = `comp:${sessionId}:${currentPage}`;
    db.memoRecords.get(id).then(rec => {
      if (cancelled) return;
      setDigitalNameDraft(rec?.digitalAthleteName ?? '');
      setDigitalNumberDraft(typeof rec?.digitalAthleteNumber === 'number' ? String(rec.digitalAthleteNumber) : '');
    });
    return () => { cancelled = true; };
  }, [sessionId, currentPage]);

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

  const onDigitalNameChange = (v: string) => {
    setDigitalNameDraft(v);
    if (digitalNameSaveTimer.current) clearTimeout(digitalNameSaveTimer.current);
    digitalNameSaveTimer.current = setTimeout(() => {
      // update-or-insert: 既存があれば update、なければ stub を put
      db.transaction('rw', db.memoRecords, async () => {
        const existing = await db.memoRecords.get(recordId);
        if (existing) {
          await db.memoRecords.update(recordId, { digitalAthleteName: v, updatedAt: new Date() });
        } else {
          await db.memoRecords.put({
            id: recordId,
            sessionId,
            athleteName: '',
            apparatus: session!.apparatus!,
            pageNumber: currentPage,
            strokes: [],
            digitalAthleteName: v,
            updatedAt: new Date(),
          });
        }
      });
    }, 800);
  };

  const onDigitalNumberChange = (v: string) => {
    // 数字のみ抽出（前後の不正文字を弾く）
    const cleaned = v.replace(/[^0-9]/g, '');
    setDigitalNumberDraft(cleaned);
    const numValue: number | undefined = cleaned === '' ? undefined : Number(cleaned);
    if (digitalNumberSaveTimer.current) clearTimeout(digitalNumberSaveTimer.current);
    digitalNumberSaveTimer.current = setTimeout(() => {
      db.transaction('rw', db.memoRecords, async () => {
        const existing = await db.memoRecords.get(recordId);
        if (existing) {
          await db.memoRecords.update(recordId, { digitalAthleteNumber: numValue, updatedAt: new Date() });
        } else {
          await db.memoRecords.put({
            id: recordId,
            sessionId,
            athleteName: '',
            apparatus: session!.apparatus!,
            pageNumber: currentPage,
            strokes: [],
            digitalAthleteNumber: numValue,
            updatedAt: new Date(),
          });
        }
      });
    }, 800);
  };

  const pageNav = (
    <>
      <div className="w-px h-4 bg-gray-300" />
      {/* 番号 */}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={digitalNumberDraft}
        onChange={e => onDigitalNumberChange(e.target.value)}
        placeholder="№"
        className="px-2 py-1 text-sm font-mono text-center rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 min-h-[36px] w-14"
      />
      {/* デジタル選手名 */}
      <input
        type="text"
        value={digitalNameDraft}
        onChange={e => onDigitalNameChange(e.target.value)}
        placeholder="選手名"
        className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 min-h-[36px] w-32"
      />
      <button onClick={() => setShowRanking(true)}
        title="ランキングを表示"
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold min-h-[44px]
                   bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
        <span>🏆</span>
        <span>順位</span>
      </button>
      <div className="w-px h-4 bg-gray-300" />
      <button onClick={goPrev} disabled={currentPage <= 1}
        className="px-3 py-1 rounded-lg text-base font-bold bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 min-h-[44px] min-w-[44px] hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300">
        ◀
      </button>
      <button onClick={openPageList}
        className="text-xs text-gray-600 dark:text-gray-300 font-mono min-w-[44px] text-center
                   hover:bg-gray-200 dark:hover:bg-gray-600 rounded px-1 py-0.5 min-h-[28px]">
        {currentPage} / {totalPages}
      </button>
      <button onClick={goNext} disabled={currentPage >= totalPages}
        className="px-3 py-1 rounded-lg text-base font-bold bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 min-h-[44px] min-w-[44px] hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300">
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
        digitalAthleteName={digitalNameDraft}
        digitalAthleteNumber={digitalNumberDraft === '' ? undefined : Number(digitalNumberDraft)}
      />

      {showRanking && (
        <RankingModal
          sessionId={sessionId}
          mode="competition"
          apparatus={session.apparatus}
          eJudgeCount={session.eJudgeCount}
          onClose={() => setShowRanking(false)}
        />
      )}

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
                  className="px-3 py-1.5 min-h-[36px] rounded-lg bg-accent text-white font-bold text-sm">
                  + 次の選手を追加
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
                      apparatus={session.apparatus!}
                      eJudgeCount={session.eJudgeCount}
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
