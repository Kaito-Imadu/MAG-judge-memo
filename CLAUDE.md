# CLAUDE.md — MAG Judge Memo App

## プロジェクト概要
体操競技男子（MAG）審判向けの採点メモ PWA アプリ。
iPad + Apple Pencil での利用を想定。完全オフライン動作。
GitHub Pages にデプロイ: https://kaito-imadu.github.io/MAG-judge-memo/

## 技術スタック
- React 19 / TypeScript 5.9 (strict) / Vite 8
- Tailwind CSS 4（`@tailwindcss/vite` プラグイン）
- Dexie.js 4（IndexedDB ラッパー）
- React Router v7（HashRouter — GitHub Pages 対応）
- HTML5 Canvas + Pointer Events API + `getCoalescedEvents()`（手書きメモ）
- vite-plugin-pwa（Workbox による SW 生成・precache）

## デプロイ
- GitHub Actions → GitHub Pages（`.github/workflows/deploy.yml`）
- `main` ブランチへの push で自動デプロイ
- `vite.config.ts` の `base: '/MAG-judge-memo/'` でサブパス対応

## ビルド・開発コマンド
```bash
npm run dev        # 開発サーバー (http://localhost:5173)
npm run build      # プロダクションビルド (dist/)
npm run preview    # ビルドプレビュー
npx tsc --noEmit   # 型チェック
npm run lint       # ESLint
node scripts/generate-icons.mjs  # PWAアイコン再生成
```

## アーキテクチャ
- **サーバーレス**: バックエンド・外部APIは一切不要
- **全データはIndexedDB**: セッション・採点メモ（ストロークデータ）・ローテーション すべてローカル保存
- **PWA**: vite-plugin-pwa (Workbox) で静的アセットを precache、Google Fonts を CacheFirst キャッシュ
- **ルーティング**: HashRouter（GitHub Pages の SPA 制約に対応）
- **セッションベース**: 試技会モード（選手×種目）・大会モード（種目固定×ローテーション×ページ制）・個別モード（種目×ページ）の3モード
- **大会モードの団体機能**: ローテーション単位で選手を一括登録し、団体名を付与すると団体ランキング集計の対象になる

## ディレクトリ構成
```
src/
├── main.tsx              # エントリーポイント + Service Worker 登録
├── App.tsx               # ルーティング定義 (HashRouter)
├── index.css             # Tailwind エントリー + テーマ変数
├── pages/
│   ├── EntryPage.tsx     # モード選択・セッション作成・過去セッション一覧
│   ├── TrialPage.tsx     # 試技会モード（選手一覧 + 順位バッジ + 種目ダッシュボード + SNS共有）
│   ├── TrialJudgePage.tsx # 試技会 採点画面ラッパー
│   ├── CompetitionPage.tsx # 大会モード（ローテ単位選手登録 + 団体バッジ + サムネ一覧）
│   └── IndividualPage.tsx # 個別モード（種目タブ + ページナビ）
├── components/
│   ├── JudgeSheet.tsx    # メイン採点コンポーネント（2層Canvas + ツールバー + ScoreInputBar）
│   ├── ScoreInputBar.tsx # Canvas下部の薄型2段デジタルスコア入力バー
│   ├── ScoreNumpad.tsx   # セルタップ時の専用テンキーポップアップ
│   ├── RankingModal.tsx  # 試技会(AA/種目別)・大会(個人/団体)のランキングモーダル
│   ├── AddRotationModal.tsx # 大会モードのローテ一括登録（選手名+団体トグル）
│   └── SettingsModal.tsx # 全体設定モーダル
├── hooks/
│   └── useSessionScores.ts # Dexie useLiveQuery でセッション内全スコア取得＋順位付け＋団体集計
├── db/
│   └── database.ts       # Dexie DB定義 (sessions, memoRecords, rotations)
├── types/
│   └── index.ts          # 全型定義 (DigitalScores 含む)
├── constants/
│   ├── apparatus.ts      # 6種目定義 + ND種別マッピング
│   └── deductions.ts     # E審判減点値 + ND定義
└── utils/
    ├── scoreCalc.ts      # E決定 / 決定点 の計算ロジック
    ├── settings.ts       # 全体設定 (penWidth, autoHorizontalLine, fxDefaultHorizontalLines 等)
    ├── renderSheet.ts    # テンプレート描画の共通ロジック（画面とエクスポートで共有）
    ├── exportSheet.ts    # PNG画像エクスポート（6種目合成）+ Web Share API 共有
    └── exportRanking.ts  # ランキングPNGエクスポート（AA / 種目別 / 団体）
```

