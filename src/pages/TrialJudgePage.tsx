import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import type { Session, MemoRecord } from '../db/database';
import type { Apparatus } from '../types';
import JudgeSheet from '../components/JudgeSheet';
import RankingModal from '../components/RankingModal';
import { APPARATUS_LIST, APPARATUS_MAP } from '../constants/apparatus';
import { renderSheetCanvas, loadVaultImage } from '../utils/renderSheet';
import { calcFinal, getEFinal, formatScore, formatBonus, eFinalDecimals, FINAL_SCORE_DECIMALS } from '../utils/scoreCalc';
import { useSessionScores, rankBy } from '../hooks/useSessionScores';

const THUMB_W = 420;
const THUMB_H = 252;

function drawThumbnail(
  canvas: HTMLCanvasElement,
  rec: MemoRecord | undefined,
  apparatus: Apparatus,
  athleteName: string,
  eJudgeCount: number,
  vaultImg: HTMLImageElement | null,
) {
  const c = canvas.getContext('2d');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = THUMB_W * dpr;
  canvas.height = THUMB_H * dpr;
  c.scale(dpr, dpr);
  c.clearRect(0, 0, THUMB_W, THUMB_H);

  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, THUMB_W, THUMB_H);

  const srcW = rec?.canvasW ?? 1024;
  const srcH = rec?.canvasH ?? 700;
  const sheet = renderSheetCanvas({
    w: srcW,
    h: srcH,
    apparatus,
    eJudgeCount,
    mode: 'trial',
    athleteName,
    strokes: rec?.strokes ?? [],
    lines: rec?.lines,
    vaultImg: apparatus === 'VT' ? vaultImg : null,
    digitalScores: rec?.digitalScores,
  });
  const sheetW = sheet.width;
  const sheetH = sheet.height;
  const scale = Math.min(THUMB_W / sheetW, THUMB_H / sheetH);
  const drawW = sheetW * scale;
  const drawH = sheetH * scale;
  const dx = (THUMB_W - drawW) / 2;
  const dy = (THUMB_H - drawH) / 2;
  c.drawImage(sheet, dx, dy, drawW, drawH);
}

