import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session, MemoRecord } from '../db/database';
import { APPARATUS_LIST } from '../constants/apparatus';
import type { Apparatus } from '../types';
import { exportSingleSheet, shareOrDownload } from '../utils/exportSheet';

interface RecordEntry {
  athleteName: string;
  apparatus: Apparatus;
  record: MemoRecord;
}

export default function IndividualPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<RecordEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<RecordEntry | null>(null);
  const [athleteName, setAthleteName] = useState('');
  const [selectedApparatus, setSelectedApparatus] = useState<Apparatus>('FX');
  const [showAddForm, setShowAddForm] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const reload = async () => {
    if (!sessionId) return;
    const s = await db.sessions.get(sessionId);
    if (s) setSession(s);
    const recs = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
    const list: RecordEntry[] = recs
      .filter(r => r.strokes.length > 0)
      .map(r => ({ athleteName: r.athleteName, apparatus: r.apparatus, record: r }));
    setEntries(list);
  };

  useEffect(() => { reload(); }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openJudge = (athlete: string, apparatus: Apparatus) => {
    if (!sessionId) return;
    navigate(`/individual/${sessionId}/judge/${encodeURIComponent(athlete)}/${apparatus}`);
  };

  const addAndOpen = () => {
    const name = athleteName.trim();
    if (!name || !sessionId) return;
    setShowAddForm(false);
    setAthleteName('');
    openJudge(name, selectedApparatus);
  };

  const handleExport = async (entry: RecordEntry) => {
    if (!session || !sessionId) return;
    setExporting(entry.record.id);
    try {
      const blob = await exportSingleSheet(
        sessionId, entry.athleteName, entry.apparatus,
        session.name, session.eJudgeCount,
      );
      const filename = `${entry.athleteName}_${APPARATUS_LIST.find(a => a.code === entry.apparatus)?.name ?? entry.apparatus}_${new Date().toISOString().slice(0, 10)}.png`;
      await shareOrDownload(blob, filename);
    } finally {
      setExporting(null);
    }
  };

  if (!session) return null;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-light dark:bg-bg-dark">
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
        {/* 左: 記録一覧 */}
        <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="font-bold text-sm text-gray-700 dark:text-gray-300">採点記録</span>
            <button onClick={() => setShowAddForm(true)}
              className="text-accent font-bold text-xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center">+</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {entries.map(entry => {
              const info = APPARATUS_LIST.find(a => a.code === entry.apparatus);
              const isSelected = selectedEntry?.record.id === entry.record.id;
              return (
                <div key={entry.record.id}
                  className={`flex items-center px-3 py-2.5 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${
                    isSelected
                      ? 'bg-accent/10 border-l-4 border-l-accent'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}>
                  <button onClick={() => setSelectedEntry(entry)}
                    className="flex-1 text-left min-h-[36px]">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{entry.athleteName}</div>
                    <div className="text-xs text-gray-500">{entry.apparatus} {info?.name}</div>
                  </button>
                </div>
              );
            })}
            {entries.length === 0 && !showAddForm && (
              <div className="p-4 text-center text-gray-400 text-sm">
                「+」で新しい採点を追加
              </div>
            )}
          </div>
        </div>

        {/* 右: メインエリア */}
        <div className="flex-1 flex items-center justify-center p-6">
          {showAddForm ? (
            <div className="max-w-md w-full">
              <h2 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-4 text-center">新しい採点</h2>
              <input value={athleteName} onChange={e => setAthleteName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAndOpen()}
                placeholder="選手名" autoFocus
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                           dark:bg-gray-700 dark:text-gray-100 mb-4" />
              <div className="grid grid-cols-3 gap-2 mb-6">
                {APPARATUS_LIST.map(a => (
                  <button key={a.code} onClick={() => setSelectedApparatus(a.code)}
                    className={`px-3 py-3 rounded-lg text-sm font-bold min-h-[50px] ${
                      selectedApparatus === a.code
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                    {a.code} {a.name}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowAddForm(false); setAthleteName(''); }}
                  className="flex-1 py-2 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600
                             text-gray-600 dark:text-gray-300 font-medium">キャンセル</button>
                <button onClick={addAndOpen} disabled={!athleteName.trim()}
                  className="flex-1 py-2 min-h-[44px] rounded-lg bg-primary text-white font-bold
                             disabled:opacity-50">採点開始</button>
              </div>
            </div>
          ) : selectedEntry ? (
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">
                {selectedEntry.athleteName}
              </h2>
              <p className="text-gray-500 mb-6">
                {selectedEntry.apparatus} {APPARATUS_LIST.find(a => a.code === selectedEntry.apparatus)?.name}
              </p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => openJudge(selectedEntry.athleteName, selectedEntry.apparatus)}
                  className="px-6 py-2.5 min-h-[44px] rounded-lg bg-primary text-white font-bold
                             hover:bg-primary/90 transition-colors">
                  編集
                </button>
                <button onClick={() => handleExport(selectedEntry)}
                  disabled={exporting === selectedEntry.record.id}
                  className="px-6 py-2.5 min-h-[44px] rounded-lg bg-accent text-white font-bold
                             hover:bg-accent/90 disabled:opacity-50 transition-colors">
                  {exporting === selectedEntry.record.id ? '作成中...' : '共有'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-center text-lg">
              「+」で新しい採点を追加、<br />または左の記録を選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
