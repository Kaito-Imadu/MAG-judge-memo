import { useState, useEffect, useMemo, useRef } from 'react';
import type { Apparatus } from '../types';
import { APPARATUS_LIST, APPARATUS_MAP } from '../constants/apparatus';
import { useSessionScores } from '../hooks/useSessionScores';
import type { ScoredEntry } from '../hooks/useSessionScores';
import {
  valid,
  mean,
  stdSample,
  deviationScore,
  boxStats,
  histogram,
  niceBinWidth,
} from '../utils/stats';
import {
  drawRadar,
  drawBoxplot,
  drawHistogramWithDots,
  drawBiasBars,
  ATHLETE_PALETTE,
  type RadarSeries,
  type BoxGroup,
  type BiasBar,
} from '../utils/charts';
import { exportStats } from '../utils/exportStats';

type Metric = 'd' | 'eFinal' | 'nd' | 'final';
const METRIC_LABELS: Record<Metric, string> = {
  d: 'D',
  eFinal: 'E決定',
  nd: 'ND',
  final: '決定点',
};

type TrialTab = 'radar' | 'box' | 'deviation' | 'bias';
type CompTab = 'hist' | 'box' | 'bias';

interface Props {
  sessionId: string;
  sessionName: string;
  sessionDate: Date;
  mode: 'trial' | 'competition';
  apparatus?: Apparatus;
  athletes?: string[];
  eJudgeCount: number;
  onClose: () => void;
  // 親モーダル（例: RankingModal）に埋め込む場合は外側枠とヘッダを省略する
  embedded?: boolean;
}

const CANVAS_W = 800;
const CANVAS_H = 480;
const DPR = window.devicePixelRatio || 2;

function getMetric(e: ScoredEntry | undefined, m: Metric): number | undefined {
  if (!e) return undefined;
  switch (m) {
    case 'd':
      return e.d;
    case 'eFinal':
      return e.eFinal;
    case 'nd':
      return e.nd;
    case 'final':
      return e.final;
  }
}

function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const c = canvas.getContext('2d')!;
  c.scale(DPR, DPR);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  return c;
}

