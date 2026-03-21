import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Apparatus } from '../types';
import ScoreBoard from '../components/ScoreBoard';
import ApparatusSelector from '../components/ApparatusSelector';
import NDPanel from '../components/NDPanel';
import HandwritingCanvas from '../components/HandwritingCanvas';

interface SkillEntry {
  name: string;
  difficulty: string; // 数値文字列
}

const DIFFICULTY_OPTIONS = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const DIFF_VALUES: Record<string, number> = {
  A: 0.1, B: 0.2, C: 0.3, D: 0.4, E: 0.5, F: 0.6, G: 0.7, H: 0.8, I: 0.9,
};

const DEFAULT_SKILL_COUNT = 10;

export default function DJudgePage() {
  const { apparatus } = useParams<{ apparatus: string }>();
  const navigate = useNavigate();
  const currentApparatus = (apparatus?.toUpperCase() ?? 'FX') as Apparatus;

  const [skills, setSkills] = useState<SkillEntry[]>(
    Array.from({ length: DEFAULT_SKILL_COUNT }, () => ({ name: '', difficulty: '' }))
  );
  const [cv, setCv] = useState('');
  const [egBonus, setEgBonus] = useState('');
  const [ndChecked, setNdChecked] = useState<Set<string>>(new Set());

  // DV合計
  const dvTotal = skills.reduce(
    (sum, s) => sum + (DIFF_VALUES[s.difficulty] ?? 0), 0
  );
  const cvVal = cv ? parseFloat(cv) : 0;
  const egVal = egBonus ? parseFloat(egBonus) : 0;
  const dScore = dvTotal + cvVal + egVal;

  const updateSkill = (index: number, field: keyof SkillEntry, value: string) => {
    setSkills((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addSkillRow = () => {
    setSkills((prev) => [...prev, { name: '', difficulty: '' }]);
  };

  const toggleND = useCallback((label: string) => {
    setNdChecked((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }, []);

  const handleApparatusChange = (a: Apparatus) => {
    navigate(`/judge/${a}/d`, { replace: true });
  };

  return (
    <div className="h-screen flex flex-col bg-bg-light dark:bg-bg-dark overflow-hidden">
      {/* スコアボード */}
      <ScoreBoard apparatus={currentApparatus} dScore={dScore > 0 ? dScore : undefined} />

      {/* メインエリア */}
      <div className="flex-1 flex min-h-0">
        {/* 左ペイン: 技リスト */}
        <div className="flex-[3] flex flex-col min-h-0 border-r border-gray-200 dark:border-gray-700">
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {/* Dスコア表示 */}
            <div className="flex items-center gap-3 mb-2">
              <div className="text-sm font-bold text-primary dark:text-accent">
                D: {dScore.toFixed(3)}
              </div>
              <span className="text-xs text-gray-500">
                DV: {dvTotal.toFixed(1)} + CV: {cvVal.toFixed(1)} + EG: {egVal.toFixed(1)}
              </span>
            </div>

            {/* 技リスト */}
            {skills.map((skill, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="w-6 text-xs text-gray-400 text-right shrink-0">{i + 1}</span>
                <input
                  type="text"
                  value={skill.name}
                  onChange={(e) => updateSkill(i, 'name', e.target.value)}
                  placeholder="技名"
                  className="flex-1 min-w-0 px-2 py-1 border rounded text-xs bg-white dark:bg-gray-800
                             dark:text-gray-100 dark:border-gray-600"
                />
                <select
                  value={skill.difficulty}
                  onChange={(e) => updateSkill(i, 'difficulty', e.target.value)}
                  className="w-14 h-10 border rounded text-sm text-center bg-white dark:bg-gray-800
                             dark:text-gray-100 dark:border-gray-600 font-bold"
                >
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d || '—'}</option>
                  ))}
                </select>
              </div>
            ))}
            <button
              onClick={addSkillRow}
              className="text-xs text-accent hover:underline mt-1"
            >
              + 行を追加
            </button>

            {/* CV / EG */}
            <div className="flex gap-3 mt-3">
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-500">CV</label>
                <input
                  type="number"
                  step="0.1"
                  value={cv}
                  onChange={(e) => setCv(e.target.value)}
                  placeholder="0.0"
                  className="w-16 px-1 py-1 border rounded text-sm text-center bg-white dark:bg-gray-800
                             dark:text-gray-100 dark:border-gray-600"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-500">EG加点</label>
                <input
                  type="number"
                  step="0.1"
                  value={egBonus}
                  onChange={(e) => setEgBonus(e.target.value)}
                  placeholder="0.0"
                  className="w-16 px-1 py-1 border rounded text-sm text-center bg-white dark:bg-gray-800
                             dark:text-gray-100 dark:border-gray-600"
                />
              </div>
            </div>

            {/* NDパネル */}
            <div className="mt-3">
              <NDPanel apparatus={currentApparatus} checked={ndChecked} onToggle={toggleND} />
            </div>
          </div>
        </div>

        {/* 右ペイン: 手書きメモ */}
        <div className="flex-[2] flex flex-col min-h-0 p-2">
          <HandwritingCanvas />
        </div>
      </div>

      {/* 下部バー */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <ApparatusSelector current={currentApparatus} onSelect={handleApparatusChange} />
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 min-h-[44px] rounded-lg text-gray-500 hover:bg-gray-100
                     dark:hover:bg-gray-700 text-sm"
        >
          ホームへ
        </button>
      </div>
    </div>
  );
}
