# CLAUDE.md — MAG Judge Memo App

## プロジェクト概要
体操競技男子（MAG）審判向けの採点メモ PWA アプリ。
iPad + Apple Pencil での利用を想定。完全オフライン動作。
GitHub Pages にデプロイ: https://kaito-imadu.github.io/Tenkai/

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
- `vite.config.ts` の `base: '/Tenkai/'` でサブパス対応

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
- **全データはIndexedDB**: セッション・採点メモ（ストロークデータ）すべてローカル保存
- **PWA**: vite-plugin-pwa (Workbox) で静的アセットを precache、Google Fonts を CacheFirst キャッシュ
- **ルーティング**: HashRouter（GitHub Pages の SPA 制約に対応）
- **セッションベース**: 試技会モード（選手×種目）と大会モード（種目固定×ページ制）の2モード

## ディレクトリ構成
```
src/
├── main.tsx              # エントリーポイント + Service Worker 登録
├── App.tsx               # ルーティング定義 (HashRouter)
├── index.css             # Tailwind エントリー + テーマ変数
├── pages/
│   ├── EntryPage.tsx     # モード選択・セッション作成・過去セッション一覧
│   ├── TrialPage.tsx     # 試技会モード（選手一覧 + 種目ダッシュボード + SNS共有）
│   ├── TrialJudgePage.tsx # 試技会 採点画面ラッパー
│   └── CompetitionPage.tsx # 大会モード（ページナビ + 選手一覧パネル）
├── components/
│   └── JudgeSheet.tsx    # メイン採点コンポーネント（全画面Canvas + ツールバー + テンプレート描画）
├── db/
│   └── database.ts       # Dexie DB定義 (sessions, memoRecords)
├── types/
│   └── index.ts          # 全型定義
├── hooks/                # カスタムフック
├── constants/
│   ├── apparatus.ts      # 6種目定義 + ND種別マッピング
│   └── deductions.ts     # E審判減点値 + ND定義
└── utils/
    └── exportSheet.ts    # PNG画像エクスポート（6種目合成）+ Web Share API 共有
```

## DB スキーマ (Dexie v3)
```typescript
sessions: 'id, date, mode'
// Session: { id, name, date, mode('trial'|'competition'), judgeMode('D'|'E'), eJudgeCount, apparatus?, athletes[] }

memoRecords: 'id, sessionId, apparatus, [sessionId+apparatus], [sessionId+pageNumber]'
// MemoRecord: { id, sessionId, athleteName, apparatus, pageNumber, strokes: StrokeData[], updatedAt }
```

## ルーティング
```
/                           → EntryPage（モード選択・セッション管理）
/trial/:sessionId           → TrialPage（選手×種目ダッシュボード）
/trial/:sessionId/judge/:athlete/:apparatus → TrialJudgePage（採点画面）
/competition/:sessionId     → CompetitionPage（ページ制採点）
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
決定点（Final Score）= Dスコア + Eスコア − ND合計
- Dスコア = 難度値(DV) + 組み合わせ加点(CV) + エレメントグループ(EG)
- Eスコア = 10.000 − 減点合計
- ND = 種目固有のニュートラルディダクション

## E審判の減点値
| 区分 | 減点値 |
|------|--------|
| 小欠点 | -0.1 |
| 中欠点 | -0.3 |
| 大欠点 | -0.5 |
| 転倒 / 落下 | -1.0 |

## UI/UX 原則
1. iPad Landscape（横向き）メインレイアウト
2. 全画面 Canvas にテンプレート（得点欄・ND項目）を背景描画、その上に手書き
3. タッチターゲット 44px 以上（競技中の素早い操作）
4. ダークモード対応（`dark:` プレフィックス、class ベース切替）
5. Apple Pencil のパームリジェクション対応（`pointerType` で pen/touch を分離）

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
