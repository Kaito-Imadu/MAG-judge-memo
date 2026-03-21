import { useParams } from 'react-router-dom';
import type { Apparatus } from '../types';
import JudgeSheet from '../components/JudgeSheet';

export default function DJudgePage() {
  const { apparatus } = useParams<{ apparatus: string }>();
  const currentApparatus = (apparatus?.toUpperCase() ?? 'FX') as Apparatus;

  return <JudgeSheet apparatus={currentApparatus} mode="D" eJudgeCount={1} />;
}
