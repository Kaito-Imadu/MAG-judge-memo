import { useState } from 'react';
import { db } from '../db/database';
import type { Rotation, Session } from '../db/database';

interface Props {
  session: Session;
  // 既存ローテの末尾ページ番号（新ローテはここ+1から始まる）
  startAfterPage: number;
  onClose: () => void;
  // ローテ作成後、新ローテの先頭ページ番号を返す
  onCreated: (firstPage: number) => void;
}

const MIN_ATHLETES = 1;
const MAX_ATHLETES = 10;

export default function AddRotationModal({ session, startAfterPage, onClose, onCreated }: Props) {
  const [namesText, setNamesTextRaw] = useState('');
  const [isTeam, setIsTeamRaw] = useState(false);
  const [teamName, setTeamNameRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 入力変更時にエラーをクリア
  const clearError = () => { if (error) setError(null); };
  const setNamesText = (v: string) => { clearError(); setNamesTextRaw(v); };
  const setIsTeam = (v: boolean) => { clearError(); setIsTeamRaw(v); };
  const setTeamName = (v: string) => { clearError(); setTeamNameRaw(v); };

  // textarea からトリム済みの選手名リストを導出
  const parsedNames = namesText
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const count = parsedNames.length;
  const canCreate = count >= MIN_ATHLETES && count <= MAX_ATHLETES && (!isTeam || teamName.trim().length > 0);

  const handleCreate = async () => {
    if (!canCreate || submitting) return;
    if (count > MAX_ATHLETES) {
      setError(`選手は最大 ${MAX_ATHLETES} 名までです`);
      return;
    }
    setSubmitting(true);
    try {
      const startPage = startAfterPage + 1;
      const rotation: Rotation = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        order: Math.floor(Date.now()), // 単調増加でOK（同時作成は想定せず）
        athletes: parsedNames,
        teamName: isTeam ? teamName.trim() : undefined,
        startPage,
        createdAt: new Date(),
      };
      const apparatus = session.apparatus!;
      await db.transaction('rw', db.rotations, db.memoRecords, async () => {
        await db.rotations.add(rotation);
        for (let i = 0; i < parsedNames.length; i++) {
          const page = startPage + i;
          const name = parsedNames[i];
          await db.memoRecords.put({
            id: `comp:${session.id}:${page}`,
            sessionId: session.id,
            athleteName: '',
            apparatus,
            pageNumber: page,
            strokes: [],
            digitalAthleteName: name,
            rotationId: rotation.id,
            updatedAt: new Date(),
          });
        }
      });
      onCreated(startPage);
    } catch (e) {
      setError(`作成に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
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
          <h3 className="font-bold text-primary dark:text-accent text-lg">ローテーション追加</h3>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center">
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
              選手名（1行に1人 / 1〜{MAX_ATHLETES}人）
            </label>
            <textarea
              value={namesText}
              onChange={e => setNamesText(e.target.value)}
              placeholder={'山田 太郎\n佐藤 健\n鈴木 隼人'}
              rows={6}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                         bg-white dark:bg-gray-700 dark:text-gray-100 font-mono leading-relaxed
                         focus:outline-none focus:border-accent"
            />
            <div className="flex items-center justify-between mt-1">
              <span className={`text-xs ${count > MAX_ATHLETES ? 'text-danger font-bold' : 'text-gray-500'}`}>
                {count} 名{count > MAX_ATHLETES ? `（${MAX_ATHLETES}名以下にしてください）` : ''}
              </span>
              {startAfterPage > 0 && (
                <span className="text-xs text-gray-400">
                  Page {startAfterPage + 1} 〜
                </span>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl border-2 border-accent/40 bg-accent/5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isTeam}
                onChange={e => setIsTeam(e.target.checked)}
                className="w-5 h-5 accent-accent"
              />
              <span className="font-bold text-primary dark:text-accent">団体として登録する</span>
            </label>
            {isTeam && (
              <div className="mt-3 pl-8">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">団体名</label>
                <input
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  placeholder="例: A高校"
                  autoFocus
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm
                             bg-white dark:bg-gray-700 dark:text-gray-100
                             focus:outline-none focus:border-accent"
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  ※ 同名団体が既にあっても別扱いで登録されます
                </div>
              </div>
            )}
          </div>

          {session.teamScoring && (
            <div className="text-xs text-gray-500 dark:text-gray-400 px-1">
              💡 このセッションの団体スコアは「上位 {session.teamScoring.topN} 人合計」で計算されます
            </div>
          )}

          {error && (
            <div className="text-sm text-danger bg-red-50 dark:bg-red-900/20 border border-danger/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm"
          >
            キャンセル
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || submitting}
            className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-accent text-white font-bold text-sm
                       disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary"
          >
            {submitting ? '作成中…' : count > 0 ? `${count}人分ページ作成` : '選手名を入力してください'}
          </button>
        </div>
      </div>
    </div>
  );
}
