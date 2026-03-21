import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session } from '../db/database';
import JudgeSheet from '../components/JudgeSheet';

export default function CompetitionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    const s = await db.sessions.get(sessionId);
    if (s) setSession(s);
    const recs = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
    const maxPage = recs.length > 0 ? Math.max(...recs.map(r => r.pageNumber)) : 0;
    const total = Math.max(1, maxPage);
    setTotalPages(total);
    setCurrentPage(total);
  }, [sessionId]);

  useEffect(() => { loadSession(); }, [loadSession]);

  if (!session || !session.apparatus || !sessionId) return null;

  const recordId = `comp:${sessionId}:${currentPage}`;

  const goPrev = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };
  const goNext = () => { if (currentPage < totalPages) setCurrentPage(p => p + 1); };
  const addPage = () => {
    const newPage = totalPages + 1;
    setTotalPages(newPage);
    setCurrentPage(newPage);
  };

  const pageNav = (
    <>
      <div className="w-px h-4 bg-gray-300" />
      <button onClick={goPrev} disabled={currentPage <= 1}
        className="px-1.5 py-0.5 rounded text-xs bg-white dark:bg-gray-700 text-gray-500 disabled:opacity-30 min-h-[28px]">
        ◀
      </button>
      <span className="text-xs text-gray-600 dark:text-gray-300 font-mono min-w-[40px] text-center">
        {currentPage} / {totalPages}
      </span>
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
    <JudgeSheet
      key={recordId}
      apparatus={session.apparatus}
      judgeMode={session.judgeMode}
      eJudgeCount={session.eJudgeCount}
      recordId={recordId}
      sessionId={sessionId}
      athleteName=""
      pageNumber={currentPage}
      showApparatusTabs={false}
      toolbarExtra={pageNav}
      onBack={() => navigate('/')}
    />
  );
}
