import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Apparatus } from '../types';
import { APPARATUS_MAP } from '../constants/apparatus';
import { getNDChecklist } from '../constants/deductions';
import ApparatusSelector from '../components/ApparatusSelector';
import HandwritingCanvas from '../components/HandwritingCanvas';
import ScoreBar from '../components/ScoreBar';
import NDPanel from '../components/NDPanel';

export default function DJudgePage() {
  const { apparatus } = useParams<{ apparatus: string }>();
  const navigate = useNavigate();
  const currentApparatus = (apparatus?.toUpperCase() ?? 'FX') as Apparatus;
  const info = APPARATUS_MAP[currentApparatus];
  const ndItems = getNDChecklist(currentApparatus);

  const [dScore, setDScore] = useState('');
  const [eScores, setEScores] = useState<string[]>(['']);
  const [nd, setNd] = useState('');
  const [cv, setCv] = useState('');
  const [ndChecked, setNdChecked] = useState<Set<string>>(new Set());
  const [showND, setShowND] = useState(false);

  const handleEScoreChange = (i: number, v: string) => {
    setEScores((prev) => { const n = [...prev]; n[i] = v; return n; });
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
      {/* ヘッダー */}
      <div className="bg-primary text-white px-3 py-1.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold">{info.code} {info.name}</span>
          <span className="text-xs opacity-60">D審判</span>
        </div>
        <div className="flex items-center gap-2">
          <ApparatusSelector current={currentApparatus} onSelect={handleApparatusChange} />
          <button onClick={() => navigate('/')}
            className="px-3 py-1 min-h-[36px] rounded text-xs text-white/70 hover:text-white hover:bg-white/10">
            ホーム
          </button>
        </div>
      </div>

      {/* メイン: 手書きCanvas全面 */}
      <div className="flex-1 min-h-0 relative">
        <HandwritingCanvas />
        {ndItems.length > 0 && (
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={() => setShowND(!showND)}
              className={`px-2 py-1 rounded text-xs font-medium shadow ${
                showND ? 'bg-amber-500 text-white' : 'bg-white/90 dark:bg-gray-800/90 text-amber-600'
              }`}
            >
              ND {ndChecked.size > 0 ? `(${ndChecked.size})` : ''}
            </button>
            {showND && (
              <div className="mt-1">
                <NDPanel apparatus={currentApparatus} checked={ndChecked} onToggle={toggleND} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 下部: スコアバー */}
      <ScoreBar
        apparatus={currentApparatus}
        dScore={dScore}
        eScores={eScores}
        nd={nd}
        cv={cv}
        onDScoreChange={setDScore}
        onEScoreChange={handleEScoreChange}
        onNDChange={setNd}
        onCVChange={setCv}
      />
    </div>
  );
}
