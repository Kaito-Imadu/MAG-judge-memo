import { useState, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Apparatus } from '../types';
import { APPARATUS_LIST } from '../constants/apparatus';
import { useSessionScores, rankBy, computeTeamScores } from '../hooks/useSessionScores';
import type { ScoredEntry, TeamMetric } from '../hooks/useSessionScores';
import type { TeamScoring, MemoRecord, Rotation } from '../db/database';
import { formatScore, formatBonus, FINAL_SCORE_DECIMALS } from '../utils/scoreCalc';
import {
  exportAARanking,
  exportApparatusRanking,
  exportTeamRanking,
  type AAItem,
  type ApparatusItem,
  type TeamRankItem,
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
  teamScoring?: TeamScoring; // 大会モードのみ
  onClose: () => void;
  // 大会モード: ランキング行タップで該当ページへジャンプ（親が currentPage を更新）
  onJumpToPage?: (page: number) => void;
}

type SortKey = 'final' | 'd' | 'eFinal';

const SORT_LABELS: Record<SortKey, string> = {
  final: '決定点',
  d: 'D',
  eFinal: 'E決定',
};

const TEAM_METRIC_LABELS: Record<TeamMetric, string> = {
  final: '決定点',
  d: 'D',
  eFinal: 'E決定',
  mean: '平均',
};

