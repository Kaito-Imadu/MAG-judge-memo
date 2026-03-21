import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session, MemoRecord } from '../db/database';
import JudgeSheet from '../components/JudgeSheet';

export default function CompetitionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showPageList, setShowPageList] = useState(false);
  const [pageRecords, setPageRecords] = useState<MemoRecord[]>([]);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    const s = await db.sessions.get(sessionId);
    if (s) setSession(s);
    const recs = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
    recs.sort((a, b) => a.pageNumber - b.pageNumber);
    setPageRecords(recs);
    const maxPage = recs.length > 0 ? Math.max(...recs.map(r => r.pageNumber)) : 0;
    const total = Math.max(1, maxPage);
    setTotalPages(total);
    setCurrentPage(total);
  }, [sessionId]);

  useEffect(() => { loadSession(); }, [loadSession]);

  // ページ一覧を開くときにレコードを再読み込み
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
      <button onClick={addPage}
        className="px-2 py-0.5 rounded text-xs bg-accent text-white font-bold min-h-[28px]">
        + 次の選手
      </button>
    </>
  );

  return (
    <div className="relative h-screen">
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

      {/* ページ一覧パネル */}
      {showPageList && (
        <div className="absolute inset-0 z-50 flex">
          {/* 背景タップで閉じる */}
          <div className="flex-1 bg-black/30" onClick={() => setShowPageList(false)} />

          {/* 右側パネル */}
          <div className="w-72 bg-white dark:bg-gray-800 shadow-xl flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-700 dark:text-gray-300">
                選手一覧（{session.apparatus}）
              </h3>
              <button onClick={() => setShowPageList(false)}
                className="text-gray-400 hover:text-gray-600 text-lg min-w-[44px] min-h-[44px] flex items-center justify-center">
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                const rec = pageRecords.find(r => r.pageNumber === page);
                const hasStrokes = rec && rec.strokes.length > 0;
                const isActive = page === currentPage;

                return (
                  <button key={page} onClick={() => jumpToPage(page)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700
                                flex items-center gap-3 min-h-[52px] ${
                      isActive
                        ? 'bg-accent/10 border-l-4 border-l-accent'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}>
                    <span className={`text-lg font-bold min-w-[28px] ${
                      isActive ? 'text-accent' : 'text-gray-400'
                    }`}>
                      {page}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        選手 {page}
                      </div>
                      <div className="text-xs text-gray-400">
                        {hasStrokes
                          ? `${rec!.strokes.length} ストローク`
                          : '未記入'
                        }
                      </div>
                    </div>
                    {hasStrokes && (
                      <span className="text-success text-xs font-bold">記入済</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <button onClick={addPage}
                className="w-full py-2.5 min-h-[44px] rounded-lg bg-accent text-white font-bold text-sm">
                + 次の選手を追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
