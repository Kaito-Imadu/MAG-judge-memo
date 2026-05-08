// 種目
export type Apparatus = 'FX' | 'PH' | 'SR' | 'VT' | 'PB' | 'HB';

// 大会モード用: 選手番号（ゼッケン等）。number で保持、表示は文字列扱いも考慮。
export type AthleteNumber = number | undefined;

// デジタルスコア（D, E1..EN, ND, 加点, E決定/決定点の手動上書き）
export interface DigitalScores {
  d?: number;                    // Dスコア（手入力）
  e: (number | undefined)[];     // E1..EN（length=eJudgeCount、最大5）
  nd?: number;                   // ND（手入力）
  bonus: boolean;                // +0.1 加点フラグ
  eFinalManual?: number;         // E決定の手動上書き（未指定なら e から自動計算）
  finalManual?: number;          // 決定点の手動上書き（未指定なら自動計算）
}

// 審判モード
export type JudgeMode = 'D_JUDGE' | 'E_JUDGE';

// 減点区分
export type DeductionType = 'SMALL' | 'MEDIUM' | 'LARGE' | 'FALL';

export const DEDUCTION_VALUES: Record<DeductionType, number> = {
  SMALL: 0.1,
  MEDIUM: 0.3,
  LARGE: 0.5,
  FALL: 1.0,
};

// 選手
export interface Gymnast {
  id: string;
  name: string;
  team: string;
  bib?: string;
  createdAt: Date;
}

// E審判 減点項目
export interface Deduction {
  skillIndex: number;
  type: DeductionType;
  value: number;
  note?: string;
}

// ND項目
export type NDType = 'LINE' | 'TIME' | 'COMPOSITION';

export interface NDItem {
  type: NDType;
  value: number;
  detail?: string;
}

// ND定義（種目ごと）
export interface NDDefinition {
  apparatus: Apparatus;
  type: NDType;
  label: string;
}

// 採点レコード
export interface JudgingRecord {
  id: string;
  gymnastId: string;
  apparatus: Apparatus;
  judgeMode: JudgeMode;

  // Dスコア関連
  dScore?: number;
  skills?: string[];

  // Eスコア関連
  eDeductions: Deduction[];
  eScore?: number;

  // ND
  ndItems: NDItem[];
  ndTotal: number;

  // 最終
  finalScore?: number;

  // メモ
  canvasData?: string;
  memo?: string;

  // メタ
  competition?: string;
  date: Date;
  updatedAt: Date;
}
