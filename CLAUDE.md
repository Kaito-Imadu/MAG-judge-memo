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
- HTML5 Canvas + Pointer Events API（手書きメモ）
- vite-plugin-pwa（Phase 3 で導入予定、Vite 8 互換待ち）

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
```

## アーキテクチャ
- **サーバーレス**: バックエンド・外部APIは一切不要
- **全データはIndexedDB**: 選手情報・採点記録・手書きメモ（Base64）すべてローカル保存
- **PWA**: Service Worker で静的アセットをキャッシュし、オフラインで完全動作
- **ルーティング**: HashRouter（GitHub Pages の SPA 制約に対応）

## ディレクトリ構成
```
src/
├── main.tsx              # エントリーポイント
├── App.tsx               # ルーティング定義 (HashRouter)
├── index.css             # Tailwind エントリー + テーマ変数
├── pages/                # ページコンポーネント
│   ├── HomePage.tsx      # 種目選択 (2x3 grid) + D/E審判モード切替
│   ├── DJudgePage.tsx    # D審判メモ画面
│   ├── EJudgePage.tsx    # E審判メモ画面
│   ├── PlayerListPage.tsx # 選手一覧・登録
│   └── HistoryPage.tsx   # 採点履歴
├── components/           # 再利用コンポーネント
├── db/
│   └── database.ts       # Dexie DB定義 (gymnasts, records)
├── types/
│   └── index.ts          # 全型定義
├── hooks/                # カスタムフック
├── constants/
│   ├── apparatus.ts      # 6種目定義 + ND種別マッピング
│   └── deductions.ts     # E審判減点値 + ND定義
└── utils/                # エクスポート等ユーティリティ
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
2. 左ペイン: 採点入力 / 右ペイン: 手書きメモ の2カラム構成
3. タッチターゲット 44px 以上（競技中の素早い操作）
4. ダークモード対応（`dark:` プレフィックス、class ベース切替）
5. スワイプで次の選手へ移動
6. Apple Pencil のパームリジェクション対応

## カラーテーマ（`src/index.css` @theme）
- Primary: `#1B4F72`（ダークブルー）
- Accent: `#2E86C1`（ブルー）
- Success: `#27AE60`（グリーン）
- Danger: `#E74C3C`（レッド）
- Background: `#F8F9FA`（Light）/ `#1A1A2E`（Dark）

## Canvas 手書きメモ実装ルール
- Pointer Events API（pointerdown / pointermove / pointerup）
- `pointerType === 'pen'` で Apple Pencil 判別（finger はスクロール等に使う）
- `pressure` で筆圧による線太さ変更（1〜6px）
- CSS: `touch-action: none; user-select: none;`
- ペン色: 黒・赤・青（3色切替）、消しゴム・Undo/Redo・クリア
- 保存: `canvas.toDataURL('image/png', 0.5)` → IndexedDB

## コーディングルール
- TypeScript strict モード
- 関数コンポーネント + Hooks のみ
- 状態管理: ローカル state + Dexie `useLiveQuery`
- CSS: Tailwind ユーティリティクラスのみ（カスタムCSS最小限）
- 日本語UIテキストはハードコード可（i18n不要）
- コミット規約: `feat:` / `fix:` / `refactor:` / `style:` / `docs:` / `chore:`
