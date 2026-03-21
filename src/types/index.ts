// 種目
export type Apparatus = 'FX' | 'PH' | 'SR' | 'VT' | 'PB' | 'HB';

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
export type NDType = 'LINE' | 'TIME';

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
  description: string;
  values: number[];
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
