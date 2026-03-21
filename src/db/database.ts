import Dexie, { type EntityTable } from 'dexie';
import type { Gymnast, JudgingRecord } from '../types';

export interface StrokePoint { x: number; y: number }
export interface StrokeData { points: StrokePoint[]; color: string }
export interface SheetSave {
  key: string;          // e.g. "FX_D" or "FX_E_4"
  strokes: StrokeData[];
  updatedAt: Date;
}

const db = new Dexie('MAGJudgeDB') as Dexie & {
  gymnasts: EntityTable<Gymnast, 'id'>;
  records: EntityTable<JudgingRecord, 'id'>;
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

export { db };
