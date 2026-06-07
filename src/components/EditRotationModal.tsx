import { useState, useEffect, useMemo } from 'react';
import { db } from '../db/database';
import type { Rotation, Session, MemoRecord } from '../db/database';

interface Props {
  session: Session;
  rotation: Rotation;
  onClose: () => void;
  // 保存後、親側で再読込してもらうためのコールバック。
  // newStart: 編集後の現ローテーションの先頭ページ番号。
  onSaved: (info: { newStart: number }) => void;
}

const MIN_ATHLETES = 1;
const MAX_ATHLETES = 10;

interface Row {
  rid: string;                       // React key 用ローカルID
  name: string;
  originalIdx: number | null;        // 元 athletes 配列上の位置（null = 新規追加 or 移入）
  sourceRecordId: string | null;     // 別ローテからの「移入」時に元のレコードID
  sourceLabel: string | null;        // 表示用ラベル（例: "B団体・3人目"）
  hasContent: boolean;               // 元レコードが採点済みデータを持っているか（削除確認用）
}

function recordHasUserContent(rec: MemoRecord | undefined): boolean {
  if (!rec) return false;
  if (rec.strokes.length > 0) return true;
  if (rec.lines && rec.lines.length > 0) return true;
  if (rec.digitalScores) return true;
  return false;
}

// インポート候補（別ローテーションに属する1人ぶん）
interface ImportCandidate {
  recordId: string;
  athleteName: string;
  rotationLabel: string;       // 例: "団体A高校 #2"
  hasContent: boolean;
}

