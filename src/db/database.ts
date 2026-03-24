import Dexie, { type EntityTable } from 'dexie';
import type { Apparatus } from '../types';

export interface StrokePoint { x: number; y: number }
export interface StrokeData { points: StrokePoint[]; color: string; width?: number }

export interface Session {
  id: string;
  name: string;
  date: Date;
  mode: 'trial' | 'competition' | 'individual';
  judgeMode: 'D' | 'E';
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

export { db };
