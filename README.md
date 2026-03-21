# MAG Judge Memo

体操競技男子（MAG: Men's Artistic Gymnastics）審判向けの採点メモ Web アプリ。
iPad + Apple Pencil での利用に最適化した PWA。

> **Live App:** [https://kaito-imadu.github.io/Tenkai/](https://kaito-imadu.github.io/Tenkai/)

---

## 機能

| 機能 | 説明 |
|------|------|
| **D審判メモ** | 技リスト入力・難度値(DV)・組み合わせ加点(CV)・EG充足チェック → Dスコア自動算出 |
| **E審判メモ** | 技ごとの減点入力（-0.1 / -0.3 / -0.5 / -1.0）→ Eスコア自動算出 |
| **NDパネル** | 種目固有のニュートラルディダクション（ライン減点・タイム減点）を管理 |
| **手書きメモ** | Apple Pencil 対応 Canvas（筆圧感知・3色ペン・消しゴム・Undo/Redo） |
| **スコアボード** | D + E − ND = 決定点をリアルタイム表示 |
| **選手管理** | 選手情報の登録・編集・検索（IndexedDB にローカル保存） |
| **採点履歴** | 過去の採点記録を一覧・フィルター・JSON/CSV エクスポート |
| **完全オフライン** | Service Worker による静的アセットキャッシュ。Wi-Fi 不要 |
| **ダークモード** | 体育館の照明環境に合わせて切替可能 |

### 対応種目（全6種目）

| 種目 | コード | 種目固有ND |
|------|--------|-----------|
| ゆか (Floor Exercise) | FX | ライン減点・タイム減点（70秒） |
| あん馬 (Pommel Horse) | PH | タイム減点 |
| つり輪 (Still Rings) | SR | — |
| 跳馬 (Vault) | VT | — |
| 平行棒 (Parallel Bars) | PB | — |
| 鉄棒 (Horizontal Bar) | HB | — |

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                      iPad Safari / PWA                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐    │
│  │  React   │   │  React   │   │   Pointer Events │    │
│  │  Router  │──▶│  Pages   │──▶│   Canvas (手書き) │    │
│  │ (SPA)    │   │          │   │   Apple Pencil   │    │
│  └──────────┘   └────┬─────┘   └──────────────────┘    │
│                      │                                   │
│                      ▼                                   │
│  ┌──────────────────────────────────────────────┐       │
│  │           State Management                    │       │
│  │   React useState + Dexie useLiveQuery         │       │
│  └───────────────────┬──────────────────────────┘       │
│                      │                                   │
│                      ▼                                   │
│  ┌──────────────────────────────────────────────┐       │
│  │             Dexie.js (IndexedDB)              │       │
│  │  ┌──────────┐        ┌──────────────────┐    │       │
│  │  │ gymnasts │        │     records      │    │       │
│  │  │ (選手)   │◀──────▶│ (採点レコード)   │    │       │
│  │  └──────────┘        └──────────────────┘    │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Service Worker (Workbox)  — 静的アセットキャッシュ      │
└─────────────────────────────────────────────────────────┘

            サーバー通信: なし（完全オフライン）
```

### 画面構成

```
HomePage (種目選択 + D/E切替)
  ├── EJudgePage (E審判メモ: 2ペイン)
  │     ├── DeductionInput (減点入力)
  │     ├── NDPanel (ND管理)
  │     ├── ScoreBoard (スコア表示)
  │     └── HandwritingCanvas (手書き)
  ├── DJudgePage (D審判メモ: 2ペイン)
  │     ├── SkillList (技リスト)
  │     ├── NDPanel
  │     ├── ScoreBoard
  │     └── HandwritingCanvas
  ├── PlayerListPage (選手管理 CRUD)
  └── HistoryPage (採点履歴 + エクスポート)
```

---

## 採点構造

```
決定点 (Final Score) = Dスコア + Eスコア − ND

  Dスコア = 難度値合計(DV) + 組み合わせ加点(CV) + EG加点
  Eスコア = 10.000 − 減点合計
  ND      = ニュートラルディダクション（種目固有）
```

### E審判 減点値

| 区分 | 値 |
|------|----|
| 小欠点 (Small) | −0.1 |
| 中欠点 (Medium) | −0.3 |
| 大欠点 (Large) | −0.5 |
| 転倒 / 落下 (Fall) | −1.0 |

---

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フレームワーク | React 19 + TypeScript (strict) |
| ビルド | Vite 8 |
| スタイリング | Tailwind CSS 4 |
| ローカルDB | Dexie.js (IndexedDB ラッパー) |
| ルーティング | React Router v7 |
| 手書き入力 | HTML5 Canvas + Pointer Events API |
| PWA | vite-plugin-pwa (Workbox) |
| デプロイ | GitHub Pages (GitHub Actions) |

---

## セットアップ

```bash
# クローン
git clone https://github.com/Kaito-Imadu/Tenkai.git
cd Tenkai

# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build

# ビルドプレビュー
npm run preview

# 型チェック
npx tsc --noEmit
```

---

## 使い方

1. **ホーム画面**でD審判 / E審判モードを選択
2. **種目グリッド**（FX / PH / SR / VT / PB / HB）から種目をタップ
3. **採点画面**（2ペイン構成）で左側に採点入力、右側に手書きメモ
4. **スコアボード**にリアルタイムでスコアが反映
5. 採点データはすべて **IndexedDB にローカル保存**（オフライン対応）
6. **採点履歴**から過去データの確認・JSON/CSVエクスポートが可能

### iPad での利用

- Safari で上記 URL を開き「ホーム画面に追加」→ スタンドアロン PWA として動作
- 横向き（Landscape）で最適化されたレイアウト
- Apple Pencil で手書きメモ、指でUI操作（パームリジェクション対応）

---

## ディレクトリ構成

```
src/
├── main.tsx              # エントリーポイント
├── App.tsx               # ルーティング定義
├── pages/                # ページコンポーネント
├── components/           # 再利用コンポーネント
├── db/                   # Dexie DB 定義
├── types/                # TypeScript 型定義
├── hooks/                # カスタムフック
├── constants/            # 種目・減点値定数
└── utils/                # エクスポート等ユーティリティ
```

---

## 参考資料

| 資料 | 用途 |
|------|------|
| [FIG Code of Points MAG 2025-2028](https://www.gymnastics.sport/site/rules/) | 採点ルール・減点体系・ND定義の根拠 |
| [FIG Newsletter #1 / #2 / #3](https://www.gymnastics.sport/site/rules/) | ルール追加・修正の最新情報 |
| [Dexie.js Documentation](https://dexie.org/) | IndexedDB ラッパーの API リファレンス |
| [Pointer Events API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) | Apple Pencil の筆圧・pointerType 判定 |
| [Workbox (Google)](https://developer.chrome.com/docs/workbox/) | Service Worker によるオフラインキャッシュ戦略 |
| [Tailwind CSS v4](https://tailwindcss.com/docs) | ユーティリティファースト CSS |

---

## ライセンス

MIT