export default function EditRotationModal({ session, rotation, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>(
    () => rotation.athletes.map((name, idx) => ({
      rid: `o${idx}`,
      name,
      originalIdx: idx,
      sourceRecordId: null,
      sourceLabel: null,
      hasContent: false,
    }))
  );
  const [isTeam, setIsTeam] = useState(!!rotation.teamName);
  const [teamName, setTeamName] = useState(rotation.teamName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRowSeq, setNewRowSeq] = useState(0);
  const [showImporter, setShowImporter] = useState(false);
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[]>([]);

  // 既存レコードの content 有無を取得して rows に反映（削除確認用）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const flags: boolean[] = [];
      for (let i = 0; i < rotation.athletes.length; i++) {
        const page = rotation.startPage + i;
        const rec = await db.memoRecords.get(`comp:${session.id}:${page}`);
        flags.push(recordHasUserContent(rec));
      }
      if (cancelled) return;
      setRows(prev => prev.map((r) => {
        if (r.originalIdx === null) return r;
        return { ...r, hasContent: flags[r.originalIdx] ?? false };
      }));
    })();
    return () => { cancelled = true; };
  }, [rotation, session.id]);

  // インポート候補（このローテ以外のローテーションに属する選手）を取得
  useEffect(() => {
    if (!showImporter) return;
    let cancelled = false;
    (async () => {
      const allRotations = await db.rotations.where('sessionId').equals(session.id).toArray();
      allRotations.sort((a, b) => a.order - b.order);
      const allRecords = await db.memoRecords.where('sessionId').equals(session.id).toArray();
      const recordByPage = new Map(allRecords.map(r => [r.pageNumber, r]));
      const candidates: ImportCandidate[] = [];
      let rotIndex = 0;
      for (const rot of allRotations) {
        rotIndex++;
        if (rot.id === rotation.id) continue;
        const baseLabel = rot.teamName?.trim() ? `団体${rot.teamName.trim()}` : `ローテ#${rotIndex}`;
        rot.athletes.forEach((name, idx) => {
          const page = rot.startPage + idx;
          const rec = recordByPage.get(page);
          if (!rec) return;
          candidates.push({
            recordId: rec.id,
            athleteName: name,
            rotationLabel: `${baseLabel} #${idx + 1}`,
            hasContent: recordHasUserContent(rec),
          });
        });
      }
      if (cancelled) return;
      setImportCandidates(candidates);
    })();
    return () => { cancelled = true; };
  }, [showImporter, session.id, rotation.id]);

  // 既に rows に追加済みの sourceRecordId を集計（同じ人を二重追加させない）
  const importedSourceIds = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.sourceRecordId) s.add(r.sourceRecordId); });
    return s;
  }, [rows]);

  const clearError = () => { if (error) setError(null); };

  const updateRowName = (rid: string, name: string) => {
    clearError();
    setRows(prev => prev.map(r => r.rid === rid ? { ...r, name } : r));
  };

  const removeRow = (rid: string) => {
    clearError();
    const target = rows.find(r => r.rid === rid);
    if (!target) return;
    if (target.hasContent) {
      const ok = window.confirm(`「${target.name || '無名'}」のページには採点メモが保存されています。削除して良いですか？`);
      if (!ok) return;
    }
    setRows(prev => prev.filter(r => r.rid !== rid));
  };

  const moveRow = (rid: string, dir: -1 | 1) => {
    clearError();
    setRows(prev => {
      const i = prev.findIndex(r => r.rid === rid);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const insertRowAt = (idx: number) => {
    clearError();
    if (rows.length >= MAX_ATHLETES) {
      setError(`選手は最大 ${MAX_ATHLETES} 名までです`);
      return;
    }
    const newRow: Row = { rid: `n${newRowSeq}`, name: '', originalIdx: null, sourceRecordId: null, sourceLabel: null, hasContent: false };
    setRows(prev => {
      const next = [...prev];
      next.splice(idx, 0, newRow);
      return next;
    });
    setNewRowSeq(s => s + 1);
  };

  const addImported = (c: ImportCandidate) => {
    clearError();
    if (rows.length >= MAX_ATHLETES) {
      setError(`選手は最大 ${MAX_ATHLETES} 名までです`);
      return;
    }
    if (importedSourceIds.has(c.recordId)) return;
    const newRow: Row = {
      rid: `s${newRowSeq}`,
      name: c.athleteName,
      originalIdx: null,
      sourceRecordId: c.recordId,
      sourceLabel: c.rotationLabel,
      hasContent: c.hasContent,
    };
    setRows(prev => [...prev, newRow]);
    setNewRowSeq(s => s + 1);
  };

  const trimmedRows = rows
    .map(r => ({ ...r, name: r.name.trim() }))
    .filter(r => r.name.length > 0 || r.sourceRecordId !== null);
  const canSave = trimmedRows.length >= MIN_ATHLETES
    && trimmedRows.length <= MAX_ATHLETES
    && (!isTeam || teamName.trim().length > 0);

  const handleSave = async () => {
    if (!canSave || submitting) return;
    setSubmitting(true);
    try {
      const newTeamName = isTeam ? teamName.trim() : undefined;
      const sessionId = session.id;
      const apparatus = session.apparatus!;

      let newStartPage = rotation.startPage;

      await db.transaction('rw', db.memoRecords, db.rotations, async () => {
        // 1. 全ローテと全レコードを読み込み
        const allRotations = (await db.rotations.where('sessionId').equals(sessionId).toArray())
          .sort((a, b) => a.order - b.order);
        const allRecords = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
        const recordById = new Map(allRecords.map(r => [r.id, r]));
        const recordByPage = new Map(allRecords.map(r => [r.pageNumber, r]));

        // 2. 移入対象のソース recordId を収集
        const movedRecordIds = new Set<string>();
        for (const row of trimmedRows) {
          if (row.sourceRecordId) movedRecordIds.add(row.sourceRecordId);
        }

        // 3. 新レイアウトを構築
        type Slot = { name: string; content: MemoRecord | undefined };
        type Entry = { rot: Rotation; slots: Slot[]; isCurrent: boolean };
        const layout: Entry[] = [];

        for (const rot of allRotations) {
          if (rot.id === rotation.id) {
            const slots: Slot[] = trimmedRows.map(row => {
              let content: MemoRecord | undefined;
              if (row.originalIdx !== null) {
                const oldPage = rotation.startPage + row.originalIdx;
                content = recordByPage.get(oldPage);
              } else if (row.sourceRecordId) {
                content = recordById.get(row.sourceRecordId);
              }
              return { name: row.name, content };
            });
            layout.push({
              rot: { ...rot, athletes: trimmedRows.map(r => r.name), teamName: newTeamName },
              slots,
              isCurrent: true,
            });
          } else {
            const newAthletes: string[] = [];
            const slots: Slot[] = [];
            rot.athletes.forEach((name, idx) => {
              const oldPage = rot.startPage + idx;
              const oldRec = recordByPage.get(oldPage);
              if (oldRec && movedRecordIds.has(oldRec.id)) return; // 移出されたので除外
              newAthletes.push(name);
              slots.push({ name, content: oldRec });
            });
            layout.push({
              rot: { ...rot, athletes: newAthletes },
              slots,
              isCurrent: false,
            });
          }
        }

        // 4. ローテーションの新 startPage を順に計算（先頭=1から累積）
        let nextPage = 1;
        for (const entry of layout) {
          entry.rot = { ...entry.rot, startPage: nextPage };
          if (entry.isCurrent) newStartPage = nextPage;
          nextPage += entry.slots.length;
        }

        // 5. ローテに属さない solo レコードを末尾に再配置
        const soloRecords = allRecords
          .filter(r => !r.rotationId)
          .sort((a, b) => a.pageNumber - b.pageNumber);

        // 6. 既存レコードを全削除（一旦リセット）
        for (const r of allRecords) {
          await db.memoRecords.delete(r.id);
        }

        // 7. ローテーション順にレコードを再書き込み
        for (const entry of layout) {
          for (let i = 0; i < entry.slots.length; i++) {
            const slot = entry.slots[i];
            const newPage = entry.rot.startPage + i;
            const c = slot.content;
            await db.memoRecords.put({
              id: `comp:${sessionId}:${newPage}`,
              sessionId,
              athleteName: c?.athleteName ?? '',
              apparatus,
              pageNumber: newPage,
              strokes: c?.strokes ?? [],
              lines: c?.lines,
              canvasW: c?.canvasW,
              canvasH: c?.canvasH,
              digitalScores: c?.digitalScores,
              digitalAthleteName: slot.name,
              rotationId: entry.rot.id,
              updatedAt: new Date(),
            });
          }
        }

        // 8. solo レコードを末尾に再書き込み
        for (const r of soloRecords) {
          await db.memoRecords.put({
            ...r,
            id: `comp:${sessionId}:${nextPage}`,
            pageNumber: nextPage,
            updatedAt: new Date(),
          });
          nextPage += 1;
        }

        // 9. ローテーションを更新
        for (const entry of layout) {
          await db.rotations.put(entry.rot);
        }
      });

      onSaved({ newStart: newStartPage });
    } catch (e) {
      setError(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      setSubmitting(false);
    }
  };

  const availableCandidates = importCandidates.filter(c => !importedSourceIds.has(c.recordId));

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-bold text-primary dark:text-accent text-lg">ローテーション編集</h3>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center">
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">
              選手（{rows.length} 名 / 最大 {MAX_ATHLETES} 名）
            </label>
            <div className="space-y-1">
              <button
                onClick={() => insertRowAt(0)}
                disabled={rows.length >= MAX_ATHLETES}
                className="w-full py-0.5 text-[10px] text-gray-400 hover:text-accent
                           disabled:opacity-30 disabled:cursor-not-allowed"
                title="ここに挿入"
              >
                ＋ ここに挿入
              </button>
              {rows.map((r, idx) => (
                <div key={r.rid}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400 font-mono w-6 text-right">{idx + 1}.</span>
                    <input
                      value={r.name}
                      onChange={e => updateRowName(r.rid, e.target.value)}
                      placeholder="選手名"
                      className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                                 bg-white dark:bg-gray-700 dark:text-gray-100
                                 focus:outline-none focus:border-accent"
                    />
                    {r.sourceLabel && (
                      <span className="text-[10px] font-bold text-primary dark:text-accent px-1.5 py-0.5 rounded bg-primary/10 dark:bg-accent/10 shrink-0"
                            title={`移入元: ${r.sourceLabel}`}>
                        移入
                      </span>
                    )}
                    {r.hasContent && (
                      <span className="text-[10px] font-bold text-accent px-1.5 py-0.5 rounded bg-accent/10 shrink-0">採点済</span>
                    )}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => moveRow(r.rid, -1)}
                        disabled={idx === 0}
                        className="min-w-[28px] h-[20px] flex items-center justify-center rounded text-xs
                                   text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700
                                   disabled:opacity-20 disabled:cursor-not-allowed"
                        title="上へ"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveRow(r.rid, 1)}
                        disabled={idx === rows.length - 1}
                        className="min-w-[28px] h-[20px] flex items-center justify-center rounded text-xs
                                   text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700
                                   disabled:opacity-20 disabled:cursor-not-allowed"
                        title="下へ"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      onClick={() => removeRow(r.rid)}
                      disabled={rows.length <= MIN_ATHLETES}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md shrink-0
                                 text-danger hover:bg-danger/10 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="削除"
                    >
                      ×
                    </button>
                  </div>
                  <button
                    onClick={() => insertRowAt(idx + 1)}
                    disabled={rows.length >= MAX_ATHLETES}
                    className="w-full py-0.5 text-[10px] text-gray-400 hover:text-accent
                               disabled:opacity-30 disabled:cursor-not-allowed"
                    title="ここに挿入"
                  >
                    ＋ ここに挿入
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowImporter(s => !s)}
              disabled={rows.length >= MAX_ATHLETES}
              className="mt-3 w-full py-2 min-h-[44px] rounded-lg border-2 border-dashed
                         border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400
                         hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {showImporter ? '× 他ローテから選手を移入（閉じる）' : '↪ 他ローテから選手を移入'}
            </button>

            {showImporter && (
              <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg p-2 max-h-[40vh] overflow-y-auto">
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 px-1">
                  選んだ選手はこのローテに移動し、元のローテからは削除されます。採点メモも一緒に移動します。
                </div>
                {availableCandidates.length === 0 ? (
                  <div className="text-xs text-gray-400 italic py-3 text-center">
                    他ローテーションに移入可能な選手がいません
                  </div>
                ) : (
                  <div className="space-y-1">
                    {availableCandidates.map(c => (
                      <button
                        key={c.recordId}
                        onClick={() => addImported(c)}
                        disabled={rows.length >= MAX_ATHLETES}
                        className="w-full flex items-center gap-2 px-2 py-2 text-sm text-left rounded
                                   bg-gray-50 dark:bg-gray-700 hover:bg-accent/10 dark:hover:bg-accent/20
                                   disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className="font-medium text-gray-800 dark:text-gray-100 flex-1 min-w-0 truncate">
                          {c.athleteName || '(無名)'}
                        </span>
                        {c.hasContent && (
                          <span className="text-[10px] font-bold text-accent px-1.5 py-0.5 rounded bg-accent/10 shrink-0">採点済</span>
                        )}
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">{c.rotationLabel}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl border-2 border-accent/40 bg-accent/5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isTeam}
                onChange={e => { clearError(); setIsTeam(e.target.checked); }}
                className="w-5 h-5 accent-accent"
              />
              <span className="font-bold text-primary dark:text-accent">団体として登録する</span>
            </label>
            {isTeam && (
              <div className="mt-3 pl-8">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">団体名</label>
                <input
                  value={teamName}
                  onChange={e => { clearError(); setTeamName(e.target.value); }}
                  placeholder="例: A高校"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                             bg-white dark:bg-gray-700 dark:text-gray-100
                             focus:outline-none focus:border-accent"
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  ※ 同じ団体名で登録すると、団体ランキングでは同一チームとして合算されます
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-danger bg-red-50 dark:bg-red-900/20 border border-danger/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm
                       disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || submitting}
            className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-accent text-white font-bold text-sm
                       disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary"
          >
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
