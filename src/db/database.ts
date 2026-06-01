import Dexie, { type EntityTable } from 'dexie';
import type { Apparatus, DigitalScores } from '../types';

export interface StrokePoint { x: number; y: number }
export interface StrokeData { points: StrokePoint[]; color: string; width?: number }

// 団体スコア設定（大会モード用）— 集計は「上位N合計」固定
export interface TeamScoring {
  topN: number; // 1〜10
}

export interface Session {
  id: string;
  name: string;
  date: Date;
  mode: 'trial' | 'competition' | 'individual';
  judgeMode: 'D' | 'E' | 'D/E';
  eJudgeCount: number;
  apparatus?: Apparatus;
  athletes: string[];
  teamScoring?: TeamScoring;  // 大会モードのみ。未設定なら団体機能なし扱い
}

// ローテーション（大会モードで一括追加された選手グループ）
export interface Rotation {
  id: string;
  sessionId: string;
  order: number;          // セッション内の追加順 (0,1,2,...)
  athletes: string[];     // 1〜10名
  teamName?: string;      // 団体登録ONのときのみ
  startPage: number;      // このローテの最初のページ番号
  createdAt: Date;
}

export interface MemoRecord {
  id: string;
  sessionId: string;
  athleteName: string;
  apparatus: Apparatus;
  pageNumber: number;
  strokes: StrokeData[];
  lines?: Array<{ y: number; right: number }>;  // 横線（Y座標 + 右端X座標）
  canvasW?: number;
  canvasH?: number;
  digitalScores?: DigitalScores;       // デジタルスコア入力（v4 新規）
  digitalAthleteName?: string;         // 大会モード用デジタル選手名（v4 新規）
  rotationId?: string;                 // 紐付くローテーション（v5 新規）
  updatedAt: Date;
}

// 旧テーブル用（後方互換）
export interface SheetSave {
  key: string;
  strokes: StrokeData[];
  updatedAt: Date;
}

const db = new Dexie('MAGJudgeDB') as Dexie & {
  sessions: EntityTable<Session, 'id'>;
  memoRecords: EntityTable<MemoRecord, 'id'>;
  sheets: EntityTable<SheetSave, 'key'>;
  rotations: EntityTable<Rotation, 'id'>;
};

db.version(1).stores({
  gymnasts: 'id, name, team, createdAt',
  records: 'id, gymnastId, apparatus, judgeMode, date, competition, [gymnastId+apparatus]',
});

db.version(2).stores({
  gymnasts: 'id, name, team, createdAt',
  records: 'id, gymnastId, apparatus, judgeMode, date, competition, [gymnastId+apparatus]',
  sheets: 'key, updatedAt',
});

db.version(3).stores({
  gymnasts: 'id, name, team, createdAt',
  records: 'id, gymnastId, apparatus, judgeMode, date, competition, [gymnastId+apparatus]',
  sheets: 'key, updatedAt',
  sessions: 'id, date, mode',
  memoRecords: 'id, sessionId, apparatus, [sessionId+apparatus], [sessionId+pageNumber]',
});

// v4: digitalScores / digitalAthleteName を MemoRecord に追加（インデックス変更なし）
db.version(4).stores({
  gymnasts: 'id, name, team, createdAt',
  records: 'id, gymnastId, apparatus, judgeMode, date, competition, [gymnastId+apparatus]',
  sheets: 'key, updatedAt',
  sessions: 'id, date, mode',
  memoRecords: 'id, sessionId, apparatus, [sessionId+apparatus], [sessionId+pageNumber]',
});

// v5: 大会モードの団体機能 — rotations テーブル追加 + MemoRecord.rotationId
db.version(5).stores({
  gymnasts: 'id, name, team, createdAt',
  records: 'id, gymnastId, apparatus, judgeMode, date, competition, [gymnastId+apparatus]',
  sheets: 'key, updatedAt',
  sessions: 'id, date, mode',
  memoRecords: 'id, sessionId, apparatus, [sessionId+apparatus], [sessionId+pageNumber]',
  rotations: 'id, sessionId, [sessionId+order]',
});

export { db };