function ThumbCard({ rec, apparatus, athleteName, eJudgeCount, vaultImg, isActive, onClick, rank }: {
  rec: MemoRecord | undefined;
  apparatus: Apparatus;
  athleteName: string;
  eJudgeCount: number;
  vaultImg: HTMLImageElement | null;
  isActive: boolean;
  onClick: () => void;
  rank?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawThumbnail(canvasRef.current, rec, apparatus, athleteName, eJudgeCount, vaultImg);
    }
  }, [rec, apparatus, athleteName, eJudgeCount, vaultImg]);

  const ds = rec?.digitalScores;
  const eFinalVal = ds ? getEFinal(ds) : undefined;
  const finalVal = ds ? calcFinal(ds, apparatus) : undefined;
  const decimals = ds ? eFinalDecimals(ds.e) : (eJudgeCount <= 3 ? 2 : 3);

  return (
    <div
      className={`flex flex-col items-center gap-0.5 p-1 rounded-lg border-2 transition-all
                  ${
        isActive
          ? 'border-accent bg-accent/5 shadow-md'
          : 'border-gray-200 dark:border-gray-700 hover:border-accent/50 hover:shadow'
      }`}>
      <button onClick={onClick} className="w-full active:scale-95 relative">
        <canvas ref={canvasRef}
          style={{ width: '100%', aspectRatio: `${THUMB_W} / ${THUMB_H}` }}
          className="rounded" />
        {rank !== undefined && (
          <span
            className={`absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-xs font-bold leading-tight shadow
                        ${rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                          rank === 2 ? 'bg-gray-300 text-gray-800' :
                          rank === 3 ? 'bg-amber-600 text-white' :
                                       'bg-primary text-white'}`}
          >
            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}位`}
          </span>
        )}
      </button>
      <div className="flex items-center gap-1 w-full px-1 mt-1">
        <button onClick={onClick}
          className={`text-sm font-bold truncate flex-1 text-left ${
            isActive ? 'text-accent' : 'text-gray-700 dark:text-gray-200'
          }`}>
          {athleteName}
        </button>
        {rec && rec.strokes.length > 0 && (
          <span className="text-success text-[11px] font-bold shrink-0">済</span>
        )}
      </div>
      {ds && (
        <div className="flex items-center gap-2 w-full px-1 text-xs font-mono text-gray-600 dark:text-gray-400">
          <span>D <span className="font-bold text-gray-800 dark:text-gray-200">{formatScore(ds.d, 1) || '-'}</span></span>
          <span>E <span className="font-bold text-gray-800 dark:text-gray-200">{formatScore(eFinalVal, decimals) || '-'}</span></span>
          <span>ND <span className="font-bold text-gray-800 dark:text-gray-200">{formatScore(ds.nd ?? 0, 1)}</span></span>
          {ds.bonus && <span className="text-success font-bold">{formatBonus(ds.bonusValue ?? 0.1)}</span>}
          <span className="ml-auto text-primary dark:text-accent font-bold text-sm">{formatScore(finalVal, FINAL_SCORE_DECIMALS) || '-'}</span>
        </div>
      )}
    </div>
  );
}

export default function TrialJudgePage() {
  const { sessionId, athlete, apparatus } = useParams<{
    sessionId: string;
    athlete: string;
    apparatus: string;
  }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [showListPanel, setShowListPanel] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [listApparatus, setListApparatus] = useState<Apparatus>('FX');
  const [listQuery, setListQuery] = useState('');
  const [vaultImg, setVaultImg] = useState<HTMLImageElement | null>(null);
  const data = useSessionScores(sessionId);

  const athleteName = decodeURIComponent(athlete ?? '');
  const currentApparatus = (apparatus?.toUpperCase() ?? 'FX') as Apparatus;

  useEffect(() => {
    if (sessionId) db.sessions.get(sessionId).then(s => { if (s) setSession(s); });
  }, [sessionId]);

  // VT 画像はサムネで使うので遅延ロード（一度ロードしたらキャッシュ）
  useEffect(() => {
    if (vaultImg) return;
    if (listApparatus === 'VT' || currentApparatus === 'VT') {
      loadVaultImage().then(setVaultImg);
    }
  }, [listApparatus, currentApparatus, vaultImg]);

  // 現在の listApparatus の選手一覧（決定点で順位付け）
  const listRows = useMemo(() => {
    if (!session) return [];
    const rows = session.athletes.map(name => {
      const e = data?.byAthlete.get(name)?.get(listApparatus);
      return { name, entry: e, score: e?.final };
    });
    return rankBy(rows, r => r.score);
  }, [data, session, listApparatus]);

  // 選手名での絞り込み。順位は全体で付けたものをそのまま残す
  const visibleListRows = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return listRows;
    return listRows.filter(r => r.item.name.toLowerCase().includes(q));
  }, [listRows, listQuery]);

  if (!session || !sessionId) return null;

  const recordId = `trial:${sessionId}:${athleteName}:${currentApparatus}`;

  const handleApparatusChange = (a: Apparatus) => {
    navigate(`/trial/${sessionId}/judge/${encodeURIComponent(athleteName)}/${a}`, { replace: true });
  };

  const jumpTo = (name: string, a: Apparatus) => {
    setShowListPanel(false);
    navigate(`/trial/${sessionId}/judge/${encodeURIComponent(name)}/${a}`, { replace: true });
  };

  // 種目はそのままに、登録順で前後の選手へ移動する。
  // 名前変更などで一覧に無い選手を開いている場合は -1 になり、前後とも無効。
  const athleteIndex = session.athletes.indexOf(athleteName);
  const athleteCount = session.athletes.length;
  const canGoPrevAthlete = athleteIndex > 0;
  const canGoNextAthlete = athleteIndex >= 0 && athleteIndex < athleteCount - 1;
  const goPrevAthlete = () => {
    if (canGoPrevAthlete) jumpTo(session.athletes[athleteIndex - 1], currentApparatus);
  };
  const goNextAthlete = () => {
    if (canGoNextAthlete) jumpTo(session.athletes[athleteIndex + 1], currentApparatus);
  };
  const openListPanel = () => { setListApparatus(currentApparatus); setListQuery(''); setShowListPanel(true); };

  const toolbarExtra = (
    <>
      <div className="w-px h-4 bg-gray-300" />
      {/* 選手送り（現在の種目のまま移動） */}
      <button onClick={goPrevAthlete} disabled={!canGoPrevAthlete}
        title="前の選手"
        aria-label="前の選手"
        className="px-3 py-1 rounded-lg text-base font-bold bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 min-h-[44px] min-w-[44px] hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300">
        ◀
      </button>
      <button onClick={openListPanel}
        title="選手一覧を開く"
        className="text-xs text-gray-600 dark:text-gray-300 font-mono min-w-[44px] text-center
                   hover:bg-gray-200 dark:hover:bg-gray-600 rounded px-1 py-0.5 min-h-[28px]">
        {athleteIndex >= 0 ? athleteIndex + 1 : '-'} / {athleteCount}
      </button>
      <button onClick={goNextAthlete} disabled={!canGoNextAthlete}
        title="次の選手"
        aria-label="次の選手"
        className="px-3 py-1 rounded-lg text-base font-bold bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 min-h-[44px] min-w-[44px] hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300">
        ▶
      </button>
      <div className="w-px h-4 bg-gray-300" />
      <button onClick={openListPanel}
        title="一覧を表示"
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold min-h-[44px]
                   bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
        <span>📋</span>
        <span>一覧</span>
      </button>
      <button onClick={() => setShowRanking(true)}
        title="ランキングを表示"
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold min-h-[44px]
                   bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600">
        <span>🏆</span>
        <span>順位</span>
      </button>
    </>
  );

  return (
    <>
      <JudgeSheet
        apparatus={currentApparatus}
        judgeMode={session.judgeMode}
        eJudgeCount={session.eJudgeCount}
        recordId={recordId}
        sessionId={sessionId}
        sessionName={session.name}
        mode="trial"
        athleteName={athleteName}
        pageNumber={0}
        showApparatusTabs={true}
        onApparatusChange={handleApparatusChange}
        onBack={() => navigate(`/trial/${sessionId}`)}
        onHome={() => navigate('/')}
        toolbarExtra={toolbarExtra}
      />

      {showListPanel && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center overlay-inset"
             onClick={() => setShowListPanel(false)}>
          <div onClick={e => e.stopPropagation()}
               className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-full flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0 flex-wrap">
              <h3 className="font-bold text-primary dark:text-accent text-base shrink-0">選手一覧</h3>
              <div className="flex gap-1 flex-wrap">
                {APPARATUS_LIST.map(a => (
                  <button key={a.code} onClick={() => setListApparatus(a.code)}
                    className={`px-2.5 py-1.5 rounded text-xs font-bold min-h-[36px] ${
                      listApparatus === a.code
                        ? 'bg-accent text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                    }`}>
                    {a.code}
                  </button>
                ))}
              </div>
              <input
                value={listQuery}
                onChange={e => setListQuery(e.target.value)}
                placeholder="選手名で検索"
                className="w-40 px-2.5 py-1.5 min-h-[36px] rounded-lg text-sm
                           bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200
                           border border-gray-300 dark:border-gray-600
                           focus:outline-none focus:border-accent"
              />
              {listQuery && (
                <button onClick={() => setListQuery('')}
                  className="px-2 py-1.5 min-h-[36px] text-xs text-gray-500 hover:text-gray-700 shrink-0">
                  クリア
                </button>
              )}
              <button onClick={() => { setShowListPanel(false); setShowRanking(true); }}
                className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold min-h-[36px]
                           bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600
                           text-gray-600 dark:text-gray-300 hover:bg-gray-200 shrink-0">
                <span>🏆</span>順位表
              </button>
              <button onClick={() => setShowListPanel(false)}
                className="text-gray-400 hover:text-gray-600 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0">
                ×
              </button>
            </div>
            <div className="px-5 py-1.5 text-xs text-gray-500 dark:text-gray-400 shrink-0 border-b border-gray-100 dark:border-gray-700/50">
              {APPARATUS_MAP[listApparatus].name}（{listApparatus}） / {
                listQuery.trim() ? `${visibleListRows.length} 名（全 ${listRows.length} 名）` : `${listRows.length} 名`
              }
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {visibleListRows.length === 0 ? (
                <div className="text-center text-sm text-gray-400 italic py-8">
                  {listQuery.trim() ? '該当する選手がいません' : '選手が登録されていません'}
                </div>
              ) : (
                <div className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_W + 12}px, 1fr))` }}>
                  {visibleListRows.map(r => {
                    const isActive = r.item.name === athleteName && listApparatus === currentApparatus;
                    return (
                      <ThumbCard
                        key={r.item.name}
                        rec={r.item.entry?.record}
                        apparatus={listApparatus}
                        athleteName={r.item.name}
                        eJudgeCount={session.eJudgeCount}
                        vaultImg={vaultImg}
                        isActive={isActive}
                        rank={r.rank}
                        onClick={() => jumpTo(r.item.name, listApparatus)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showRanking && (
        <RankingModal
          sessionId={sessionId}
          sessionName={session.name}
          sessionDate={session.date}
          mode="trial"
          athletes={session.athletes}
          eJudgeCount={session.eJudgeCount}
          onClose={() => setShowRanking(false)}
        />
      )}
    </>
  );
}
