import { useState, useMemo } from 'react';
import type { Apparatus } from '../types';
import { APPARATUS_LIST } from '../constants/apparatus';
import { useSessionScores, rankBy } from '../hooks/useSessionScores';
import type { ScoredEntry } from '../hooks/useSessionScores';
import { formatScore, FINAL_SCORE_DECIMALS } from '../utils/scoreCalc';
import {
  exportAARanking,
  exportApparatusRanking,
  type AAItem,
  type ApparatusItem,
} from '../utils/exportRanking';
import StatsModal from './StatsModal';

interface Props {
  sessionId: string;
  sessionName: string;
  sessionDate: Date;
  mode: 'trial' | 'competition';
  apparatus?: Apparatus;
  athletes?: string[];
  eJudgeCount: number;     // E決定・決定点の表示桁数決定に使う
  onClose: () => void;
}

type SortKey = 'final' | 'd' | 'eFinal';

const SORT_LABELS: Record<SortKey, string> = {
  final: '決定点',
  d: 'D',
  eFinal: 'E決定',
};

export default function RankingModal({ sessionId, sessionName, sessionDate, mode, apparatus, athletes = [], eJudgeCount, onClose }: Props) {
  // セッション全体の eJudgeCount に基づき、E決定/決定点の桁数を決定（1〜3=2桁、4以上=3桁）
  const decimals = eJudgeCount <= 3 ? 2 : 3;
  const data = useSessionScores(sessionId);
  const [sortKey, setSortKey] = useState<SortKey>('final');
  // 試技会モード: タブ（種目別 or AA）
  const [trialTab, setTrialTab] = useState<'apparatus' | 'aa'>('aa');
  // 試技会モード: 種目別タブで見る種目
  const [appTab, setAppTab] = useState<Apparatus>('FX');
  // 共有処理中フラグ
  const [sharing, setSharing] = useState(false);
  // ランキング / 統計 のビュー切替
  const [view, setView] = useState<'ranking' | 'stats'>('ranking');

  const handleShare = async () => {
    if (!data || sharing) return;
    setSharing(true);
    try {
      let result: { shared: number } = { shared: 0 };
      if (mode === 'competition' && apparatus) {
        // 大会モード: ページ単位の中間表
        const entries = data.scored.filter((e) => e.record.apparatus === apparatus);
        const ranked = rankBy(entries, (e) => entryScore(e, sortKey));
        const items: ApparatusItem[] = ranked.map((r) => {
          const e = r.item;
          const namePart = (e.record.digitalAthleteName || '').trim();
          const name = namePart || `P${e.record.pageNumber}`;
          return {
            rank: r.rank,
            prefix: `#${e.record.pageNumber}`,
            name,
            d: e.d,
            eFinal: e.eFinal,
            nd: e.nd,
            bonus: e.bonus,
            final: e.final,
          };
        });
        result = await exportApparatusRanking({
          sessionName,
          sessionDate,
          apparatus,
          eJudgeCount,
          hasPrefix: true,
          items,
        });
      } else if (mode === 'trial' && trialTab === 'aa') {
        // 試技会 AAタブ: 詳細カード
        const aaRows = athletes.map((name) => {
          const m = data.byAthlete.get(name);
          let total = 0;
          let any = false;
          const perApp: AAItem['perApp'] = {};
          APPARATUS_LIST.forEach((a) => {
            const e = m?.get(a.code);
            if (e && typeof e.final === 'number') {
              perApp[a.code] = {
                d: e.d,
                eFinal: e.eFinal,
                nd: e.nd,
                bonus: e.bonus,
                final: e.final,
              };
              total += e.final;
              any = true;
            } else if (e) {
              // 部分入力（D だけ等）も保持
              perApp[a.code] = {
                d: e.d,
                eFinal: e.eFinal,
                nd: e.nd,
                bonus: e.bonus,
                final: e.final,
              };
            }
          });
          return { name, total: any ? Math.round(total * 1000) / 1000 : undefined, perApp };
        });
        const ranked = rankBy(aaRows, (r) => r.total);
        const items: AAItem[] = ranked.map((r) => ({
          rank: r.rank,
          name: r.item.name,
          total: r.score,
          perApp: r.item.perApp,
        }));
        result = await exportAARanking({
          sessionName,
          sessionDate,
          eJudgeCount,
          items,
        });
      } else if (mode === 'trial' && trialTab === 'apparatus') {
        // 試技会 種目別タブ: 中間表
        const rows = athletes.map((name) => {
          const m = data.byAthlete.get(name);
          const e = m?.get(appTab);
          return { name, e };
        });
        const ranked = rankBy(rows, (r) => (r.e ? entryScore(r.e, sortKey) : undefined));
        const items: ApparatusItem[] = ranked.map((r) => ({
          rank: r.rank,
          name: r.item.name,
          d: r.item.e?.d,
          eFinal: r.item.e?.eFinal,
          nd: r.item.e?.nd,
          bonus: r.item.e?.bonus ?? false,
          final: r.item.e?.final,
        }));
        result = await exportApparatusRanking({
          sessionName,
          sessionDate,
          apparatus: appTab,
          eJudgeCount,
          hasPrefix: false,
          items,
        });
      }
      if (result.shared === 0) {
        alert('共有できる採点結果がありません。スコアを入力してから再度お試しください。');
      }
    } finally {
      setSharing(false);
    }
  };

  const renderRows = useMemo(() => {
    if (!data) return null;
    if (mode === 'competition' && apparatus) {
      // 1ページ1行、digitalScores 持ちのみ。score列でソート。
      const entries = data.scored.filter(e => e.record.apparatus === apparatus);
      const ranked = rankBy(entries, e => entryScore(e, sortKey));
      return ranked.map(r => {
        const e = r.item;
        const namePart = (e.record.digitalAthleteName || '').trim();
        const name = namePart || `P${e.record.pageNumber}`;
        return (
          <tr key={e.record.id} className="border-b border-gray-100 dark:border-gray-700">
            <td className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 w-12">
              {r.rank ?? '-'}
            </td>
            <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{name}</td>
            <td className="px-3 py-2 text-sm font-mono text-right">{formatScore(e.d, 1)}</td>
            <td className="px-3 py-2 text-sm font-mono text-right">{formatScore(e.eFinal, decimals)}</td>
            <td className="px-3 py-2 text-sm font-mono text-right">{formatScore(e.nd ?? 0, 1)}</td>
            <td className="px-3 py-2 text-sm font-mono text-right">{e.bonus ? '+0.1' : ''}</td>
            <td className={`px-3 py-2 text-sm font-mono text-right font-bold ${typeof r.score === 'number' ? 'text-primary dark:text-accent' : 'text-gray-300'}`}>
              {formatScore(r.score, FINAL_SCORE_DECIMALS) || '-'}
            </td>
          </tr>
        );
      });
    }
    // trial mode
    if (trialTab === 'apparatus') {
      // 1選手1行（その種目のみ）。athletesに無い名前は出さない。
      const rows = athletes.map(name => {
        const m = data.byAthlete.get(name);
        const e = m?.get(appTab);
        return { name, e };
      });
      const ranked = rankBy(rows, r => r.e ? entryScore(r.e, sortKey) : undefined);
      return ranked.map(r => (
        <tr key={r.item.name} className="border-b border-gray-100 dark:border-gray-700">
          <td className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 w-12">
            {r.rank ?? '-'}
          </td>
          <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{r.item.name}</td>
          <td className="px-3 py-2 text-sm font-mono text-right">{r.item.e ? formatScore(r.item.e.d, 1) : ''}</td>
          <td className="px-3 py-2 text-sm font-mono text-right">{r.item.e ? formatScore(r.item.e.eFinal, decimals) : ''}</td>
          <td className="px-3 py-2 text-sm font-mono text-right">{r.item.e ? formatScore(r.item.e.nd ?? 0, 1) : ''}</td>
          <td className="px-3 py-2 text-sm font-mono text-right">{r.item.e?.bonus ? '+0.1' : ''}</td>
          <td className={`px-3 py-2 text-sm font-mono text-right font-bold ${typeof r.score === 'number' ? 'text-primary dark:text-accent' : 'text-gray-300'}`}>
            {formatScore(r.score, FINAL_SCORE_DECIMALS) || '-'}
          </td>
        </tr>
      ));
    }
    // trial AA
    const aaRows = athletes.map(name => {
      const m = data.byAthlete.get(name);
      let total = 0;
      let any = false;
      const perApp: Record<Apparatus, number | undefined> = {
        FX: undefined, PH: undefined, SR: undefined, VT: undefined, PB: undefined, HB: undefined,
      };
      APPARATUS_LIST.forEach(a => {
        const e = m?.get(a.code);
        if (e && typeof e.final === 'number') {
          perApp[a.code] = e.final;
          total += e.final;
          any = true;
        }
      });
      return { name, total: any ? Math.round(total * 1000) / 1000 : undefined, perApp };
    });
    const ranked = rankBy(aaRows, r => r.total);
    return ranked.map(r => (
      <tr key={r.item.name} className="border-b border-gray-100 dark:border-gray-700">
        <td className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 w-12">
          {r.rank ?? '-'}
        </td>
        <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200 sticky left-12 bg-white dark:bg-gray-800">{r.item.name}</td>
        {APPARATUS_LIST.map(a => (
          <td key={a.code} className="px-2 py-2 text-xs font-mono text-right text-gray-600 dark:text-gray-400">
            {formatScore(r.item.perApp[a.code], decimals) || '-'}
          </td>
        ))}
        <td className={`px-3 py-2 text-sm font-mono text-right font-bold ${typeof r.score === 'number' ? 'text-primary dark:text-accent' : 'text-gray-300'}`}>
          {formatScore(r.score, decimals) || '-'}
        </td>
      </tr>
    ));
  }, [data, mode, apparatus, athletes, trialTab, appTab, sortKey, decimals]);

  return (
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {/* ランキング / 統計 ビュー切替 */}
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
              <button onClick={() => setView('ranking')}
                className={`px-3 py-1.5 text-sm font-bold min-h-[40px] ${
                  view === 'ranking' ? 'bg-accent text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}>
                🏆 ランキング
              </button>
              <button onClick={() => setView('stats')}
                className={`px-3 py-1.5 text-sm font-bold min-h-[40px] ${
                  view === 'stats' ? 'bg-accent text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }`}>
                📊 統計
              </button>
            </div>
            {mode === 'competition' && apparatus && (
              <span className="text-sm text-gray-500 font-normal">— {apparatus}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {view === 'ranking' && (
              <button
                onClick={handleShare}
                disabled={sharing || !data}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-bold hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center gap-1.5"
                title="現在表示中のランキングを画像で共有"
              >
                {sharing ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>生成中…</span>
                  </>
                ) : (
                  <>
                    <span>📤</span>
                    <span>共有</span>
                  </>
                )}
              </button>
            )}
            <button onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center">
              ×
            </button>
          </div>
        </div>

        {view === 'stats' ? (
          <div className="flex-1 overflow-hidden">
            <StatsModal
              embedded
              sessionId={sessionId}
              sessionName={sessionName}
              sessionDate={sessionDate}
              mode={mode}
              apparatus={apparatus}
              athletes={athletes}
              eJudgeCount={eJudgeCount}
              onClose={onClose}
            />
          </div>
        ) : (
        <>
        {/* タブ・ソート切替 */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2 shrink-0">
          {mode === 'trial' && (
            <>
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                <button onClick={() => setTrialTab('aa')}
                  className={`px-3 py-1.5 text-sm font-bold ${trialTab === 'aa' ? 'bg-accent text-white' : 'bg-white dark:bg-gray-700 text-gray-600'}`}>
                  AA
                </button>
                <button onClick={() => setTrialTab('apparatus')}
                  className={`px-3 py-1.5 text-sm font-bold ${trialTab === 'apparatus' ? 'bg-accent text-white' : 'bg-white dark:bg-gray-700 text-gray-600'}`}>
                  種目別
                </button>
              </div>
              {trialTab === 'apparatus' && (
                <div className="flex gap-1 flex-wrap">
                  {APPARATUS_LIST.map(a => (
                    <button key={a.code} onClick={() => setAppTab(a.code)}
                      className={`px-2 py-1 rounded text-xs font-bold ${appTab === a.code ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600'}`}>
                      {a.code}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {/* ソート列（AAタブ以外） */}
          {!(mode === 'trial' && trialTab === 'aa') && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-gray-500">ソート:</span>
              {(['final', 'd', 'eFinal'] as SortKey[]).map(k => (
                <button key={k} onClick={() => setSortKey(k)}
                  className={`px-2 py-1 rounded text-xs font-bold ${sortKey === k ? 'bg-accent text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600'}`}>
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
              {mode === 'trial' && trialTab === 'aa' ? (
                <tr>
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-left">順位</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-left sticky left-12 bg-gray-50 dark:bg-gray-900">選手</th>
                  {APPARATUS_LIST.map(a => (
                    <th key={a.code} className="px-2 py-2 text-xs font-bold text-gray-500 text-right">{a.code}</th>
                  ))}
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">AA合計</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-left">順位</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-left">{mode === 'competition' ? 'ページ/選手' : '選手'}</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">D</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">E決定</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">ND</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">加点</th>
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">決定点</th>
                </tr>
              )}
            </thead>
            <tbody>
              {renderRows}
            </tbody>
          </table>
          {data && data.scored.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">
              まだスコアが入力されていません
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function entryScore(e: ScoredEntry, k: SortKey): number | undefined {
  if (k === 'final') return e.final;
  if (k === 'd') return e.d;
  return e.eFinal;
}
