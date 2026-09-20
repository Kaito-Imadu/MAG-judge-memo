export interface JudgeSettings {
  penWidth: number;
  autoHorizontalLine: boolean;
  horizontalLineLengthRatio: number;
  // ゆかは2本派もいるため、種目別のデフォルト本数を持つ
  fxDefaultHorizontalLines: number;
  // 画面上端に足す余白(px)。iOS 26+ がステータスバー下に描くぼかし帯から
  // ツールバー／ヘッダーの中身を逃がすために使う
  topInsetExtra: number;
}

const SETTINGS_KEY = 'judge-settings';

export const DEFAULT_JUDGE_SETTINGS: JudgeSettings = {
  penWidth: 2,
  autoHorizontalLine: false,
  horizontalLineLengthRatio: 0.8,
  fxDefaultHorizontalLines: 1,
  topInsetExtra: 24,
};

const TOP_INSET_CSS_VAR = '--app-top-extra';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeJudgeSettings(value: Partial<JudgeSettings> | null | undefined): JudgeSettings {
  return {
    penWidth: clamp(Number(value?.penWidth ?? DEFAULT_JUDGE_SETTINGS.penWidth), 0.5, 6),
    autoHorizontalLine: Boolean(value?.autoHorizontalLine ?? DEFAULT_JUDGE_SETTINGS.autoHorizontalLine),
    horizontalLineLengthRatio: clamp(
      Number(value?.horizontalLineLengthRatio ?? DEFAULT_JUDGE_SETTINGS.horizontalLineLengthRatio),
      0.5,
      1,
    ),
    fxDefaultHorizontalLines: clamp(
      Math.round(Number(value?.fxDefaultHorizontalLines ?? DEFAULT_JUDGE_SETTINGS.fxDefaultHorizontalLines)),
      1,
      2,
    ),
    topInsetExtra: clamp(
      Math.round(Number(value?.topInsetExtra ?? DEFAULT_JUDGE_SETTINGS.topInsetExtra)),
      0,
      64,
    ),
  };
}

/** 上端余白を CSS 変数に流し込む。index.css の --app-top-inset が参照する */
export function applyTopInsetExtra(value: number) {
  document.documentElement.style.setProperty(TOP_INSET_CSS_VAR, `${value}px`);
}

export function loadJudgeSettings(): JudgeSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_JUDGE_SETTINGS;
    return normalizeJudgeSettings(JSON.parse(raw) as Partial<JudgeSettings>);
  } catch {
    return DEFAULT_JUDGE_SETTINGS;
  }
}

export function saveJudgeSettings(next: JudgeSettings): JudgeSettings {
  const normalized = normalizeJudgeSettings(next);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  applyTopInsetExtra(normalized.topInsetExtra);
  return normalized;
}

export function updateJudgeSettings(patch: Partial<JudgeSettings>): JudgeSettings {
  return saveJudgeSettings({ ...loadJudgeSettings(), ...patch });
}
