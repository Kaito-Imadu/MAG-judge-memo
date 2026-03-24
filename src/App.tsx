import { HashRouter, Routes, Route } from 'react-router-dom';
import EntryPage from './pages/EntryPage';
import TrialPage from './pages/TrialPage';
import TrialJudgePage from './pages/TrialJudgePage';
import CompetitionPage from './pages/CompetitionPage';
import IndividualPage from './pages/IndividualPage';
import IndividualJudgePage from './pages/IndividualJudgePage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<EntryPage />} />
        <Route path="/trial/:sessionId" element={<TrialPage />} />
        <Route path="/trial/:sessionId/judge/:athlete/:apparatus" element={<TrialJudgePage />} />
        <Route path="/competition/:sessionId" element={<CompetitionPage />} />
        <Route path="/individual/:sessionId" element={<IndividualPage />} />
        <Route path="/individual/:sessionId/judge/:athlete/:apparatus" element={<IndividualJudgePage />} />
      </Routes>
    </HashRouter>
  );
}
