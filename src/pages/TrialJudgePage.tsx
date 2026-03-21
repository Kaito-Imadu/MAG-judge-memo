import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session } from '../db/database';
import type { Apparatus } from '../types';
import JudgeSheet from '../components/JudgeSheet';

export default function TrialJudgePage() {
  const { sessionId, athlete, apparatus } = useParams<{
    sessionId: string;
    athlete: string;
    apparatus: string;
  }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);

  const athleteName = decodeURIComponent(athlete ?? '');
  const currentApparatus = (apparatus?.toUpperCase() ?? 'FX') as Apparatus;

  useEffect(() => {
    if (sessionId) db.sessions.get(sessionId).then(s => { if (s) setSession(s); });
  }, [sessionId]);

  if (!session || !sessionId) return null;

  const recordId = `trial:${sessionId}:${athleteName}:${currentApparatus}`;

  const handleApparatusChange = (a: Apparatus) => {
    navigate(`/trial/${sessionId}/judge/${encodeURIComponent(athleteName)}/${a}`, { replace: true });
  };

  return (
    <JudgeSheet
      apparatus={currentApparatus}
      judgeMode={session.judgeMode}
      eJudgeCount={session.eJudgeCount}
      recordId={recordId}
      sessionId={sessionId}
      mode="trial"
      athleteName={athleteName}
      pageNumber={0}
      showApparatusTabs={true}
      onApparatusChange={handleApparatusChange}
      onBack={() => navigate(`/trial/${sessionId}`)}
    />
  );
}
