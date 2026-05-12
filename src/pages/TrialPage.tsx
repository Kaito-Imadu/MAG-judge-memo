import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session, MemoRecord } from '../db/database';
import { APPARATUS_LIST } from '../constants/apparatus';
import type { Apparatus } from '../types';
import {
  exportAthleteSheet,
  shareOrDownload,
  buildSheetFilename,
  generateBulkSheets,
  shareOrDownloadMultiple,
} from '../utils/exportSheet';
import { useSessionScores, rankBy } from '../hooks/useSessionScores';
import RankingModal from '../components/RankingModal';
import { formatScore, FINAL_SCORE_DECIMALS } from '../utils/scoreCalc';

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
  // 一括共有用: チェック済み選手名の Set
  const [checkedAthletes, setCheckedAthletes] = useState<Set<string>>(new Set());
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  // セッション名インライン編集
  const [editingSessionName, setEditingSessionName] = useState(false);
  const [sessionNameDraft, setSessionNameDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [showRanking, setShowRanking] = useState(false);
  const sessionScores = useSessionScores(sessionId);

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
    setCheckedAthletes(prev => {
      if (!prev.has(name)) return prev;
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
    await db.memoRecords.where('sessionId').equals(sessionId!).filter(r => r.athleteName === name).delete();
    setRecords(prev => prev.filter(r => r.athleteName !== name));
  };

  const hasRecord = (athlete: string, apparatus: Apparatus) =>
    records.some(r => r.athleteName === athlete && r.apparatus === apparatus && r.strokes.length > 0);

  const scoredCountOf = (athlete: string) =>
    APPARATUS_LIST.filter(a => hasRecord(athlete, a.code)).length;

  // 全選手のAA合計＋順位を計算（デジタルスコアの決定点合計）
  const aaRanking = useMemo(() => {
    if (!session || !sessionScores) return new Map<string, { rank: number | undefined; total: number | undefined }>();
    const rows = session.athletes.map(name => {
      const m = sessionScores.byAthlete.get(name);
      let total = 0;
      let any = false;
      APPARATUS_LIST.forEach(a => {
        const e = m?.get(a.code);
        if (e && typeof e.final === 'number') {
          total += e.final;
          any = true;
        }
      });
      return { name, total: any ? Math.round(total * 1000) / 1000 : undefined };
    });
    const ranked = rankBy(rows, r => r.total);
    const map = new Map<string, { rank: number | undefined; total: number | undefined }>();
    for (const r of ranked) map.set(r.item.name, { rank: r.rank, total: r.score });
    return map;
  }, [session, sessionScores]);

  const openJudge = (apparatus: Apparatus) => {
    if (!selectedAthlete || !sessionId) return;
    navigate(`/trial/${sessionId}/judge/${encodeURIComponent(selectedAthlete)}/${apparatus}`);
  };

  // 選択中選手の採点済み種目数
  const selectedScoredCount = selectedAthlete ? scoredCountOf(selectedAthlete) : 0;

  // チェック可能な選手（採点済み1つ以上）
  const checkableAthletes = useMemo(
    () => session ? session.athletes.filter(a => scoredCountOf(a) > 0) : [],
    [session, records], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 有効なチェック数（削除済み等を除外）
  const validCheckedCount = useMemo(() => {
    if (!session) return 0;
    let n = 0;
    for (const name of checkedAthletes) {
      if (session.athletes.includes(name) && scoredCountOf(name) > 0) n++;
    }
    return n;
  }, [checkedAthletes, session, records]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCheck = (name: string) => {
    setCheckedAthletes(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleCheckAll = () => {
    if (validCheckedCount === checkableAthletes.length && checkableAthletes.length > 0) {
      setCheckedAthletes(new Set());
    } else {
      setCheckedAthletes(new Set(checkableAthletes));
    }
  };

  const handleExport = async () => {
    if (!selectedAthlete || !session || !sessionId) return;
    if (selectedScoredCount === 0) {
      window.alert('採点済みの種目がありません。');
      return;
    }
    setExporting(true);
    try {
      const result = await exportAthleteSheet(sessionId, selectedAthlete, session.name, session.eJudgeCount);
      if (!result) {
        window.alert('採点済みの種目がありません。');
        return;
      }
      const filename = buildSheetFilename(selectedAthlete, result.scored, session.name);
      await shareOrDownload(result.blob, filename);
    } finally {
      setExporting(false);
    }
  };

  const handleBulkExport = async () => {
    if (!session || !sessionId) return;
    // 有効な選手名のみ抽出（削除済み等を除外）
    const targets = Array.from(checkedAthletes).filter(
      n => session.athletes.includes(n) && scoredCountOf(n) > 0,
    );
    if (targets.length === 0) return;
    setBulkExporting(true);
    setBulkProgress({ done: 0, total: targets.length, name: '' });
    try {
      const result = await generateBulkSheets(
        sessionId,
        targets,
        session.name,
        session.eJudgeCount,
        (done, total, name) => setBulkProgress({ done, total, name }),
      );
      if (result.items.length === 0) {
        window.alert('採点済みの種目がある選手がいませんでした。');
        return;
      }
      await shareOrDownloadMultiple(result.items, session.name);
    } finally {
      setBulkExporting(false);
      setBulkProgress(null);
    }
  };

  const commitSessionName = async () => {
    if (!session) return;
    const trimmed = sessionNameDraft.trim();
    if (!trimmed || trimmed === session.name) {
      setEditingSessionName(false);
      setSessionNameDraft('');
      return;
    }
    const updated = { ...session, name: trimmed };
    await db.sessions.put(updated);
    setSession(updated);
    setEditingSessionName(false);
    setSessionNameDraft('');
  };

  if (!session) return null;

  const allCheckableSelected =
    checkableAthletes.length > 0 && validCheckedCount === checkableAthletes.length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg-light dark:bg-bg-dark">
      <header className="bg-primary text-white px-4 py-2.5 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/')}
          className="text-white/70 hover:text-white text-sm min-h-[44px] px-2">戻る</button>
        {editingSessionName ? (
          <input
            autoFocus
            value={sessionNameDraft}
            onChange={e => setSessionNameDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitSessionName();
              else if (e.key === 'Escape') { setEditingSessionName(false); setSessionNameDraft(''); }
            }}
            onBlur={commitSessionName}
            className="font-bold bg-white/10 rounded px-2 py-1 min-h-[36px] text-white placeholder-white/50
                       border border-white/30 focus:border-white focus:outline-none min-w-[200px]"
          />
        ) : (
          <button
            onClick={() => { setSessionNameDraft(session.name); setEditingSessionName(true); }}
            title="セッション名を変更"
            className="font-bold hover:bg-white/10 rounded px-2 py-1 min-h-[36px] transition-colors flex items-center gap-1.5">
            <span>{session.name}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
        <button onClick={() => setShowRanking(true)}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 min-h-[36px] text-sm font-bold">
          <span>🏆</span>
          <span>ランキング</span>
        </button>
        <span className="text-sm text-white/60">
          {session.judgeMode}審判
          {session.judgeMode === 'E' ? ` (${session.eJudgeCount}人)` : ''}
        </span>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 左: 選手一覧 */}
        <div className="w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col shrink-0">
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

          {/* 一括共有ツールバー（採点済みがいる場合のみ） */}
          {checkableAthletes.length > 0 && (
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allCheckableSelected}
                  onChange={toggleCheckAll}
                  className="w-4 h-4 accent-accent cursor-pointer"
                />
                <span>全選択</span>
              </label>
              <span className="ml-auto text-xs text-gray-500">
                {validCheckedCount}/{checkableAthletes.length}
              </span>
            </div>
          )}

          {/* 選手リスト */}
          <div className="flex-1 overflow-y-auto">
            {session.athletes.map(name => {
              const doneCount = scoredCountOf(name);
              const checkable = doneCount > 0;
              const checked = checkedAthletes.has(name);
              return (
                <div key={name}
                  className={`flex items-center px-2 py-0 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${
                    selectedAthlete === name
                      ? 'bg-accent/10 border-l-4 border-l-accent'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}>
                  {/* 一括共有用チェックボックス */}
                  <label
                    className={`pl-1 pr-2 min-h-[44px] flex items-center ${checkable ? 'cursor-pointer' : 'cursor-not-allowed opacity-30'}`}
                    onClick={e => e.stopPropagation()}
                    title={checkable ? '一括共有に含める' : '採点済み種目がないため選択不可'}
                  >
                    <input
                      type="checkbox"
                      disabled={!checkable}
                      checked={checkable && checked}
                      onChange={() => checkable && toggleCheck(name)}
                      className="w-4 h-4 accent-accent cursor-pointer disabled:cursor-not-allowed"
                    />
                  </label>
                  <button onClick={() => setSelectedAthlete(name)}
                    className="flex-1 text-left text-sm font-medium text-gray-800 dark:text-gray-200 min-h-[44px] flex items-center gap-2 flex-wrap">
                    <span>{name}</span>
                    {/* 採点済み種目数バッジ */}
                    {doneCount > 0 && (
                      <span className="text-xs text-success font-bold">{doneCount}/6</span>
                    )}
                    {/* 順位＋AA合計 */}
                    {(() => {
                      const r = aaRanking.get(name);
                      if (!r || typeof r.total !== 'number') return null;
                      return (
                        <span className="text-[10px] font-bold text-accent flex items-center gap-1">
                          <span>{r.rank}位</span>
                          <span className="font-mono">{formatScore(r.total, FINAL_SCORE_DECIMALS)}</span>
                        </span>
                      );
                    })()}
                  </button>
                  <button onClick={() => removeAthlete(name)}
                    className="text-gray-300 hover:text-danger text-lg px-2 min-h-[44px] leading-none">
                    ×
                  </button>
                </div>
              );
            })}

            {session.athletes.length === 0 && !showBulk && (
              <div className="p-4 text-center text-gray-400 text-sm">
                下の欄から選手を追加
              </div>
            )}
          </div>

          {/* 一括共有ボタン（チェック1名以上のとき） */}
          {validCheckedCount > 0 && (
            <div className="p-2 border-t border-gray-200 dark:border-gray-700 bg-accent/5">
              <button
                onClick={handleBulkExport}
                disabled={bulkExporting}
                className="w-full py-2 min-h-[44px] rounded bg-accent text-white font-bold text-sm hover:bg-accent/90 disabled:opacity-50">
                {bulkExporting
                  ? (bulkProgress
                    ? `${bulkProgress.done}/${bulkProgress.total}人 処理中...`
                    : '作成中...')
                  : `選択中を一括共有 (${validCheckedCount}名)`}
              </button>
              {bulkExporting && bulkProgress && (
                <p className="text-xs text-gray-500 mt-1 truncate" title={bulkProgress.name}>
                  {bulkProgress.name}
                </p>
              )}
            </div>
          )}

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
                <button onClick={handleExport}
                  disabled={exporting || selectedScoredCount === 0}
                  className="px-6 py-2.5 min-h-[44px] rounded-lg bg-accent text-white font-bold
                             hover:bg-accent/90 disabled:opacity-50 transition-colors">
                  {exporting
                    ? '作成中...'
                    : selectedScoredCount === 0
                      ? '採点結果を共有（未採点）'
                      : `採点結果を共有 (${selectedScoredCount}/6)`}
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

      {showRanking && sessionId && (
        <RankingModal
          sessionId={sessionId}
          sessionName={session.name}
          sessionDate={session.date}
          mode="trial"
          athletes={session.athletes}
          eJudgeCount={session.eJudgeCount}
          onClose={() => setShowRanking(false)}
        />
      )}
    </div>
  );
}