## DB スキーマ (Dexie v5)
```typescript
sessions: 'id, date, mode'
// Session: { id, name, date, mode('trial'|'competition'|'individual'),
//            judgeMode('D'|'E'|'D/E'), eJudgeCount(1..6), apparatus?, athletes[],
//            teamScoring?: TeamScoring }  // v5: 大会モード団体スコア設定
// TeamScoring: { topN: number }            // 上位N合計 (1〜10)

memoRecords: 'id, sessionId, apparatus, [sessionId+apparatus], [sessionId+pageNumber]'
// MemoRecord: {
//   id, sessionId, athleteName, apparatus, pageNumber,
//   strokes: StrokeData[], lines?,
//   canvasW?, canvasH?,
//   digitalScores?: DigitalScores,    // v4 新規
//   digitalAthleteName?: string,      // v4 新規（大会モード用）
//   rotationId?: string,              // v5 新規（紐付くローテーション）
//   updatedAt,
// }

rotations: 'id, sessionId, [sessionId+order]'  // v5 新規
// Rotation: {
//   id, sessionId,
//   order: number,                    // セッション内の追加順
//   athletes: string[],               // 1〜10名
//   teamName?: string,                // 団体登録ONのときのみ
//   startPage: number,                // このローテの先頭ページ番号
//   createdAt: Date,
// }

// DigitalScores: {
//   d?, e: (number|undefined)[], nd?,
//   bonus: boolean,                    // +0.1 加点フラグ
//   eFinalManual?, finalManual?,       // 自動計算の手動上書き
// }
```

## ルーティング
```
/                           → EntryPage（モード選択・セッション管理）
/trial/:sessionId           → TrialPage（選手×種目ダッシュボード + 順位バッジ）
/trial/:sessionId/judge/:athlete/:apparatus → TrialJudgePage（採点画面）
/competition/:sessionId     → CompetitionPage（ページ制採点 + デジタル選手名）
/individual/:sessionId      → IndividualPage（個別モード・ページ制）
```

## 対応種目（全6種目）
| 種目 | コード | 種目固有ND |
|------|--------|-----------|
| ゆか（Floor Exercise） | FX | ライン減点・タイム減点（70秒） |
| あん馬（Pommel Horse） | PH | タイム減点 |
| つり輪（Still Rings） | SR | なし |
| 跳馬（Vault） | VT | なし（跳越番号制） |
| 平行棒（Parallel Bars） | PB | なし |
| 鉄棒（Horizontal Bar） | HB | なし |

## 採点構造
決定点（Final Score）= Dスコア + E決定 − ND + 加点(+0.1)
- Dスコア = 難度値(DV) + 組み合わせ加点(CV) + エレメントグループ(EG)
- Eスコア = 10.000 − 減点合計
- E決定（`src/utils/scoreCalc.ts`）= E審判人数に応じた集計
  - 1〜3人: 全員平均
  - 4〜5人: 高低カット平均（最高1・最低1除外）
- ND = 種目固有のニュートラルディダクション
- 加点 = +0.1 のON/OFFトグル（あれば決定点に加算）

## E審判の減点値
| 区分 | 減点値 |
|------|--------|
| 小欠点 | -0.1 |
| 中欠点 | -0.3 |
| 大欠点 | -0.5 |
| 転倒 / 落下 | -1.0 |

## 大会モードのローテーション / 団体機能
- **ローテーション**: 試合で回ってくる選手グループ（1〜10名）を1単位として登録。`Rotation` テーブル
- **作成手段**:
  - `+ ローテ追加`: 改行区切りで複数名を一括入力 → N枚のメモページを自動生成
  - `+ 次の選手`: 空ページを1枚追加（ローテ未登録扱い）
