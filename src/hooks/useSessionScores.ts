import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { MemoRecord, Rotation } from '../db/database';
import type { Apparatus } from '../types';
import { calcFinal, getEFinal, getBonusValue } from '../utils/scoreCalc';

export interface ScoredEntry {
  record: MemoRecord;
  d: number | undefined;
  eFinal: number | undefined;
  nd: number | undefined;
  bonus: boolean;
  bonusValue: number;   // 加点の実適用値（bonus=false や PH は 0）
  final: number | undefined;
}

export interface SessionScores {
  records: MemoRecord[];
  rotations: Rotation[];
  scored: ScoredEntry[];                              // 全 MemoRecord をスコア付きで列挙
  byAthlete: Map<string, Map<Apparatus, ScoredEntry>>; // 試技会用: athleteName → apparatus → entry
}

// セッション内の全 MemoRecord を Live Query で監視し、デジタルスコアと派生値を返す。
export function useSessionScores(sessionId: string | undefined): SessionScores | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return undefined;
    const records = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
    const rotations = await db.rotations.where('sessionId').equals(sessionId).toArray();
    const scored: ScoredEntry[] = records.map(r => {
      const ds = r.digitalScores;
      const entry: ScoredEntry = {
        record: r,
        d: ds?.d,
        eFinal: ds ? getEFinal(ds) : undefined,
        nd: ds?.nd,
        bonus: ds?.bonus ?? false,
        bonusValue: getBonusValue(ds, r.apparatus),
        final: ds ? calcFinal(ds, r.apparatus) : undefined,
      };
      return entry;
    });
    const byAthlete = new Map<string, Map<Apparatus, ScoredEntry>>();
    for (const e of scored) {
      const name = e.record.athleteName;
      if (!name) continue;
      let m = byAthlete.get(name);
      if (!m) { m = new Map(); byAthlete.set(name, m); }
      m.set(e.record.apparatus, e);
    }
    return { records, rotations, scored, byAthlete };
  }, [sessionId]);
}

// 団体集計1件（同名団体は複数ローテをマージして1エントリにする）
export interface TeamScored {
  teamName: string;
  rotations: Rotation[];  // 同名でマージされた元ローテ群（登録順）
  members: { name: string; entry: ScoredEntry | undefined; metricValue: number | undefined }[];
  // 採用された上位N人の合計（メトリック別）
  total: number | undefined;
  // 採用された値の配列（降順）
  pickedValues: number[];
  // 控え（採用外）の値
  benchValues: number[];
  // 採用された人数（メトリック値を持つ人数 = min(memberCount with value, topN)）
  pickedCount: number;
  // 必要人数（topN）に対し人数が足りているか
  qualified: boolean;
}

export type TeamMetric = 'final' | 'd' | 'eFinal' | 'mean';

function getMetricValue(e: ScoredEntry | undefined, m: TeamMetric): number | undefined {
  if (!e) return undefined;
  if (m === 'final') return e.final;
  if (m === 'd') return e.d;
  if (m === 'eFinal') return e.eFinal;
  if (m === 'mean') return e.final; // 平均は同じく決定点を集計対象に、後で平均化
  return undefined;
}

// 団体ランキング集計
//   metric: 何を集計するか（決定点 / D / E決定 / 平均）
//   topN: 採用人数
//   同名団体（teamName が前後空白を除いて一致）は1チームに統合し、メンバーを連結。
export function computeTeamScores(
  data: SessionScores,
  topN: number,
  metric: TeamMetric,
): TeamScored[] {
  // teamName でグループ化（前後空白を除去、空文字は除外）
  const groups = new Map<string, Rotation[]>();
  for (const rot of data.rotations) {
    const key = (rot.teamName ?? '').trim();
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(rot);
    else groups.set(key, [rot]);
  }

  const result: TeamScored[] = [];
  for (const [teamName, rots] of groups) {
    // 登録順に並べてメンバーを連結
    rots.sort((a, b) => a.order - b.order);
    const members: TeamScored['members'] = [];
    for (const rot of rots) {
      rot.athletes.forEach((name, idx) => {
        // 第一候補: rotationId が一致しているレコード
        let entry = data.scored.find(s =>
          s.record.rotationId === rot.id &&
          (s.record.digitalAthleteName ?? '').trim() === name,
        );
        // フォールバック: rotationId が無いが startPage 範囲内のレコード（救済）
        if (!entry) {
          const expectedPage = rot.startPage + idx;
          entry = data.scored.find(s =>
            !s.record.rotationId &&
            s.record.pageNumber === expectedPage,
          );
        }
        const metricValue = getMetricValue(entry, metric);
        members.push({ name, entry, metricValue });
      });
    }
    // 値を持つ人だけソートして上位 topN を採用
    const withValue = members
      .filter(m => typeof m.metricValue === 'number')
      .sort((a, b) => (b.metricValue! - a.metricValue!));
    const pickedValues = withValue.slice(0, topN).map(m => m.metricValue!);
    const benchValues = withValue.slice(topN).map(m => m.metricValue!);
    const pickedCount = pickedValues.length;
    const qualified = pickedCount >= topN;
    let total: number | undefined = undefined;
    if (pickedValues.length > 0) {
      const sum = pickedValues.reduce((a, b) => a + b, 0);
      total = metric === 'mean' ? sum / pickedValues.length : sum;
      total = Math.round(total * 1000) / 1000;
    }
    result.push({ teamName, rotations: rots, members, total, pickedValues, benchValues, pickedCount, qualified });
  }
  return result;
}

// 同点処理: スコア降順でランク付け（同点は同順位、次は人数分飛ばす）。
// undefined のスコアはランク対象外（rank=undefined）として末尾に。
export function rankBy<T>(
  items: T[],
  getScore: (t: T) => number | undefined,
): Array<{ item: T; rank: number | undefined; score: number | undefined }> {
  const result = items.map(item => ({ item, score: getScore(item), rank: undefined as number | undefined }));
  // スコア有無で分割
  const withScore = result.filter(r => typeof r.score === 'number');
  const withoutScore = result.filter(r => typeof r.score !== 'number');
  withScore.sort((a, b) => (b.score! - a.score!));
  let lastScore: number | undefined;
  let lastRank = 0;
  withScore.forEach((r, idx) => {
    if (r.score === lastScore) {
      r.rank = lastRank;
    } else {
      r.rank = idx + 1;
      lastScore = r.score;
      lastRank = r.rank;
    }
  });
  return [...withScore, ...withoutScore];
}