export default function StatsModal({
  sessionId,
  sessionName,
  sessionDate,
  mode,
  apparatus,
  athletes = [],
  eJudgeCount,
  onClose,
  embedded = false,
}: Props) {
  const data = useSessionScores(sessionId);
  const [trialTab, setTrialTab] = useState<TrialTab>('radar');
  const [compTab, setCompTab] = useState<CompTab>('hist');
  const [metric, setMetric] = useState<Metric>('final');
  const [selectedAthletes, setSelectedAthletes] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 既定で全選手選択（試技会の最初の表示時）
  useEffect(() => {
    if (mode === 'trial' && selectedAthletes.size === 0 && athletes.length > 0) {
      setSelectedAthletes(new Set(athletes.slice(0, Math.min(athletes.length, 8))));
    }
  }, [mode, athletes, selectedAthletes.size]);

  // ---- 共通データ抽出 ----
  // 試技会: 各選手×各種目の ScoredEntry
  // 大会: 当該種目の全 entry
  const trialEntries = useMemo(() => {
    if (!data || mode !== 'trial') return null;
    return athletes.map((name) => {
      const m = data.byAthlete.get(name);
      const perApp: Partial<Record<Apparatus, ScoredEntry>> = {};
      APPARATUS_LIST.forEach((a) => {
        const e = m?.get(a.code);
        if (e) perApp[a.code] = e;
      });
      return { name, perApp };
    });
  }, [data, mode, athletes]);

  const compEntries = useMemo(() => {
    if (!data || mode !== 'competition' || !apparatus) return null;
    return data.scored.filter((e) => e.record.apparatus === apparatus);
  }, [data, mode, apparatus]);

  // ---- 描画ロジック ----
  // 試技会: 現在のタブに応じて canvas に描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    if (mode === 'trial' && !trialEntries) return;
    if (mode === 'competition' && !compEntries) return;

    const c = setupCanvas(canvas, CANVAS_W, CANVAS_H);
    const area = { x: 24, y: 16, w: CANVAS_W - 48, h: CANVAS_H - 32 };

    if (mode === 'trial') {
      if (trialTab === 'radar') {
        const series: RadarSeries[] = [];
        let colorIdx = 0;
        for (const t of trialEntries!) {
          if (!selectedAthletes.has(t.name)) continue;
          const values = APPARATUS_LIST.map((a) => t.perApp[a.code]?.final);
          if (values.every((v) => v === undefined)) continue;
          series.push({
            label: t.name,
            color: ATHLETE_PALETTE[colorIdx % ATHLETE_PALETTE.length],
            values,
          });
          colorIdx++;
        }
        drawRadar(
          c,
          area,
          APPARATUS_LIST.map((a) => a.code),
          series,
          16,
        );
      } else if (trialTab === 'box') {
        const groups: BoxGroup[] = APPARATUS_LIST.map((a) => {
          const vals = valid(trialEntries!.map((t) => getMetric(t.perApp[a.code], metric)));
          return { label: a.code, stats: boxStats(vals) };
        });
        drawBoxplot(c, area, groups);
      } else if (trialTab === 'bias') {
        const bars = computeBiasBars(data.scored, eJudgeCount);
        drawBiasBars(c, area, bars);
      }
      // deviation tab は HTML テーブルなので canvas 描画なし
    } else {
      // 大会
      if (compTab === 'hist') {
        const vals = valid(compEntries!.map((e) => getMetric(e, metric)));
        if (vals.length === 0) {
          drawHistogramWithDots(c, area, []);
        } else {
          const minV = Math.min(...vals);
          const maxV = Math.max(...vals);
          const binWidth = niceBinWidth(maxV - minV || 1, 8);
          // 値域を bin 幅にスナップして見栄えを良くする
          const lo = Math.floor(minV / binWidth) * binWidth;
          const hi = Math.ceil(maxV / binWidth) * binWidth;
          const bins = histogram(vals, { binWidth, min: lo, max: hi });
          drawHistogramWithDots(c, area, bins, metric === 'd' || metric === 'nd' ? 1 : 2);
        }
      } else if (compTab === 'box') {
        const vals = valid(compEntries!.map((e) => getMetric(e, metric)));
        const groups: BoxGroup[] = [{ label: METRIC_LABELS[metric], stats: boxStats(vals) }];
        drawBoxplot(c, area, groups);
      } else if (compTab === 'bias') {
        const bars = computeBiasBars(compEntries!, eJudgeCount);
        drawBiasBars(c, area, bars);
      }
    }
  }, [data, mode, trialTab, compTab, metric, selectedAthletes, trialEntries, compEntries, eJudgeCount]);

  // ---- 偏差値テーブル（試技会のみ） ----
  const deviationRows = useMemo(() => {
    if (mode !== 'trial' || !trialEntries) return null;
    // AA total per athlete (採点済み合計)
    const aaTotals = trialEntries.map((t) => {
      let sum = 0;
      let any = false;
      APPARATUS_LIST.forEach((a) => {
        const f = t.perApp[a.code]?.final;
        if (typeof f === 'number') {
          sum += f;
          any = true;
        }
      });
      return any ? Math.round(sum * 1000) / 1000 : undefined;
    });
    const aaValid = valid(aaTotals);
    const aaMean = mean(aaValid);
    const aaStd = stdSample(aaValid);

    // 種目別 mean/std
    const apparatusStats = APPARATUS_LIST.map((a) => {
      const vals = valid(trialEntries.map((t) => t.perApp[a.code]?.final));
      return { code: a.code, mean: mean(vals), std: stdSample(vals) };
    });

    return trialEntries.map((t, i) => {
      const aa = aaTotals[i];
      const aaDev =
        typeof aa === 'number' && typeof aaMean === 'number' && typeof aaStd === 'number'
          ? deviationScore(aa, aaMean, aaStd)
          : undefined;
      const perApp: Partial<Record<Apparatus, number>> = {};
      apparatusStats.forEach((s) => {
        const v = t.perApp[s.code]?.final;
        if (typeof v === 'number' && typeof s.mean === 'number' && typeof s.std === 'number') {
          perApp[s.code] = deviationScore(v, s.mean, s.std);
        }
      });
      return { name: t.name, aa, aaDev, perApp };
    });
  }, [mode, trialEntries]);

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (sharing) return;
    setSharing(true);
    try {
      const currentTab = mode === 'trial' ? trialTab : compTab;
      await exportStats({
        sessionName,
        sessionDate,
        mode,
        apparatus,
        eJudgeCount,
        tab: currentTab,
        metric,
        canvas: canvas ?? undefined,
        deviationRows: currentTab === 'deviation' ? deviationRows ?? undefined : undefined,
      });
    } finally {
      setSharing(false);
    }
  };

  const toggleAthlete = (name: string) => {
    setSelectedAthletes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const trialTabLabels: { key: TrialTab; label: string }[] = [
    { key: 'radar', label: 'レーダー' },
    { key: 'box', label: '箱ひげ' },
    { key: 'deviation', label: '偏差値' },
    { key: 'bias', label: 'E審判バイアス' },
  ];
  const compTabLabels: { key: CompTab; label: string }[] = [
    { key: 'hist', label: 'ヒストグラム' },
    { key: 'box', label: '箱ひげ' },
    { key: 'bias', label: 'E審判バイアス' },
  ];

  const showMetricPills =
    (mode === 'trial' && trialTab === 'box') ||
    (mode === 'competition' && (compTab === 'hist' || compTab === 'box'));

  const showCanvas =
    !(mode === 'trial' && trialTab === 'deviation');

  // 埋め込みモード（親モーダルに統合）
  const body = (
    <>
        {/* タブ */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            {(mode === 'trial' ? trialTabLabels : compTabLabels).map((t) => {
              const active = mode === 'trial' ? trialTab === t.key : compTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => (mode === 'trial' ? setTrialTab(t.key as TrialTab) : setCompTab(t.key as CompTab))}
                  className={`px-3 py-1.5 text-sm font-bold ${
                    active ? 'bg-accent text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* メトリック切替 */}
          {showMetricPills && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-gray-500">指標:</span>
              {(['d', 'eFinal', 'nd', 'final'] as Metric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    metric === m
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-gray-900">
          {!data ? (
            <div className="text-center text-gray-400 py-10">読み込み中…</div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-4">
              {/* レーダー時の選手選択パネル */}
              {mode === 'trial' && trialTab === 'radar' && (
                <div className="lg:w-48 shrink-0">
                  <div className="text-xs font-bold text-gray-500 mb-2">選手（重ね描き）</div>
                  <div className="flex flex-col gap-1 max-h-80 overflow-auto">
                    {athletes.map((name, i) => {
                      const checked = selectedAthletes.has(name);
                      const color = ATHLETE_PALETTE[
                        athletes.filter((a, idx) => idx <= i && selectedAthletes.has(a)).length - 1
                      ] || '#9CA3AF';
                      return (
                        <label
                          key={name}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAthlete(name)}
                            className="shrink-0"
                          />
                          {checked && (
                            <span
                              className="inline-block w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                          )}
                          <span className="truncate">{name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 偏差値テーブル */}
              {mode === 'trial' && trialTab === 'deviation' && (
                <div className="flex-1 overflow-auto bg-white dark:bg-gray-800 rounded-lg shadow">
                  <DeviationTable rows={deviationRows ?? []} />
                </div>
              )}

              {/* Canvas */}
              {showCanvas && (
                <div className="flex-1 flex items-start justify-center bg-white dark:bg-gray-800 rounded-lg shadow p-2 overflow-auto">
                  <canvas ref={canvasRef} className="max-w-full" />
                </div>
              )}
            </div>
          )}
        </div>
    </>
  );

  // 親モーダルに埋め込む場合: 共有ボタン + 本体のみ返す
  if (embedded) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 shrink-0">
          <button
            onClick={handleShare}
            disabled={sharing || !data}
            className="ml-auto px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-bold hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] flex items-center gap-1.5"
            title="現在のチャートを画像で共有"
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
        </div>
        {body}
      </div>
    );
  }

  // 単体モーダル
  return (
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <span>📊 統計</span>
            {mode === 'competition' && apparatus && (
              <span className="text-sm text-gray-500 font-normal">— {apparatus} {APPARATUS_MAP[apparatus].name}</span>
            )}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={handleShare}
              disabled={sharing || !data}
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-bold hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center gap-1.5"
              title="現在のチャートを画像で共有"
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
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}

// ===== 偏差値テーブル =====
interface DeviationRow {
  name: string;
  aa: number | undefined;
  aaDev: number | undefined;
  perApp: Partial<Record<Apparatus, number>>;
}

function DeviationTable({ rows }: { rows: DeviationRow[] }) {
  if (rows.length === 0) {
    return <div className="p-8 text-center text-gray-400 text-sm">データがありません</div>;
  }
  const cellColor = (dev: number | undefined): string => {
    if (typeof dev !== 'number') return 'text-gray-300';
    if (dev >= 65) return 'bg-green-100 text-green-900 font-bold dark:bg-green-900/40 dark:text-green-200';
    if (dev >= 55) return 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300';
    if (dev >= 45) return 'text-gray-700 dark:text-gray-300';
    if (dev >= 35) return 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300';
    return 'bg-red-100 text-red-900 font-bold dark:bg-red-900/40 dark:text-red-200';
  };
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
        <tr>
          <th className="px-3 py-2 text-xs font-bold text-gray-500 text-left">選手</th>
          <th className="px-3 py-2 text-xs font-bold text-gray-500 text-right">AA偏差値</th>
          {APPARATUS_LIST.map((a) => (
            <th key={a.code} className="px-2 py-2 text-xs font-bold text-gray-500 text-right">
              {a.code}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-b border-gray-100 dark:border-gray-700">
            <td className="px-3 py-2 text-gray-800 dark:text-gray-200 font-bold">{r.name}</td>
            <td className={`px-3 py-2 text-right font-mono ${cellColor(r.aaDev)}`}>
              {typeof r.aaDev === 'number' ? r.aaDev.toFixed(1) : '-'}
            </td>
            {APPARATUS_LIST.map((a) => {
              const dev = r.perApp[a.code];
              return (
                <td key={a.code} className={`px-2 py-2 text-right font-mono text-xs ${cellColor(dev)}`}>
                  {typeof dev === 'number' ? dev.toFixed(1) : '-'}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ===== E審判個人バイアス計算 =====
function computeBiasBars(entries: ScoredEntry[], eJudgeCount: number): BiasBar[] {
  // 各 E審判ごとの (個人点 - E決定) を集計
  const sums: number[] = Array(eJudgeCount).fill(0);
  const counts: number[] = Array(eJudgeCount).fill(0);
  for (const e of entries) {
    const eFinal = e.eFinal;
    if (typeof eFinal !== 'number') continue;
    const eArr = e.record.digitalScores?.e ?? [];
    for (let k = 0; k < eJudgeCount; k++) {
      const v = eArr[k];
      if (typeof v !== 'number') continue;
      sums[k] += v - eFinal;
      counts[k] += 1;
    }
  }
  const bars: BiasBar[] = [];
  for (let k = 0; k < eJudgeCount; k++) {
    if (counts[k] === 0) {
      bars.push({ label: `E${k + 1}`, value: 0, n: 0 });
    } else {
      bars.push({ label: `E${k + 1}`, value: sums[k] / counts[k], n: counts[k] });
    }
  }
  return bars;
}
