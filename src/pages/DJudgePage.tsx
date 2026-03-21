import { useState } from 'react';
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
  const hasND = getNDChecklist(currentApparatus).length > 0;
  const [ndOpen, setNdOpen] = useState(false);

  const handleApparatusChange = (a: Apparatus) => {
    navigate(`/judge/${a}/d`, { replace: true });
  };

  return (
    <div className="h-screen flex flex-col bg-bg-light dark:bg-bg-dark overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-primary text-white px-3 py-1 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm">{info.code} {info.name}</span>
          <span className="text-[10px] opacity-60">D審判</span>
        </div>
        <div className="flex items-center gap-1">
          <ApparatusSelector current={currentApparatus} onSelect={handleApparatusChange} />
          <button onClick={() => navigate('/')}
            className="px-2 py-1 min-h-[32px] rounded text-[10px] text-white/70 hover:text-white hover:bg-white/10">
            ホーム
          </button>
        </div>
      </div>

      {/* メイン */}
      <div className="flex-1 min-h-0 relative">
        <HandwritingCanvas />
        {hasND && (
          <NDPanel apparatus={currentApparatus} open={ndOpen} onToggle={() => setNdOpen(!ndOpen)} />
        )}
      </div>

      {/* 下部: 手書きスコアバー */}
      <ScoreBar apparatus={currentApparatus} eScoreCount={1} />
    </div>
  );
}
