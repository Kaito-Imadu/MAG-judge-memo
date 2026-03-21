import { useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type { Apparatus, DeductionType } from '../types';
import { DEDUCTION_VALUES } from '../types';
import { E_DEDUCTION_BUTTONS } from '../constants/deductions';
import ScoreBoard from '../components/ScoreBoard';
import ApparatusSelector from '../components/ApparatusSelector';
import NDPanel from '../components/NDPanel';
import HandwritingCanvas from '../components/HandwritingCanvas';

interface SkillDeduction {
  type: DeductionType | null;
  note: string;
}

const DEFAULT_SKILL_COUNT = 10;

export default function EJudgePage() {
  const { apparatus } = useParams<{ apparatus: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const currentApparatus = (apparatus?.toUpperCase() ?? 'FX') as Apparatus;
  const eJudgeCount = parseInt(searchParams.get('eCount') ?? '4', 10);

  // 自分の採点
  const [skills, setSkills] = useState<SkillDeduction[]>(
    Array.from({ length: DEFAULT_SKILL_COUNT }, () => ({ type: null, note: '' }))
  );
  const [ndChecked, setNdChecked] = useState<Set<string>>(new Set());
  const [dScoreInput, setDScoreInput] = useState('');

  // 他E審判のスコア
  const [otherEScores, setOtherEScores] = useState<string[]>(
    Array.from({ length: eJudgeCount - 1 }, () => '')
  );

  // 減点計算
  const totalDeductions = skills.reduce(
    (sum, s) => sum + (s.type ? DEDUCTION_VALUES[s.type] : 0), 0
  );
  const eScore = Math.max(0, 10.0 - totalDeductions);
  const dScore = dScoreInput ? parseFloat(dScoreInput) : undefined;

  const toggleDeduction = (index: number, type: DeductionType) => {
    setSkills((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        type: next[index].type === type ? null : type,
      };
      return next;
    });
  };

  const updateNote = (index: number, note: string) => {
    setSkills((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], note };
      return next;
    });
  };

  const addSkillRow = () => {
    setSkills((prev) => [...prev, { type: null, note: '' }]);
  };

  const toggleND = useCallback((label: string) => {
    setNdChecked((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }, []);

  const updateOtherEScore = (index: number, value: string) => {
    setOtherEScores((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleApparatusChange = (a: Apparatus) => {
    navigate(`/judge/${a}/e?eCount=${eJudgeCount}`, { replace: true });
  };

  return (
    <div className="h-screen flex flex-col bg-bg-light dark:bg-bg-dark overflow-hidden">
      {/* スコアボード */}
      <ScoreBoard
        apparatus={currentApparatus}
        dScore={dScore}
        eScore={eScore}
        ndTotal={0}
      />

      {/* メインエリア: 2ペイン */}
      <div className="flex-1 flex min-h-0">
        {/* 左ペイン: 採点入力（大きめ） */}
        <div className="flex-[3] flex flex-col min-h-0 border-r border-gray-200 dark:border-gray-700">
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {/* Dスコア入力 */}
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Dスコア</label>
              <input
                type="number"
                step="0.001"
                value={dScoreInput}
                onChange={(e) => setDScoreInput(e.target.value)}
                placeholder="—"
                className="w-20 px-2 py-1 border rounded text-sm text-center bg-white dark:bg-gray-800
                           dark:text-gray-100 dark:border-gray-600"
              />
              <div className="ml-auto text-sm font-bold text-primary dark:text-accent">
                E: {eScore.toFixed(3)}
                <span className="ml-2 text-xs text-gray-500">
                  (減点合計: -{totalDeductions.toFixed(1)})
                </span>
              </div>
            </div>

            {/* 技ごとの減点行 */}
            {skills.map((skill, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="w-6 text-xs text-gray-400 text-right shrink-0">{i + 1}</span>
                <input
                  type="text"
                  value={skill.note}
                  onChange={(e) => updateNote(i, e.target.value)}
                  placeholder="技名"
                  className="w-20 px-1 py-1 border rounded text-xs bg-white dark:bg-gray-800
                             dark:text-gray-100 dark:border-gray-600 shrink-0"
                />
                {E_DEDUCTION_BUTTONS.map((btn) => (
                  <button
                    key={btn.type}
                    onClick={() => toggleDeduction(i, btn.type)}
                    className={`min-w-[48px] h-10 rounded font-bold text-sm transition-colors ${
                      skill.type === btn.type
                        ? btn.type === 'FALL'
                          ? 'bg-danger text-white'
                          : 'bg-primary text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            ))}
            <button
              onClick={addSkillRow}
              className="text-xs text-accent hover:underline mt-1"
            >
              + 行を追加
            </button>

            {/* NDパネル */}
            <div className="mt-3">
              <NDPanel apparatus={currentApparatus} checked={ndChecked} onToggle={toggleND} />
            </div>

            {/* 他E審判のスコア欄 */}
            {eJudgeCount > 1 && (
              <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">
                  他E審判スコア
                </div>
                <div className="flex flex-wrap gap-2">
                  {otherEScores.map((val, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">E{i + 2}</span>
                      <input
                        type="number"
                        step="0.001"
                        value={val}
                        onChange={(e) => updateOtherEScore(i, e.target.value)}
                        placeholder="—"
                        className="w-16 px-1 py-1 border rounded text-xs text-center bg-white
                                   dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
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
