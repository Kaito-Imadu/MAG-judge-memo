import { HashRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import EJudgePage from './pages/EJudgePage';
import DJudgePage from './pages/DJudgePage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/judge/:apparatus/e" element={<EJudgePage />} />
        <Route path="/judge/:apparatus/d" element={<DJudgePage />} />
        <Route path="/players" element={<PlaceholderPage title="選手管理" />} />
        <Route path="/history" element={<PlaceholderPage title="採点履歴" />} />
      </Routes>
    </HashRouter>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-primary dark:text-accent">{title}</h1>
        <p className="text-gray-500 mt-2">実装予定</p>
        <a href="#/" className="text-accent underline mt-4 inline-block">ホームへ戻る</a>
      </div>
    </div>
  );
}
