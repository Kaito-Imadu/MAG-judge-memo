import { useState, useEffect, useRef } from 'react';
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
  const [exporting, setExporting] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (session.athletes.includes(name)) {
      setNewAthlete('');
      inputRef.current?.focus();
      return;
    }
    const updated = { ...session, athletes: [...session.athletes, name] };
    await db.sessions.put(updated);
    setSession(updated);
    setNewAthlete('');
    setSelectedAthlete(name);
    // 追加後にフォーカスを戻して次の入力をすぐに始められるようにする
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const addBulkAthletes = async () => {
    if (!session || !bulkText.trim()) return;
    const names = bulkText
      .split(/[\n,、。]/)
      .map(n => n.trim())
      .filter(n => n.length > 0 && !session.athletes.includes(n));
    if (names.length === 0) {
      setShowBulk(false);
      setBulkText('');
      return;
    }
    const updated = { ...session, athletes: [...session.athletes, ...names] };
    await db.sessions.put(updated);
    setSession(updated);
    setSelectedAthlete(names[names.length - 1]);
    setShowBulk(false);
    setBulkText('');
  };

  const removeAthlete = async (name: string) => {
    if (!session) return;
    if (!window.confirm(`「${name}」を削除しますか？`)) return;
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
        <div className="w-60 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
            <span className="font-bold text-sm text-gray-700 dark:text-gray-300">
              選手一覧
              {session.athletes.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-gray-400">{session.athletes.length}名</span>
              )}
            </span>
            <button
              onClick={() => { setShowBulk(true); setTimeout(() => document.getElementById('bulk-input')?.focus(), 50); }}
              className="text-xs text-accent font-medium px-2 py-1 rounded hover:bg-accent/10 min-h-[36px]"
              title="複数選手を一括入力">
              一括
            </button>
          </div>

          {/* 一括入力パネル */}
          {showBulk && (
            <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-accent/5">
              <p className="text-xs text-gray-500 mb-1">改行・コンマで区切って入力</p>
              <textarea
                id="bulk-input"
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                placeholder={"田中太郎\n山田花子\n佐藤次郎"}
                rows={4}
                className="w-full px-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 resize-none"
              />
              <div className="flex gap-1 mt-1">
                <button onClick={addBulkAthletes}
                  className="flex-1 py-1.5 text-sm font-bold text-white bg-accent rounded hover:bg-accent/90">
                  追加
                </button>
                <button onClick={() => { setShowBulk(false); setBulkText(''); }}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded hover:bg-gray-100">
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* 選手リスト */}
          <div className="flex-1 overflow-y-auto">
            {session.athletes.map(name => (
              <div key={name}
                className={`flex items-center px-3 py-0 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${
                  selectedAthlete === name
                    ? 'bg-accent/10 border-l-4 border-l-accent'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}>
                <button onClick={() => setSelectedAthlete(name)}
                  className="flex-1 text-left text-sm font-medium text-gray-800 dark:text-gray-200 min-h-[44px] flex items-center gap-2">
                  <span>{name}</span>
                  {/* 採点済み種目数バッジ */}
                  {(() => {
                    const doneCount = APPARATUS_LIST.filter(a => hasRecord(name, a.code)).length;
                    return doneCount > 0 ? (
                      <span className="text-xs text-success font-bold">{doneCount}/6</span>
                    ) : null;
                  })()}
                </button>
                <button onClick={() => removeAthlete(name)}
                  className="text-gray-300 hover:text-danger text-lg px-2 min-h-[44px] leading-none">
                  ×
                </button>
              </div>
            ))}

            {session.athletes.length === 0 && !showBulk && (
              <div className="p-4 text-center text-gray-400 text-sm">
                下の欄から選手を追加
              </div>
            )}
          </div>

          {/* 選手追加入力（常に表示） */}
          {!showBulk && (
            <div className="p-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex gap-1">
                <input
                  ref={inputRef}
                  value={newAthlete}
                  onChange={e => setNewAthlete(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addAthlete()}
                  placeholder="選手名を入力 → Enter"
                  className="flex-1 px-2 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 min-h-[44px]"
                />
                <button
                  onClick={addAthlete}
                  disabled={!newAthlete.trim()}
                  className="px-3 py-2 rounded bg-accent text-white font-bold text-sm disabled:opacity-40 hover:bg-accent/90 min-h-[44px]">
                  追加
                </button>
              </div>
            </div>
          )}
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
