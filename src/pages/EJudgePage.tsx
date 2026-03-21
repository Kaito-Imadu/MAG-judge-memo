import { useParams, useSearchParams } from 'react-router-dom';
import type { Apparatus } from '../types';
import JudgeSheet from '../components/JudgeSheet';

export default function EJudgePage() {
  const { apparatus } = useParams<{ apparatus: string }>();
  const [searchParams] = useSearchParams();
  const currentApparatus = (apparatus?.toUpperCase() ?? 'FX') as Apparatus;
  const eJudgeCount = parseInt(searchParams.get('eCount') ?? '4', 10);

  return <JudgeSheet apparatus={currentApparatus} mode="E" eJudgeCount={eJudgeCount} />;
}
