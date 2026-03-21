import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APPARATUS_LIST } from '../constants/apparatus';
import type { JudgeMode, Apparatus } from '../types';

export default function HomePage() {
  const navigate = useNavigate();
  const [judgeMode, setJudgeMode] = useState<JudgeMode>('E_JUDGE');
  const [showECountModal, setShowECountModal] = useState(false);
  const [selectedApparatus, setSelectedApparatus] = useState<Apparatus | null>(null);
  const [eJudgeCount, setEJudgeCount] = useState(4);

  const handleApparatusClick = (code: Apparatus) => {
    if (judgeMode === 'E_JUDGE') {
      setSelectedApparatus(code);
      setShowECountModal(true);
    } else {
      navigate(`/judge/${code}/d`);
    }
  };

  const handleECountConfirm = () => {
    if (selectedApparatus) {
      navigate(`/judge/${selectedApparatus}/e?eCount=${eJudgeCount}`);
    }
    setShowECountModal(false);
  };

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col">
      {/* ヘッダー */}
      <header className="bg-primary text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">MAG Judge Memo</h1>
        <div className="flex items-center gap-0">
          <button
            onClick={() => setJudgeMode('D_JUDGE')}
            className={`px-5 py-2 rounded-l-lg font-semibold min-h-[44px] transition-colors border border-white/30 ${
              judgeMode === 'D_JUDGE'
                ? 'bg-white text-primary'
                : 'text-white/70 hover:text-white'
            }`}
          >
            D審判
          </button>
          <button
            onClick={() => setJudgeMode('E_JUDGE')}
            className={`px-5 py-2 rounded-r-lg font-semibold min-h-[44px] transition-colors border border-white/30 border-l-0 ${
              judgeMode === 'E_JUDGE'
                ? 'bg-white text-primary'
                : 'text-white/70 hover:text-white'
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

      {/* E審判人数選択モーダル */}
      {showECountModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
             onClick={() => setShowECountModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl min-w-[320px]"
               onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
              E審判の人数
            </h2>
            <div className="flex items-center justify-center gap-4 mb-6">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => setEJudgeCount(n)}
                  className={`w-12 h-12 rounded-lg font-bold text-lg transition-colors ${
                    eJudgeCount === n
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowECountModal(false)}
                className="flex-1 py-2 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600
                           text-gray-600 dark:text-gray-300 font-medium"
              >
                キャンセル
              </button>
              <button
                onClick={handleECountConfirm}
                className="flex-1 py-2 min-h-[44px] rounded-lg bg-primary text-white font-bold"
              >
                開始
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
