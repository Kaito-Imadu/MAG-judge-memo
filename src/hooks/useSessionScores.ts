import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { MemoRecord } from '../db/database';
import type { Apparatus } from '../types';
import { calcFinal, getEFinal } from '../utils/scoreCalc';

export interface ScoredEntry {
  record: MemoRecord;
  d: number | undefined;
  eFinal: number | undefined;
  nd: number | undefined;
  bonus: boolean;
  final: number | undefined;
}

export interface SessionScores {
  records: MemoRecord[];
  scored: ScoredEntry[];                              // 全 MemoRecord をスコア付きで列挙
  byAthlete: Map<string, Map<Apparatus, ScoredEntry>>; // 試技会用: athleteName → apparatus → entry
}

// セッション内の全 MemoRecord を Live Query で監視し、デジタルスコアと派生値を返す。
export function useSessionScores(sessionId: string | undefined): SessionScores | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return undefined;
    const records = await db.memoRecords.where('sessionId').equals(sessionId).toArray();
    const scored: ScoredEntry[] = records.map(r => {
      const ds = r.digitalScores;
      const entry: ScoredEntry = {
        record: r,
        d: ds?.d,
        eFinal: ds ? getEFinal(ds) : undefined,
        nd: ds?.nd,
        bonus: ds?.bonus ?? false,
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
    return { records, scored, byAthlete };
  }, [sessionId]);
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