export default function RankingModal({ sessionId, sessionName, sessionDate, mode, apparatus, athletes = [], eJudgeCount, teamScoring, onClose, onJumpToPage }: Props) {
  const navigate = useNavigate();
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
  // 大会モード: 個人 / 団体 タブ
  const [compTab, setCompTab] = useState<'individual' | 'team'>('individual');
  // 団体タブのメトリック
  const [teamMetric, setTeamMetric] = useState<TeamMetric>('final');

  // 団体ローテーションが1つ以上あれば団体タブを表示
  const hasTeams = useMemo(() => {
    if (!data) return false;
    return data.rotations.some(r => !!r.teamName);
  }, [data]);

  // 団体ランキング集計（大会モードのみ）
  const topN = teamScoring?.topN ?? 3;
  const teamScored = useMemo(() => {
    if (!data || mode !== 'competition' || !hasTeams) return [];
    return computeTeamScores(data, topN, teamMetric);
  }, [data, mode, hasTeams, topN, teamMetric]);
  const teamRanked = useMemo(() => {
    // 採用人数を満たす団体だけランク付け、不足は参考表示
    const qualified = teamScored.filter(t => t.qualified);
    const ranked = rankBy(qualified, t => t.total);
    const unqualified = teamScored.filter(t => !t.qualified);
    return { ranked, unqualified };
  }, [teamScored]);

  const handleShare = async () => {
    if (!data || sharing) return;
    setSharing(true);
    try {
      let result: { shared: number } = { shared: 0 };
      if (mode === 'competition' && apparatus && compTab === 'team') {
        // 大会モード 団体タブ
        const items: TeamRankItem[] = teamRanked.ranked.map(r => ({
          rank: r.rank,
          teamName: r.item.teamName,
          memberCount: r.item.members.length,
          total: r.item.total,
          pickedValues: r.item.pickedValues,
          benchValues: r.item.benchValues,
        }));
        const refs: TeamRankItem[] = teamRanked.unqualified.map(t => ({
          rank: undefined,
          teamName: t.teamName,
          memberCount: t.members.length,
          total: t.total,
          pickedValues: t.pickedValues,
          benchValues: t.benchValues,
        }));
        result = await exportTeamRanking({
          sessionName,
          sessionDate,
          apparatus,
          eJudgeCount,
          topN,
          metricLabel: TEAM_METRIC_LABELS[teamMetric],
          items: [...items, ...refs],
        });
      } else if (mode === 'competition' && apparatus) {
        // 大会モード: ページ単位の中間表
        const entries = data.scored.filter((e) => e.record.apparatus === apparatus);
        const ranked = rankBy(entries, (e) => entryScore(e, sortKey));
        const items: ApparatusItem[] = ranked.map((r) => {
          const e = r.item;
          const namePart = (e.record.digitalAthleteName || '').trim();
          const name = namePart || '(無名)';
          return {
            rank: r.rank,
            prefix: `#${e.record.pageNumber}`,
            name,
            team: resolveTeamName(e.record, data.rotations),
            d: e.d,
            eFinal: e.eFinal,
            nd: e.nd,
            bonus: e.bonus,
            bonusValue: e.bonusValue,
            final: e.final,
          };
        });
        result = await exportApparatusRanking({
          sessionName,
          sessionDate,
          apparatus,
          eJudgeCount,
          hasPrefix: true,
          hasTeam: hasTeams,
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
                bonusValue: e.bonusValue,
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
                bonusValue: e.bonusValue,
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
          bonusValue: r.item.e?.bonusValue,
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
        const name = namePart || '(無名)';
        const teamName = resolveTeamName(e.record, data.rotations);
        const jumpable = !!onJumpToPage;
        const jump = () => {
          if (!onJumpToPage) return;
          onJumpToPage(e.record.pageNumber);
          onClose();
        };
        return (
          <tr key={e.record.id} className="border-b border-gray-100 dark:border-gray-700">
            <td className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 w-12">
              {r.rank ?? '-'}
            </td>
            <td className="px-3 py-2 text-xs font-mono text-gray-400 whitespace-nowrap">
              #{e.record.pageNumber}
            </td>
            <td className="px-3 py-2 text-sm">
              {jumpable ? (
                <button onClick={jump}
                  className="text-left text-accent dark:text-accent hover:underline font-medium min-h-[28px]">
                  {name}
                </button>
              ) : (
                <span className="text-gray-800 dark:text-gray-200">{name}</span>
              )}
            </td>
            {hasTeams && (
              <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {teamName ?? '-'}
              </td>
            )}
            <td className="px-3 py-2 text-sm font-mono text-right">{formatScore(e.d, 1)}</td>
            <td className="px-3 py-2 text-sm font-mono text-right">{formatScore(e.eFinal, decimals)}</td>
            <td className="px-3 py-2 text-sm font-mono text-right">{formatScore(e.nd ?? 0, 1)}</td>
            <td className="px-3 py-2 text-sm font-mono text-right">{formatBonus(e.bonusValue)}</td>
            <td className={`px-3 py-2 text-sm font-mono text-right font-bold ${typeof e.final === 'number' ? 'text-primary dark:text-accent' : 'text-gray-300'}`}>
              {formatScore(e.final, FINAL_SCORE_DECIMALS) || '-'}
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
      return ranked.map(r => {
        const jump = () => {
          if (!sessionId) return;
          navigate(`/trial/${sessionId}/judge/${encodeURIComponent(r.item.name)}/${appTab}`);
          onClose();
        };
        return (
          <tr key={r.item.name} className="border-b border-gray-100 dark:border-gray-700">
            <td className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 w-12">
              {r.rank ?? '-'}
            </td>
            <td className="px-3 py-2 text-sm">
              <button onClick={jump}
                className="text-left text-accent dark:text-accent hover:underline font-medium min-h-[28px]">
                {r.item.name}
              </button>
            </td>
            <td className="px-3 py-2 text-sm font-mono text-right">{r.item.e ? formatScore(r.item.e.d, 1) : ''}</td>
            <td className="px-3 py-2 text-sm font-mono text-right">{r.item.e ? formatScore(r.item.e.eFinal, decimals) : ''}</td>
            <td className="px-3 py-2 text-sm font-mono text-right">{r.item.e ? formatScore(r.item.e.nd ?? 0, 1) : ''}</td>
            <td className="px-3 py-2 text-sm font-mono text-right">{formatBonus(r.item.e?.bonusValue ?? 0)}</td>
            <td className={`px-3 py-2 text-sm font-mono text-right font-bold ${typeof r.item.e?.final === 'number' ? 'text-primary dark:text-accent' : 'text-gray-300'}`}>
              {formatScore(r.item.e?.final, FINAL_SCORE_DECIMALS) || '-'}
            </td>
          </tr>
        );
      });
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
    return ranked.map(r => {
      // AA: 採点済みの先頭種目に飛ぶ（無ければクリック不可）
      const firstScored = APPARATUS_LIST.find(a => typeof r.item.perApp[a.code] === 'number')?.code;
      const jump = () => {
        if (!sessionId || !firstScored) return;
        navigate(`/trial/${sessionId}/judge/${encodeURIComponent(r.item.name)}/${firstScored}`);
        onClose();
      };
      return (
      <tr key={r.item.name} className="border-b border-gray-100 dark:border-gray-700">
        <td className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 w-12">
          {r.rank ?? '-'}
        </td>
        <td className="px-3 py-2 text-sm sticky left-12 bg-white dark:bg-gray-800">
          {firstScored ? (
            <button onClick={jump} className="text-left text-accent dark:text-accent hover:underline font-medium min-h-[28px]">
              {r.item.name}
            </button>
          ) : (
            <span className="text-gray-800 dark:text-gray-200">{r.item.name}</span>
          )}
        </td>
        {APPARATUS_LIST.map(a => (
          <td key={a.code} className="px-2 py-2 text-xs font-mono text-right text-gray-600 dark:text-gray-400">
            {formatScore(r.item.perApp[a.code], decimals) || '-'}
          </td>
        ))}
        <td className={`px-3 py-2 text-sm font-mono text-right font-bold ${typeof r.score === 'number' ? 'text-primary dark:text-accent' : 'text-gray-300'}`}>
          {formatScore(r.score, decimals) || '-'}
        </td>
      </tr>
      );
    });
  }, [data, mode, apparatus, athletes, trialTab, appTab, sortKey, decimals, sessionId, onJumpToPage, navigate, onClose, hasTeams]);

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
          {mode === 'competition' && hasTeams && (
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
              <button onClick={() => setCompTab('individual')}
                className={`px-3 py-1.5 text-sm font-bold ${compTab === 'individual' ? 'bg-accent text-white' : 'bg-white dark:bg-gray-700 text-gray-600'}`}>
                個人
              </button>
              <button onClick={() => setCompTab('team')}
                className={`px-3 py-1.5 text-sm font-bold ${compTab === 'team' ? 'bg-accent text-white' : 'bg-white dark:bg-gray-700 text-gray-600'}`}>
                団体
              </button>
            </div>
          )}
          {mode === 'competition' && compTab === 'team' && (
            <>
              <span className="text-xs text-gray-500">集計: 上位 {topN} 合計</span>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-xs text-gray-500">指標:</span>
                {(['final', 'd', 'eFinal', 'mean'] as TeamMetric[]).map(m => (
                  <button key={m} onClick={() => setTeamMetric(m)}
                    className={`px-2 py-1 rounded text-xs font-bold ${teamMetric === m ? 'bg-accent text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600'}`}>
                    {TEAM_METRIC_LABELS[m]}
                  </button>
                ))}
              </div>
            </>
          )}
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
          {mode === 'competition' && compTab === 'team' ? (
            <TeamRankingTable
              ranked={teamRanked.ranked}
              unqualified={teamRanked.unqualified}
              topN={topN}
              metricLabel={TEAM_METRIC_LABELS[teamMetric]}
              decimals={teamMetric === 'd' ? 1 : decimals}
            />
          ) : (
          <>
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
                  {mode === 'competition' && (
                    <th className="px-3 py-2 text-xs font-bold text-gray-500 text-left">#</th>
                  )}
                  <th className="px-3 py-2 text-xs font-bold text-gray-500 text-left">選手</th>
                  {mode === 'competition' && hasTeams && (
                    <th className="px-3 py-2 text-xs font-bold text-gray-500 text-left">団体</th>
                  )}
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
          </>
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

// レコードが属するローテーションの団体名を解決（rotationId優先、無ければstartPage範囲でフォールバック）
function resolveTeamName(record: MemoRecord, rotations: Rotation[]): string | undefined {
  if (record.rotationId) {
    const direct = rotations.find(r => r.id === record.rotationId);
    if (direct) return direct.teamName;
  }
  const byRange = rotations.find(r =>
    record.pageNumber >= r.startPage && record.pageNumber < r.startPage + r.athletes.length,
  );
  return byRange?.teamName;
}

// ===== 団体ランキング表 =====
interface TeamRankingTableProps {
  ranked: Array<{ item: ReturnType<typeof computeTeamScores>[number]; rank: number | undefined; score: number | undefined }>;
  unqualified: ReturnType<typeof computeTeamScores>;
  topN: number;
  metricLabel: string;
  decimals: number;
}

function TeamRankingTable({ ranked, unqualified, topN, metricLabel, decimals }: TeamRankingTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const top1Total = ranked.length > 0 ? ranked[0].score : undefined;

  if (ranked.length === 0 && unqualified.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">
        団体ローテーションがまだ登録されていません
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
        <tr>
          <th className="px-3 py-2 text-xs font-bold text-gray-500 text-left w-12">順位</th>
          <th className="px-3 py-2 text-xs font-bold text-gray-500 text-left">団体</th>
          <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">人数</th>
          <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">団体 {metricLabel}</th>
          <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">採用 {topN} 名</th>
          <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">差</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map(r => {
          const t = r.item;
          const id = t.teamName;
          const isOpen = expanded.has(id);
          const diff = top1Total !== undefined && r.score !== undefined && r.rank !== 1
            ? r.score - top1Total
            : undefined;
          return (
            <Fragment key={id}>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300">{r.rank ?? '-'}</td>
                <td className="px-3 py-2 text-sm">
                  <button onClick={() => toggle(id)} className="text-left flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">{isOpen ? '▼' : '▶'}</span>
                    <span className="font-bold text-gray-800 dark:text-gray-200">{t.teamName}</span>
                  </button>
                </td>
                <td className="px-3 py-2 text-sm font-mono text-right text-gray-600">{t.members.length}</td>
                <td className={`px-3 py-2 text-sm font-mono text-right font-bold ${typeof r.score === 'number' ? 'text-primary dark:text-accent' : 'text-gray-300'}`}>
                  {formatScore(r.score, decimals) || '-'}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-right text-gray-600">
                  {t.pickedValues.map(v => formatScore(v, decimals)).join(' + ') || '-'}
                </td>
                <td className="px-3 py-2 text-xs font-mono text-right text-danger">
                  {typeof diff === 'number' ? formatScore(diff, decimals) : '-'}
                </td>
              </tr>
              {isOpen && (
                <tr className="bg-gray-50/60 dark:bg-gray-900/30">
                  <td></td>
                  <td colSpan={5} className="px-3 py-2">
                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                      {(() => {
                        // 採用フラグを左から順番に消費する（同値が複数ある場合も正しく扱う）
                        const remaining = [...t.pickedValues];
                        return t.members.map((m, mi) => {
                          const v = m.metricValue;
                          let isPicked = false;
                          if (typeof v === 'number') {
                            const idx = remaining.indexOf(v);
                            if (idx >= 0) { remaining.splice(idx, 1); isPicked = true; }
                          }
                          return (
                            <div key={mi}
                              className={`px-2 py-1.5 rounded bg-white dark:bg-gray-800 border-l-2 ${
                                isPicked ? 'border-success' : 'border-gray-300 opacity-60'
                              }`}>
                              <div className="text-[10px] text-gray-500">{isPicked ? '採用' : '控え'}</div>
                              <div className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">
                                {m.name}
                                {typeof m.entry?.record.pageNumber === 'number' && (
                                  <span className="ml-1 text-xs font-normal text-gray-400">#{m.entry.record.pageNumber}</span>
                                )}
                              </div>
                              <div className={`text-sm font-mono ${isPicked ? 'text-success' : 'text-gray-400'}`}>
                                {formatScore(v, decimals) || '未入力'}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
        {unqualified.length > 0 && (
          <Fragment>
            <tr>
              <td colSpan={6} className="px-3 pt-4 pb-1 text-xs text-gray-400 italic">
                参考表示（メンバー人数 &lt; {topN}）
              </td>
            </tr>
            {unqualified.map(t => (
              <tr key={t.teamName} className="border-b border-gray-100 dark:border-gray-700 opacity-70">
                <td className="px-3 py-2 text-xs text-gray-400 italic">参考</td>
                <td className="px-3 py-2 text-sm">
                  <span className="font-bold text-gray-600 dark:text-gray-400">{t.teamName}</span>
                  <span className="text-xs text-gray-500 ml-1">({t.members.length}名のみ)</span>
                </td>
                <td className="px-3 py-2 text-sm font-mono text-right text-gray-500">{t.members.length}</td>
                <td className="px-3 py-2 text-sm font-mono text-right text-gray-500">{formatScore(t.total, decimals) || '-'}</td>
                <td className="px-3 py-2 text-xs font-mono text-right text-gray-500">
                  {t.pickedValues.map(v => formatScore(v, decimals)).join(' + ') || '-'}
                </td>
                <td className="px-3 py-2 text-xs text-gray-300 text-right">—</td>
              </tr>
            ))}
          </Fragment>
        )}
      </tbody>
    </table>
  );
}
