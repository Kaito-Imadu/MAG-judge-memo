import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session, MemoRecord } from '../db/database';
import { APPARATUS_LIST } from '../constants/apparatus';
import type { Apparatus } from '../types';
import { exportAthleteSheet, shareOrDownload } from '../utils/exportSheet';

export default function TrialPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [records, setRecords] = useState<MemoRecord[]>([]);
  const [newAthlete, setNewAthlete] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [exporting, setExporting] = useState(false);

  const reload = async () => {
    if (!sessionId) return;
    const s = await db.sessions.get(sessionId);
    if (s) setSession(s);
    const recs = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
    setRecords(recs);
  };

  // マウント時にレコードを読み込み（JudgeSheetの離脱保存との競合を避けるため少し遅延）
  useEffect(() => {
    reload();
    const timer = setTimeout(() => reload(), 300);
    return () => clearTimeout(timer);
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addAthlete = async () => {
    if (!session || !newAthlete.trim()) return;
    const name = newAthlete.trim();
    if (session.athletes.includes(name)) return;
    const updated = { ...session, athletes: [...session.athletes, name] };
    await db.sessions.put(updated);
    setSession(updated);
    setNewAthlete('');
    setShowAddInput(false);
    setSelectedAthlete(name);
  };

  const removeAthlete = async (name: string) => {
    if (!session) return;
    const updated = { ...session, athletes: session.athletes.filter(a => a !== name) };
    await db.sessions.put(updated);
    setSession(updated);
    if (selectedAthlete === name) setSelectedAthlete(null);
    await db.memoRecords.where('sessionId').equals(sessionId!).filter(r => r.athleteName === name).delete();
    setRecords(prev => prev.filter(r => r.athleteName !== name));
  };

  const hasRecord = (athlete: string, apparatus: Apparatus) =>
    records.some(r => r.athleteName === athlete && r.apparatus === apparatus && r.strokes.length > 0);

  const openJudge = (apparatus: Apparatus) => {
    if (!selectedAthlete || !sessionId) return;
    navigate(`/trial/${sessionId}/judge/${encodeURIComponent(selectedAthlete)}/${apparatus}`);
  };

  const handleExport = async () => {
    if (!selectedAthlete || !session || !sessionId) return;
    setExporting(true);
    try {
      const blob = await exportAthleteSheet(sessionId, selectedAthlete, session.name, session.eJudgeCount);
      const filename = `${selectedAthlete}_${session.name}_${new Date().toISOString().slice(0, 10)}.png`;
      await shareOrDownload(blob, filename);
    } finally {
      setExporting(false);
    }
  };

  if (!session) return null;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg-light dark:bg-bg-dark">
      <header className="bg-primary text-white px-4 py-2.5 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/')}
          className="text-white/70 hover:text-white text-sm min-h-[44px] px-2">戻る</button>
        <h1 className="font-bold">{session.name}</h1>
        <span className="text-sm text-white/60 ml-auto">
          {session.judgeMode}審判
          {session.judgeMode === 'E' ? ` (${session.eJudgeCount}人)` : ''}
        </span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 左: 選手一覧 */}
        <div className="w-56 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="font-bold text-sm text-gray-700 dark:text-gray-300">選手一覧</span>
            <button onClick={() => setShowAddInput(true)}
              className="text-accent font-bold text-xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center">+</button>
          </div>

          {showAddInput && (
            <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex gap-1">
              <input value={newAthlete} onChange={e => setNewAthlete(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAthlete()}
                placeholder="選手名" autoFocus
                className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
              <button onClick={addAthlete} className="text-accent text-sm font-bold px-2">追加</button>
              <button onClick={() => { setShowAddInput(false); setNewAthlete(''); }}
                className="text-gray-400 text-sm px-1">×</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {session.athletes.map(name => (
              <div key={name}
                className={`flex items-center px-3 py-2.5 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${
                  selectedAthlete === name
                    ? 'bg-accent/10 border-l-4 border-l-accent'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}>
                <button onClick={() => setSelectedAthlete(name)}
                  className="flex-1 text-left text-sm font-medium text-gray-800 dark:text-gray-200 min-h-[36px] flex items-center">
                  {name}
                </button>
                <button onClick={() => removeAthlete(name)}
                  className="text-gray-300 hover:text-danger text-xs px-2 min-h-[36px]">×</button>
              </div>
            ))}
            {session.athletes.length === 0 && (
              <div className="p-4 text-center text-gray-400 text-sm">
                「+」で選手を追加
              </div>
            )}
          </div>
        </div>

        {/* 右: 種目ダッシュボード */}
        <div className="flex-1 flex items-center justify-center p-6">
          {selectedAthlete ? (
            <div>
              <h2 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-4 text-center">
                {selectedAthlete}
              </h2>
              <div className="grid grid-cols-3 gap-4 max-w-lg">
                {APPARATUS_LIST.map(a => {
                  const done = hasRecord(selectedAthlete, a.code);
                  return (
                    <button key={a.code} onClick={() => openJudge(a.code)}
                      className={`relative rounded-xl shadow-md hover:shadow-lg border-2 transition-all
                                  p-4 text-center active:scale-95 min-h-[100px] ${
                        done
                          ? 'border-success/50 bg-success/5'
                          : 'border-transparent bg-white dark:bg-gray-800 hover:border-accent'
                      }`}>
                      {done && (
                        <span className="absolute top-2 right-2 text-success text-xs font-bold">済</span>
                      )}
                      <div className="text-xl font-bold text-primary dark:text-accent">{a.code}</div>
                      <div className="text-sm text-gray-500 mt-1">{a.name}</div>
                    </button>
                  );
                })}
              </div>
              {/* 共有ボタン */}
              <div className="mt-6 text-center">
                <button onClick={handleExport} disabled={exporting}
                  className="px-6 py-2.5 min-h-[44px] rounded-lg bg-accent text-white font-bold
                             hover:bg-accent/90 disabled:opacity-50 transition-colors">
                  {exporting ? '作成中...' : '採点結果を共有'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-center text-lg">
              選手を選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