- **編集**: ページ一覧パネルのローテーション見出しから `編集` ボタンで `EditRotationModal` を開き、選手の追加・削除・並べ替え・任意位置への挿入・リネーム・団体名変更・他ローテからの選手「移入」が可能。移入を含む保存時は全ローテーションのページ番号と startPage を再構築。既存ページの採点メモは originalIdx / sourceRecordId ベースで引き継がれる
- **団体登録**: ローテ追加モーダル内のトグルでON。団体名をセットすると、そのローテのメンバーが団体ランキング集計対象になる
- **団体スコア計算**: セッション作成時に「採用人数 N (1〜10)」を指定。各団体の **上位N人の決定点合計** （メトリック切替で D / E決定 / 平均 にも対応）
- **同名団体**: 別ローテで同じ団体名（前後空白除く）を入れると、団体ランキングでは同一チームに合算される（メンバーを連結して上位N人を採用）
- **人数不足**: メンバー数 < N の団体は参考表示（順位なし）
- **rotationId 保持**: `JudgeSheet` の自動保存は `db.memoRecords.put()` で全フィールド上書きするため、`rotationId` を props で受け取り保存時に保持する必要がある。フォールバックとして `Rotation.startPage` 範囲でも紐付け解決する

## UI/UX 原則
1. iPad Landscape（横向き）メインレイアウト
2. Canvas はメモ用、スコアはCanvas下部の `ScoreInputBar`（薄型2段）でデジタル入力
3. タッチターゲット 44px 以上（競技中の素早い操作）
4. ダークモード対応（`dark:` プレフィックス、class ベース切替）
5. Apple Pencil のパームリジェクション対応（`pointerType` で pen/touch を分離）
6. 数値入力は `ScoreNumpad`（専用テンキー）でセルタップ → ポップアップ。OK で次セルへフォーカス遷移

## カラーテーマ（`src/index.css` @theme）
- Primary: `#1B4F72`（ダークブルー）
- Accent: `#2E86C1`（ブルー）
- Success: `#27AE60`（グリーン）
- Danger: `#E74C3C`（レッド）
- Background: `#F8F9FA`（Light）/ `#1A1A2E`（Dark）

## Canvas 手書きメモ実装ルール
- **ネイティブ DOM イベント**（`addEventListener`、React synthetic events は使わない）
- `activePointerId` で描画中のポインターを追跡（タッチ干渉防止）
- `getCoalescedEvents()` で Apple Pencil の高頻度入力（120-240Hz）を全取得
- `requestAnimationFrame` で直線モード描画を最適化
- `pointerType === 'pen'` で Apple Pencil 判別
- `pressure` で筆圧による線太さ変更（1〜6px）
- CSS: `touch-action: none; user-select: none;`（Canvas と親 div 両方に設定）
- ペン色: 黒・赤・青（3色切替）、消しゴム・Undo/Redo・クリア
- 保存: StrokeData（座標配列）を IndexedDB に保存（1秒デバウンス + 画面離脱時即時保存）

## PWA 設定
- `vite.config.ts` で `VitePWA({ registerType: 'autoUpdate' })` を設定
- Workbox: 静的アセット precache + Google Fonts CacheFirst キャッシュ
- `index.html`: Apple メタタグ（`apple-mobile-web-app-capable`, `black-translucent`, `apple-touch-icon`）
- `src/main.tsx`: `registerSW()` で Service Worker 自動登録・自動更新
- アイコン: `public/icon-192x192.png`, `public/icon-512x512.png`（`scripts/generate-icons.mjs` で生成）
- マニフェスト: `display: standalone`, `orientation: landscape`

## コーディングルール
- TypeScript strict モード
- 関数コンポーネント + Hooks のみ
- 状態管理: ローカル state + Dexie `useLiveQuery`
- CSS: Tailwind ユーティリティクラスのみ（カスタムCSS最小限）
- 日本語UIテキストはハードコード可（i18n不要）
- コミット規約: `feat:` / `fix:` / `refactor:` / `style:` / `docs:` / `chore:`
- **バージョン更新**: 変更をmergeするたびに `package.json` の `version` を更新すること。規模に応じてメジャー/マイナー/パッチを判断（新機能=マイナー、バグ修正=パッチ）
