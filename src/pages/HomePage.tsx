import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APPARATUS_LIST } from '../constants/apparatus';
import type { JudgeMode } from '../types';

export default function HomePage() {
  const navigate = useNavigate();
  const [judgeMode, setJudgeMode] = useState<JudgeMode>('E_JUDGE');

  const handleApparatusClick = (code: string) => {
    const mode = judgeMode === 'D_JUDGE' ? 'd' : 'e';
    navigate(`/judge/${code}/${mode}`);
  };

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col">
      {/* ヘッダー */}
      <header className="bg-primary text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">MAG Judge Memo</h1>
        {/* 審判モード切替 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setJudgeMode('D_JUDGE')}
            className={`px-4 py-2 rounded-l-lg font-semibold min-h-[44px] transition-colors ${
              judgeMode === 'D_JUDGE'
                ? 'bg-white text-primary'
                : 'bg-primary-700 text-white/70 border border-white/30'
            }`}
          >
            D審判
          </button>
          <button
            onClick={() => setJudgeMode('E_JUDGE')}
            className={`px-4 py-2 rounded-r-lg font-semibold min-h-[44px] transition-colors ${
              judgeMode === 'E_JUDGE'
                ? 'bg-white text-primary'
                : 'bg-primary-700 text-white/70 border border-white/30'
            }`}
          >
            E審判
          </button>
        </div>
      </header>

      {/* 種目グリッド */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="grid grid-cols-3 gap-4 max-w-2xl w-full">
          {APPARATUS_LIST.map((apparatus) => (
            <button
              key={apparatus.code}
              onClick={() => handleApparatusClick(apparatus.code)}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg
                         border-2 border-transparent hover:border-accent
                         transition-all duration-150
                         flex flex-col items-center justify-center
                         min-h-[120px] p-4 active:scale-95"
            >
              <span className="text-2xl font-bold text-primary dark:text-accent">
                {apparatus.code}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                {apparatus.name}
              </span>
            </button>
          ))}
        </div>
      </main>

      {/* 下部ナビ */}
      <nav className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-center gap-6">
        <button
          onClick={() => navigate('/players')}
          className="px-6 py-2 min-h-[44px] rounded-lg text-primary dark:text-accent
                     hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-colors"
        >
          選手管理
        </button>
        <button
          onClick={() => navigate('/history')}
          className="px-6 py-2 min-h-[44px] rounded-lg text-primary dark:text-accent
                     hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-colors"
        >
          採点履歴
        </button>
      </nav>
    </div>
  );
}
