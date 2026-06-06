import { useState, useEffect } from 'react';
import { db } from '../db/database';
import type { Rotation, Session, MemoRecord } from '../db/database';

interface Props {
  session: Session;
  rotation: Rotation;
  onClose: () => void;
  // 保存後、親側で再読込してもらうためのコールバック。delta は人数変化量。
  onSaved: (info: { delta: number; oldStart: number; oldCount: number }) => void;
}

const MIN_ATHLETES = 1;
const MAX_ATHLETES = 10;

interface Row {
  rid: string;                  // React key 用ローカルID
  name: string;
  originalIdx: number | null;   // 元 athletes 配列上の位置（null = 新規追加）
  hasContent: boolean;          // 元レコードが採点済みデータを持っているか（削除確認用）
}

function recordHasUserContent(rec: MemoRecord | undefined): boolean {
  if (!rec) return false;
  if (rec.strokes.length > 0) return true;
  if (rec.lines && rec.lines.length > 0) return true;
  if (rec.digitalScores) return true;
  return false;
}

export default function EditRotationModal({ session, rotation, onClose, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>(
    () => rotation.athletes.map((name, idx) => ({
      rid: `o${idx}`,
      name,
      originalIdx: idx,
      hasContent: false,
    }))
  );
  const [isTeam, setIsTeam] = useState(!!rotation.teamName);
  const [teamName, setTeamName] = useState(rotation.teamName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRowSeq, setNewRowSeq] = useState(0);

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
    const newRow: Row = { rid: `n${newRowSeq}`, name: '', originalIdx: null, hasContent: false };
    setRows(prev => {
      const next = [...prev];
      next.splice(idx, 0, newRow);
      return next;
    });
    setNewRowSeq(s => s + 1);
  };

  const addRow = () => {
    clearError();
    if (rows.length >= MAX_ATHLETES) {
      setError(`選手は最大 ${MAX_ATHLETES} 名までです`);
      return;
    }
    setRows(prev => [...prev, { rid: `n${newRowSeq}`, name: '', originalIdx: null, hasContent: false }]);
    setNewRowSeq(s => s + 1);
  };

  const trimmedRows = rows.map(r => ({ ...r, name: r.name.trim() })).filter(r => r.name.length > 0);
  const canSave = trimmedRows.length >= MIN_ATHLETES
    && trimmedRows.length <= MAX_ATHLETES
    && (!isTeam || teamName.trim().length > 0);

  const handleSave = async () => {
    if (!canSave || submitting) return;
    setSubmitting(true);
    try {
      const oldStart = rotation.startPage;
      const oldCount = rotation.athletes.length;
      const newCount = trimmedRows.length;
      const delta = newCount - oldCount;
      const apparatus = session.apparatus!;
      const sessionId = session.id;
      const newTeamName = isTeam ? teamName.trim() : undefined;

      await db.transaction('rw', db.memoRecords, db.rotations, async () => {
        // 1. 既存ローテのレコードを取得（保存内容の保存先として参照）
        const oldRecords: (MemoRecord | undefined)[] = [];
        for (let i = 0; i < oldCount; i++) {
          oldRecords.push(await db.memoRecords.get(`comp:${sessionId}:${oldStart + i}`));
        }
        // 2. ローテーション後ろのレコードを取得
        const afterAll = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
        const afterRecords = afterAll.filter(r => r.pageNumber >= oldStart + oldCount);

        // 3. 既存ローテレコードと後続レコードを一旦全削除
        for (let i = 0; i < oldCount; i++) {
          await db.memoRecords.delete(`comp:${sessionId}:${oldStart + i}`);
        }
        for (const r of afterRecords) {
          await db.memoRecords.delete(r.id);
        }

        // 4. ローテ範囲: 新メンバーを書き込み（originalIdx があれば内容を引き継ぐ）
        for (let idx = 0; idx < trimmedRows.length; idx++) {
          const row = trimmedRows[idx];
          const newPage = oldStart + idx;
          const base = row.originalIdx !== null ? oldRecords[row.originalIdx] : undefined;
          await db.memoRecords.put({
            id: `comp:${sessionId}:${newPage}`,
            sessionId,
            athleteName: base?.athleteName ?? '',
            apparatus,
            pageNumber: newPage,
            strokes: base?.strokes ?? [],
            lines: base?.lines,
            canvasW: base?.canvasW,
            canvasH: base?.canvasH,
            digitalScores: base?.digitalScores,
            digitalAthleteName: row.name,
            rotationId: rotation.id,
            updatedAt: new Date(),
          });
        }

        // 5. 後続レコードを delta 分シフトして再配置
        for (const r of afterRecords) {
          const newPage = r.pageNumber + delta;
          await db.memoRecords.put({
            ...r,
            id: `comp:${sessionId}:${newPage}`,
            pageNumber: newPage,
            updatedAt: new Date(),
          });
        }

        // 6. ローテーション自身を更新
        await db.rotations.put({
          ...rotation,
          athletes: trimmedRows.map(r => r.name),
          teamName: newTeamName,
        });

        // 7. 後続ローテの startPage を delta 分シフト
        const allRotations = await db.rotations.where('sessionId').equals(sessionId).toArray();
        for (const rot of allRotations) {
          if (rot.id === rotation.id) continue;
          if (rot.startPage > oldStart) {
            await db.rotations.put({ ...rot, startPage: rot.startPage + delta });
          }
        }
      });

      onSaved({ delta, oldStart, oldCount });
    } catch (e) {
      setError(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      setSubmitting(false);
    }
  };

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
              {/* 先頭への挿入ボタン */}
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
                  {/* この行の直後への挿入ボタン */}
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
              onClick={addRow}
              disabled={rows.length >= MAX_ATHLETES}
              className="mt-3 w-full py-2 min-h-[44px] rounded-lg border-2 border-dashed
                         border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400
                         hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed"
            >
              + 選手を追加
            </button>
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
