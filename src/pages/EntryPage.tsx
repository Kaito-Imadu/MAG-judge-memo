import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session } from '../db/database';
import type { Apparatus } from '../types';
import { APPARATUS_LIST } from '../constants/apparatus';
import { version } from '../../package.json';

export default function EntryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showModal, setShowModal] = useState<'trial' | 'competition' | 'individual' | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [judgeMode, setJudgeMode] = useState<'D' | 'E' | 'D/E'>('E');
  const [eJudgeCount, setEJudgeCount] = useState(4);
  const [selectedApparatus, setSelectedApparatus] = useState<Apparatus>('FX');

  useEffect(() => {
    db.sessions.orderBy('date').reverse().toArray().then(setSessions);
  }, []);

  const createSession = async () => {
    const session: Session = {
      id: crypto.randomUUID(),
      name: sessionName.trim() || (showModal === 'trial' ? '試技会' : showModal === 'competition' ? '大会' : '個別採点'),
      date: new Date(),
      mode: showModal!,
      judgeMode: showModal === 'individual' ? 'D/E' : judgeMode,
      eJudgeCount: (showModal === 'individual' || judgeMode === 'E' || judgeMode === 'D/E') ? eJudgeCount : 1,
      apparatus: showModal === 'competition' ? selectedApparatus : undefined,
      athletes: [],
    };
    await db.sessions.add(session);
    setShowModal(null);
    setSessionName('');
    if (session.mode === 'trial') {
      navigate(`/trial/${session.id}`);
    } else if (session.mode === 'individual') {
      navigate(`/individual/${session.id}`);
    } else {
      navigate(`/competition/${session.id}`);
    }
  };

  const resumeSession = (s: Session) => {
    if (s.mode === 'trial') navigate(`/trial/${s.id}`);
    else if (s.mode === 'individual') navigate(`/individual/${s.id}`);
    else navigate(`/competition/${s.id}`);
  };

  const deleteSession = async (id: string) => {
    await db.sessions.delete(id);
    await db.memoRecords.where('sessionId').equals(id).delete();
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="h-full bg-bg-light dark:bg-bg-dark flex flex-col overflow-y-auto">
      <header className="bg-primary text-white px-6 py-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight">MAG Judge Memo</h1>
        <span className="text-xs text-white/50">v{version}</span>
      </header>

      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <button onClick={() => setShowModal('trial')}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg
                       border-2 border-transparent hover:border-accent transition-all
                       p-6 text-center active:scale-95">
            <div className="text-lg font-bold text-primary dark:text-accent">試技会モード</div>
            <div className="text-sm text-gray-500 mt-1">選手ごとに6種目を記録</div>
          </button>
          <button onClick={() => setShowModal('competition')}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg
                       border-2 border-transparent hover:border-accent transition-all
                       p-6 text-center active:scale-95">
            <div className="text-lg font-bold text-primary dark:text-accent">大会モード</div>
            <div className="text-sm text-gray-500 mt-1">1種目で選手を連続採点</div>
          </button>
          <button onClick={() => setShowModal('individual')}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg
                       border-2 border-transparent hover:border-accent transition-all
                       p-6 text-center active:scale-95">
            <div className="text-lg font-bold text-primary dark:text-accent">個別モード</div>
            <div className="text-sm text-gray-500 mt-1">選手×種目を個別に採点</div>
          </button>
        </div>

        {sessions.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-3">過去のセッション</h2>
            <div className="space-y-2">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center bg-white dark:bg-gray-800 rounded-lg shadow px-4 py-3">
                  <button onClick={() => resumeSession(s)} className="flex-1 text-left min-h-[44px]">
                    <div className="font-semibold text-gray-800 dark:text-gray-100">{s.name}</div>
                    <div className="text-xs text-gray-500">
                      {s.mode === 'trial' ? '試技会' : s.mode === 'individual' ? '個別' : '大会'}
                      {s.apparatus ? ` / ${s.apparatus}` : ''}
                      {' / '}{s.judgeMode === 'D/E' ? 'D/E' : `${s.judgeMode}審判`}
                      {(s.judgeMode === 'E' || s.judgeMode === 'D/E') ? ` (E${s.eJudgeCount}人)` : ''}
                      {' / '}{new Date(s.date).toLocaleDateString('ja-JP')}
                    </div>
                  </button>
                  <button onClick={() => deleteSession(s.id)}
                    className="text-gray-400 hover:text-danger text-sm px-3 min-h-[44px]">削除</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
             onClick={() => setShowModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl min-w-[360px]"
               onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
              {showModal === 'trial' ? '試技会セッション作成' : showModal === 'competition' ? '大会セッション作成' : '個別セッション作成'}
            </h2>

            <input value={sessionName} onChange={e => setSessionName(e.target.value)}
              placeholder="セッション名（任意）"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                         dark:bg-gray-700 dark:text-gray-100 mb-4" />

            {showModal !== 'individual' && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-gray-600 dark:text-gray-300">審判:</span>
                  <button onClick={() => setJudgeMode('D')}
                    className={`px-4 py-1.5 rounded-l-lg text-sm font-semibold border ${
                      judgeMode === 'D' ? 'bg-primary text-white border-primary' : 'text-gray-500 border-gray-300'
                    }`}>D審判</button>
                  <button onClick={() => setJudgeMode('E')}
                    className={`px-4 py-1.5 text-sm font-semibold border border-l-0 ${
                      judgeMode === 'E' ? 'bg-primary text-white border-primary' : 'text-gray-500 border-gray-300'
                    }`}>E審判</button>
                  <button onClick={() => setJudgeMode('D/E')}
                    className={`px-4 py-1.5 rounded-r-lg text-sm font-semibold border border-l-0 ${
                      judgeMode === 'D/E' ? 'bg-primary text-white border-primary' : 'text-gray-500 border-gray-300'
                    }`}>D/E</button>
                </div>

                {(judgeMode === 'E' || judgeMode === 'D/E') && (
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm text-gray-600 dark:text-gray-300">E審判人数:</span>
                    {[1, 2, 3, 4, 5, 6].map(n => (
                      <button key={n} onClick={() => setEJudgeCount(n)}
                        className={`w-9 h-9 rounded-lg text-sm font-bold ${
                          eJudgeCount === n ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}>{n}</button>
                    ))}
                  </div>
                )}
              </>
            )}

            {showModal === 'competition' && (
              <div className="mb-4">
                <span className="text-sm text-gray-600 dark:text-gray-300 block mb-2">種目:</span>
                <div className="grid grid-cols-3 gap-2">
                  {APPARATUS_LIST.map(a => (
                    <button key={a.code} onClick={() => setSelectedApparatus(a.code)}
                      className={`px-3 py-2 rounded-lg text-sm font-bold ${
                        selectedApparatus === a.code
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                      {a.code} {a.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowModal(null)}
                className="flex-1 py-2 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600
                           text-gray-600 dark:text-gray-300 font-medium">キャンセル</button>
              <button onClick={createSession}
                className="flex-1 py-2 min-h-[44px] rounded-lg bg-primary text-white font-bold">作成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
