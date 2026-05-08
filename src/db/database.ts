import Dexie, { type EntityTable } from 'dexie';
import type { Apparatus, DigitalScores } from '../types';

export interface StrokePoint { x: number; y: number }
export interface StrokeData { points: StrokePoint[]; color: string; width?: number }

export interface Session {
  id: string;
  name: string;
  date: Date;
  mode: 'trial' | 'competition' | 'individual';
  judgeMode: 'D' | 'E' | 'D/E';
  eJudgeCount: number;
  apparatus?: Apparatus;
  athletes: string[];
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
  digitalAthleteNumber?: number;       // 大会モード用ゼッケン番号（v4 新規）
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

export { db };
