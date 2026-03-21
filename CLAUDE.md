# CLAUDE.md — MAG Judge Memo App

## プロジェクト概要
体操競技男子（MAG）審判向けの採点メモ PWA アプリ。
iPad + Apple Pencil での利用を想定。完全オフライン動作。

## 技術スタック
- React 18+ / TypeScript / Vite
- Tailwind CSS（スタイリング）
- Dexie.js（IndexedDB ラッパー）
- vite-plugin-pwa（Service Worker / Manifest）— Phase 3 で導入
- HTML5 Canvas + Pointer Events API（手書きメモ）
- React Router（画面遷移）

## アーキテクチャ
- **サーバーレス**: バックエンド・外部APIは一切不要
- **全データはIndexedDB**: 選手情報・採点記録・手書きメモ（Base64）すべてローカル保存
- **PWA**: Service Worker で静的アセットをキャッシュし、オフラインで完全動作

## ディレクトリ構成
```
src/
├── main.tsx                    # エントリーポイント
├── App.tsx                     # ルーティング定義
├── pages/                      # ページコンポーネント
│   ├── HomePage.tsx            # 種目選択・モード切替・ホーム
│   ├── DJudgePage.tsx          # D審判メモ画面
│   ├── EJudgePage.tsx          # E審判メモ画面
│   ├── PlayerListPage.tsx      # 選手一覧・登録
│   └── HistoryPage.tsx         # 採点履歴
├── components/                 # 再利用コンポーネント
│   ├── ApparatusSelector.tsx   # 6種目選択タブ
│   ├── ScoreBoard.tsx          # スコアボード（常時表示）
│   ├── NDPanel.tsx             # ND確認パネル（種目固有）
│   ├── DeductionInput.tsx      # E審判 減点入力
│   ├── SkillList.tsx           # D審判 技リスト入力
│   ├── HandwritingCanvas.tsx   # 手書きメモ Canvas
│   └── PlayerForm.tsx          # 選手登録フォーム
├── db/                         # データベース
│   ├── database.ts             # Dexie DB定義
│   └── seeds.ts                # 初期データ（ND定義等）
├── types/                      # 型定義
│   └── index.ts                # 全型定義
├── hooks/                      # カスタムフック
│   ├── useScoreCalculation.ts  # スコア計算ロジック
│   └── useHandwriting.ts       # Canvas 手書きロジック
├── constants/                  # 定数
│   ├── apparatus.ts            # 種目定義
│   └── deductions.ts           # 減点値定義
└── utils/                      # ユーティリティ
    └── export.ts               # JSON/CSVエクスポート
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
| 転倒 | -1.0 |
| 落下 | -1.0 |

## UI/UX 原則
1. iPad Landscape（横向き）メインレイアウト
2. 左ペイン: 採点入力 / 右ペイン: 手書きメモ の2カラム構成
3. タッチターゲット 44px 以上（競技中の素早い操作）
4. ダークモード対応（体育館の明るさに応じて切替）
5. スワイプで次の選手へ移動
6. Apple Pencil のパームリジェクション対応

## Canvas 手書きメモ実装ルール
- Pointer Events API を使用（pointerdown / pointermove / pointerup）
- pointerType === 'pen' で Apple Pencil を判別
- pressure プロパティで筆圧による線の太さ変更
- touch-action: none を Canvas 要素に設定
- ペン色: 黒・赤・青（3色切替）
- 消しゴム・Undo/Redo 機能
- 描画データは toDataURL('image/png', 0.5) で圧縮して Base64 保存

## コーディングルール
- TypeScript strict モード
- コンポーネントは関数コンポーネント + Hooks
- 状態管理はローカル state + Dexie の useLiveQuery
- CSS は Tailwind ユーティリティクラスのみ（カスタムCSS最小限）
- 日本語UIテキストはハードコード可（i18n不要）
