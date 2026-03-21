import { HashRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/judge/:apparatus/:mode" element={<PlaceholderPage title="採点画面" />} />
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
