# MAG Judge Memo

体操競技男子（MAG: Men's Artistic Gymnastics）審判向けの採点メモ Web アプリ。
iPad + Apple Pencil での利用に最適化した PWA。完全オフライン動作・サーバーレス。

> **Live App:** [https://kaito-imadu.github.io/MAG-judge-memo/](https://kaito-imadu.github.io/MAG-judge-memo/)

---

## PWA としてインストールする方法

本アプリは PWA（Progressive Web App）対応で、ホーム画面に追加するとネイティブアプリのように動作します。**Wi-Fi がない体育館でも完全オフラインで使えます。**

### iPad / iPhone（Safari）

1. Safari で [https://kaito-imadu.github.io/MAG-judge-memo/](https://kaito-imadu.github.io/MAG-judge-memo/) を開く
2. 画面下部（または上部）の **共有ボタン**（□↑）をタップ
3. **「ホーム画面に追加」** をタップ
4. 名前を確認して **「追加」** をタップ
5. ホーム画面に「MAG Memo」アイコンが追加される

> **ポイント:**
> - インストール後はアドレスバーなしのフルスクリーンで起動
> - 横向き（Landscape）に最適化されたレイアウト
> - Apple Pencil で手書き、指で UI 操作（パームリジェクション対応）
> - 一度ページを開けば、以降はオフラインで動作（Service Worker がアセットをキャッシュ）

### Android（Chrome）

1. Chrome で上記 URL を開く
2. アドレスバーの **「インストール」** バナー、またはメニュー（⋮）→ **「アプリをインストール」** をタップ
3. ホーム画面にアイコンが追加される

### PC（Chrome / Edge）

1. ブラウザで上記 URL を開く
2. アドレスバー右端の **インストールアイコン**（⊕）をクリック
3. 「インストール」を確認

### オフライン動作について

- 初回アクセス時に Service Worker が全ての静的アセット（HTML/CSS/JS/画像）と Google Fonts をキャッシュ
- 2回目以降はネットワーク接続なしで完全に動作
- 採点データはすべて端末内の IndexedDB に保存されるため、サーバー通信は一切不要
- アプリが更新された場合、次回オンライン時に自動で最新版に更新（`registerType: 'autoUpdate'`）

---

## 機能

### 3つのモード

| モード | 用途 | 説明 |
|--------|------|------|
| **試技会モード** | 練習・試技会 | 選手を登録し、選手ごとに全6種目の採点メモを管理 |
| **大会モード** | 公式大会 | 種目を1つ固定し、ページ制で選手を次々と採点 |
| **個別モード** | 単発の採点 | セッション内で種目を自由に切替、ページ制で柔軟に採点 |

セッション作成時に「審判（D / E / D/E）」と「E審判人数（1〜6人）」を設定可能（個別モードは自動で D/E 固定）。D審判モードでも E審判人数を設定でき、決定点の桁数や団体集計に使用されます。

#### 試技会モード

- 左ペインで選手を追加・削除・選択
- 選手を選ぶと右ペインに 6種目（FX/PH/SR/VT/PB/HB）のタイルが表示され、種目をタップして採点画面へ
- ストロークが1本でも保存済みの種目には「済」マークが自動で付く
- **選手一覧の順位＋AA合計バッジ**: デジタルスコアを入力した選手は決定点合計のAA順位がリアルタイム表示
- **🏆 ランキングモーダル**: ヘッダーから開くと「AA」「種目別（D / E決定 / 決定点でソート）」の2タブで全選手のランキングを表示
- **採点結果を共有**: 選手の全6種目メモを 1枚のPNG画像（3×2 グリッド）に合成して共有・ダウンロード
  - iOS/Android では Web Share API で直接 LINE / AirDrop / メール等に共有可能
  - 非対応環境では自動でダウンロードにフォールバック
  - PNG下端にデジタルスコアもテキストとして焼き込み

#### 大会モード

- セッション作成時に種目を1つ選択（例: FX）+ 団体スコア用の **採用人数 N（1〜10）** を設定
- 画面上部に種目名と選手名 / 番号の手書き記入枠を表示
- **デジタル選手名フィールド**: ツールバーに選手名のテキスト入力欄。ランキングや集計に使用（手書き枠とは独立して保存）
- **🏆 順位ボタン**: ツールバーから決定点 / D / E決定でソートした個人ランキング、団体ローテが1つでもあれば「個人 / 団体」タブ切替
- **ページ追加の2つの方法**:
  - **「+ 次の選手」**: 空ページを1枚追加（ローテ未登録扱い）
  - **「+ ローテ追加」**: 4〜10名を改行区切りで一括入力 → N枚のページを自動生成。同モーダルで **団体として登録** トグルをONにすると団体名を付与でき、団体ランキング集計の対象になる（同名団体は別扱い）
- セッション作成直後は自動でローテ追加モーダルが立ち上がる（×ボタンで閉じることも可）
- **「一覧」** ボタンで全ページのサムネイルプレビューをローテーション単位でグルーピング表示
  - 各ページの手書きメモを実データから縮小描画。採点状況を一目で確認
  - 団体名バッジ / 個人エントリー / ローテ未登録 でセクション分け
  - タップで任意のページにジャンプ
- **団体ランキング**: セッション設定の N で「上位N人の決定点合計」を計算。決定点 / D / E決定 / 平均 のメトリクス切替に対応、メンバー数 < N の団体は参考表示（順位なし）。展開行で採用/控えメンバーの内訳を可視化。専用PNGで共有可能

#### 個別モード

- セッション名のみで作成でき、審判設定は自動で D/E 固定
- ツールバーの **種目タブ**（FX/PH/SR/VT/PB/HB）で種目をワンタップ切替
- 大会モードと同じページ制 + サムネイル一覧モーダルに対応
- セッション内で種目 × ページの組み合わせごとに独立して保存

### 採点画面（共通）

| 機能 | 説明 |
|------|------|
| **手書きメモ** | Apple Pencil 対応の全画面キャンバス。2層 Canvas（Static + Active 非同期レイヤー）で 120-240Hz の入力にも滑らかに追従 |
| **デジタルスコア入力** | Canvas下部に薄型2段バー。上段=E1..EN、下段=D / E決定 / ND / 加点(+0.1) / 決定点。セルタップで専用テンキーがポップアップ |
| **E決定の自動計算** | E審判人数に応じてハードコード計算（1〜3人=全員平均 / 4〜5人=高低カット平均）。手動上書き可 |
| **決定点の自動計算** | `D + E決定 − ND + (+0.1?)` を自動算出。手動上書き可 |
| **3色ペン** | 黒 / 赤 / 青をワンタップ切替（小さめの丸ボタン） |
| **線の太さ** | スライダーで 0.5〜6px を無段階調整（Apple Pencil の筆圧にも対応） |
| **消しゴム** | 角丸正方形のアイコンボタン。ON 中はストロークをなぞって削除、使用後は自動でペンに戻る |
| **Undo / Redo / 全消去** | 履歴を持ち、取り消し・やり直し・全消去に対応 |
| **2本指ダブルタップ Undo** | ペンを持ったまま、もう一方の指で画面を素早く2本指ダブルタップ → 直前操作を取消 |
| **直線モード** | ペンを 1.5 秒長押しすると、開始点から現在位置への直線プレビューに自動切替 |
| **スクラブ消去** | 消しゴムモード不要。ストローク上で素早く左右 3 往復以上すると、そのストロークを削除 |
| **テンプレート背景** | ND項目、CV欄が種目に応じて自動表示（後述） |
| **種目タブ切替** | ツールバー右側の種目タブで種目をワンタップ切替（試技会・個別モード） |
| **自動保存** | 描画内容＋デジタルスコアを IndexedDB に自動保存（1.5 秒デバウンス + 画面離脱時即時フラッシュ） |
| **パームリジェクション** | `pointerType === 'pen'` のみ描画、`touch` は UI 操作（2本指 Undo 以外は無視） |
| **ダークモード** | OS / ブラウザ設定に追従（`class` ベース） |

### 対応種目（MAG 全 6 種目）

| 種目 | コード | 種目固有テンプレート |
|------|--------|----------------------|
| ゆか | **FX** | ND 8項目（ライン / タイム / コンポジション 6項目）+ CV 欄 |
| あん馬 | **PH** | ND 1項目（タイム） |
| つり輪 | **SR** | ND 1項目（振動から倒立静止技） |
| 跳馬 | **VT** | ND 1項目（ライン減点）+ 跳馬の**背景画像**（左右反転 / 50〜150% サイズ変更、localStorage に設定永続化） |
| 平行棒 | **PB** | （なし） |
| 鉄棒 | **HB** | CV 欄 |

### 審判モードと E 審判人数

- **D 審判**: D スコア欄のみ（E審判人数は決定点桁数・団体集計に使用するため設定可能）
- **E 審判**: E1〜En（1〜6人）+ E決定（自動計算 or 手動上書き）
- **D/E 両方**: 両方のスコア欄を表示

### 全体設定（SettingsModal）

- **文字の太さ**: 0.5〜6px のデフォルトペン太さ
- **横線を最初から入れる**: 新規メモを開いたとき自動で横線を1本入れる
- **横線の長さ**: 横線の右端位置（50〜100%）
- **ゆかの初期横線**: 自動横線がONかつゆかの場合、1本 or 2本を選択可能

---

## 採点構造

決定点（Final Score）＝ **D スコア** ＋ **E決定** − **ND** ＋ **加点(+0.1)**

- **D スコア** ＝ 難度値 (DV) + 組み合わせ加点 (CV) + エレメントグループ (EG)
- **E スコア** ＝ 10.000 − 減点合計
- **E決定** ＝ E審判人数に応じた集計値
  - **1〜3人**: 全員の平均
  - **4〜5人**: 最高点と最低点を1つずつ除外し、残りを平均
- **ND** ＝ 種目固有のニュートラルディダクション（ライン / タイム / コンポジション）
- **加点 +0.1** ＝ 該当時に決定点へ +0.1

E 審判の減点区分（参考）:

| 区分 | 減点値 |
|------|--------|
| 小欠点 | -0.1 |
| 中欠点 | -0.3 |
| 大欠点 | -0.5 |
| 転倒 / 落下 | -1.0 |

---

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フレームワーク | React 19 + TypeScript 5.9 (strict) |
| ビルド | Vite 8 |
| スタイリング | Tailwind CSS 4（`@tailwindcss/vite` プラグイン） |
| ローカル DB | Dexie.js 4（IndexedDB ラッパー） |
| ルーティング | React Router v7（HashRouter — GitHub Pages SPA 対応） |
| 手書き入力 | HTML5 Canvas 2層構造 + Pointer Events API + `getCoalescedEvents()` + `desynchronized` |
| 消去ヒット判定 | 独自空間インデックス（グリッドセル 40px）で O(1) 近似探索 |
| PWA | vite-plugin-pwa（Workbox ベース、`autoUpdate`） |
| デプロイ | GitHub Pages（GitHub Actions による自動デプロイ） |

### 描画パイプラインの工夫

- **2 層 Canvas**: 確定済みストロークを描く Static レイヤーと、入力中のストロークだけを描く Active レイヤー（`desynchronized: true`）を重ね、再描画コストを最小化
- **インクリメンタル曲線描画**: 入力中は新しい点だけを Active レイヤーに追加描画し、確定時に Static レイヤーへ 1 本の二次ベジェ曲線として再描画
- **空間グリッドインデックス**: 全ストロークを 40px グリッドに登録し、消しゴム / スクラブ消去時のヒット判定を O(候補数) に
- **`getCoalescedEvents()`**: Apple Pencil の高頻度入力（120-240Hz）を 1 フレーム内で取りこぼさず全て取得
- **DPR 対応**: `devicePixelRatio` に応じて Canvas のバッキングストアを拡大、Retina でも鮮明
- **エクスポート共通化**: 画面描画と PNG エクスポートは `src/utils/renderSheet.ts` の同一関数を共有、ピクセル単位で一致

---

## アーキテクチャ

<p align="center">
  <img src="docs/architecture.svg" alt="Architecture Diagram" width="720" />
</p>

### 画面構成

<p align="center">
  <img src="docs/screen-structure.svg" alt="Screen Structure" width="600" />
</p>

### ルーティング（HashRouter）

```
/                                                  EntryPage（モード選択・セッション管理）
/trial/:sessionId                                  TrialPage（選手 × 種目ダッシュボード）
/trial/:sessionId/judge/:athlete/:apparatus        TrialJudgePage（試技会採点画面）
/competition/:sessionId                            CompetitionPage（大会モード・ページ制）
/individual/:sessionId                             IndividualPage（個別モード・ページ制）
```

### IndexedDB スキーマ（Dexie v5）

```ts
sessions: 'id, date, mode'
// Session = {
//   id, name, date,
//   mode: 'trial' | 'competition' | 'individual',
//   judgeMode: 'D' | 'E' | 'D/E',
//   eJudgeCount: number,           // 1..6
//   apparatus?: Apparatus,          // competition モード時のみ
//   athletes: string[],
//   teamScoring?: TeamScoring,     // v5: 大会モードの団体スコア設定
// }

memoRecords: 'id, sessionId, apparatus, [sessionId+apparatus], [sessionId+pageNumber]'
// MemoRecord = {
//   id, sessionId, athleteName, apparatus, pageNumber,
//   strokes: StrokeData[],
//   lines?,                          // 横線
//   canvasW?, canvasH?,              // エクスポート座標系復元用
//   digitalScores?: DigitalScores,   // v4: D / E1..EN / ND / 加点 / E決定/決定点 の手動上書き
//   digitalAthleteName?: string,     // v4: 大会モード用デジタル選手名
//   rotationId?: string,             // v5: 紐付くローテーション
//   updatedAt,
// }

rotations: 'id, sessionId, [sessionId+order]'
// Rotation = {
//   id, sessionId,
//   order: number,                   // セッション内の追加順
//   athletes: string[],              // 1〜10名
//   teamName?: string,               // 団体登録ON時のみ
//   startPage: number,               // 先頭ページ番号
//   createdAt,
// }

// TeamScoring = { topN: number }    // 上位N合計 (1〜10)
// DigitalScores = {
//   d?: number; e: (number|undefined)[]; nd?: number;
//   bonus: boolean; eFinalManual?: number; finalManual?: number;
// }
```

レコード ID は用途ごとに以下の規則で生成:

| モード | `recordId` 形式 |
|--------|-----------------|
| 試技会 | `trial:<sessionId>:<athleteName>:<apparatus>` |
| 大会 | `comp:<sessionId>:<pageNumber>` |
| 個別 | `individual:<sessionId>:<apparatus>:<pageNumber>` |

---

## セットアップ（開発者向け）

```bash
# クローン
git clone https://github.com/Kaito-Imadu/MAG-judge-memo.git
cd MAG-judge-memo

# 依存関係インストール
npm install

# 開発サーバー起動（http://localhost:5173）
npm run dev

# プロダクションビルド（tsc -b → vite build）
npm run build

# ビルドプレビュー
npm run preview

# 型チェックのみ
npx tsc --noEmit

# ESLint
npm run lint

# PWA アイコン再生成
node scripts/generate-icons.mjs
```

`main` ブランチへの push で GitHub Actions が自動的にビルド・GitHub Pages へデプロイします（`.github/workflows/deploy.yml`）。Vite 側は `base: '/MAG-judge-memo/'` でサブパス対応済み。

---

## ディレクトリ構成

```
src/
├── main.tsx                    # エントリーポイント + Service Worker 登録
├── App.tsx                     # ルーティング定義（HashRouter）
├── index.css                   # Tailwind エントリー + テーマ変数
├── pages/
│   ├── EntryPage.tsx           # モード選択・セッション作成・過去セッション一覧
│   ├── TrialPage.tsx           # 試技会モード（選手一覧 + 順位バッジ + 種目ダッシュボード + 共有）
│   ├── TrialJudgePage.tsx      # 試技会 採点画面ラッパー
│   ├── CompetitionPage.tsx     # 大会モード（ページナビ + デジタル選手名 + サムネイル一覧）
│   └── IndividualPage.tsx      # 個別モード（種目タブ + ページナビ + サムネイル一覧）
├── components/
│   ├── JudgeSheet.tsx          # メイン採点コンポーネント（2層 Canvas + ツールバー + ScoreInputBar）
│   ├── ScoreInputBar.tsx       # Canvas下部の薄型2段デジタルスコア入力バー
│   ├── ScoreNumpad.tsx         # セルタップ時に表示される専用テンキー
│   ├── RankingModal.tsx        # 試技会(AA/種目別)・大会(個人/団体)のランキングモーダル
│   ├── AddRotationModal.tsx    # 大会モードのローテーション一括登録モーダル
│   └── SettingsModal.tsx       # 全体設定（ペン太さ・自動横線・ゆかの初期横線本数 など）
├── hooks/
│   └── useSessionScores.ts     # Dexie Live Query でセッション内全スコア取得＋順位付け + 団体集計
├── db/
│   └── database.ts             # Dexie DB 定義（sessions, memoRecords, rotations）— v5 で団体機能対応
├── types/
│   └── index.ts                # 全型定義（DigitalScores 含む）
├── constants/
│   ├── apparatus.ts            # 6種目定義 + ND 種別マッピング
│   └── deductions.ts           # E 審判減点値 + ND 定義
└── utils/
    ├── scoreCalc.ts            # E決定 / 決定点の計算ロジック
    ├── settings.ts             # 全体設定の load/save (localStorage)
    ├── renderSheet.ts          # テンプレート描画の共通ロジック（画面とエクスポートで共有）
    ├── exportSheet.ts          # PNG 画像エクスポート（6種目合成 + 単種目）+ Web Share API 共有
    └── exportRanking.ts        # ランキング PNG エクスポート（AA / 種目別 / 団体）
```

---

## 参考資料

| 資料 | 用途 |
|------|------|
| [FIG Code of Points MAG 2025-2028](https://www.gymnastics.sport/site/rules/) | 採点ルール・減点体系・ND 定義の根拠 |
| [Dexie.js Documentation](https://dexie.org/) | IndexedDB ラッパーの API リファレンス |
| [Pointer Events API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) | Apple Pencil の筆圧・`pointerType` 判定 |
| [Workbox (Google)](https://developer.chrome.com/docs/workbox/) | Service Worker によるオフラインキャッシュ戦略 |

---

## ライセンス

MIT
