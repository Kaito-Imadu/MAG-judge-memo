import Dexie, { type EntityTable } from 'dexie';
import type { Gymnast, JudgingRecord } from '../types';

const db = new Dexie('MAGJudgeDB') as Dexie & {
  gymnasts: EntityTable<Gymnast, 'id'>;
  records: EntityTable<JudgingRecord, 'id'>;
};

db.version(1).stores({
  gymnasts: 'id, name, team, createdAt',
  records: 'id, gymnastId, apparatus, judgeMode, date, competition, [gymnastId+apparatus]',
});

export { db };
